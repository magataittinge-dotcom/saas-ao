"""Étape « Décider » : date limite des questions et « Points à éclaircir » (questions à poser à l'acheteur).

- GET  /{project_id}/date-limite-questions : lecture du RC sans IA (0 €), calculée quand elle est relative à la remise.
- POST /{project_id}/points-a-eclaircir    : « Préparer les questions » pour un AO déjà analysé — Haiku 4.5 sur les seuls
  passages utiles (RC, CCAP, CCTP du lot), résultat ENREGISTRÉ dans `infos_marche` (clé `points_a_eclaircir`, pas de migration).
  Ne décompte AUCUNE unité ; plafonné par minute et par organisation sur 24 h ; un seul appel à la fois par projet.
"""
import asyncio
import logging
import threading
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models.project import TYPE_DPGF, Project, ProjectDocument
from models.user import User
from routers.auth import get_auth_user
from services import couts_ia, points_eclaircir as pe
from services.audit_logger import log_action
from services.critical_fields import parse_french_date
from services.date_questions import RAPPEL_REGLE, trouver_date_questions
from services.document_tagger import get_documents_for_lot
from services.jetons import ligne_jetons
from services.project_access import get_owned_project as _get_project_or_404
from services.rate_limit import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

ACTION = "analyse.points_a_eclaircir"
MAX_PAR_JOUR = 10
MSG_PLAFOND = (f"Vous avez préparé {MAX_PAR_JOUR} listes de questions dans les dernières 24 heures : "
               "c'est le plafond du jour. Vous pourrez en préparer d'autres demain.")
MSG_EN_COURS = "Les questions de cet appel d'offres sont déjà en préparation."
MSG_IA = "Service IA momentanément indisponible — réessayez dans quelques minutes."
_TYPES_LUS = ("rc", "ccap", "cctp")

_en_cours: set[str] = set()
_verrou = threading.Lock()


def _date_remise(project: Project) -> Optional[date]:
    """Date limite de remise : champs critiques du lot, sinon l'analyse, sinon l'échéance saisie."""
    lot = project.selected_lot or "_all"
    champ = ((project.critical_fields or {}).get(lot) or {}).get("date_limite_remise") or {}
    valeur = champ.get("value") or {}
    brut = valeur.get("date") if isinstance(valeur, dict) else None
    return (parse_french_date(brut or "") or parse_french_date((project.infos_marche or {}).get("date_limite_reponse") or "")
            or project.deadline)


def _pieces_du_projet(docs: list[ProjectDocument], lot: Optional[str]) -> list[tuple[str, str, str]]:
    """(nom, type, texte) du RC, du CCAP et du CCTP du lot — jamais une grille de prix, jamais une pièce remplie par l'entreprise."""
    du_lot = {d.id for d in get_documents_for_lot(docs, lot)}
    pieces = []
    for d in docs:
        type_ = d.type or "autre"
        if type_ not in _TYPES_LUS or type_ == TYPE_DPGF or getattr(d, "is_user_completed", False):
            continue
        if type_ == "cctp" and d.id not in du_lot:
            continue
        texte = d.extracted_text or ""
        if len(texte) < 50 or texte.startswith("[document volumineux"):
            continue
        pieces.append((d.file_name, type_, texte))
    return pieces


@router.get("/{project_id}/date-limite-questions")
def date_limite_questions(project_id: str, user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """Date limite des questions lue dans le RC (sans IA), avec sa source ; « À vérifier dans le RC » sinon."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    rc_d_abord = sorted(docs, key=lambda d: 0 if (d.type or "") == "rc" else 1)
    pieces = [(d.file_name, d.extracted_text or "") for d in rc_d_abord
              if (d.type or "") in ("rc", "ccap") and not getattr(d, "is_user_completed", False)]
    lecture = trouver_date_questions(pieces, _date_remise(project))
    return {**lecture, "rappel": RAPPEL_REGLE}


@router.post("/{project_id}/points-a-eclaircir")
@limiter.limit("3/minute")
async def preparer_points(request: Request, project_id: str, user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """« Préparer les questions » : Haiku 4.5 sur les seuls passages utiles du dossier. Ne décompte aucune unité."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    if project.processing_status in ("analyzing", "generating"):
        raise HTTPException(status_code=409, detail="Une opération est déjà en cours pour cet appel d'offres : réessayez dans un instant.")
    docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    pieces = _pieces_du_projet(docs, project.selected_lot)
    if not pieces:
        raise HTTPException(status_code=409, detail="Aucune pièce lisible (règlement, CCAP, CCTP) : déposez le dossier avant de préparer les questions.")
    depuis = datetime.utcnow() - timedelta(hours=24)
    from models.audit_log import AuditLog
    if (db.query(AuditLog).filter(AuditLog.organization_id == user.organization_id, AuditLog.action == ACTION,
                                  AuditLog.created_at >= depuis).count()) >= MAX_PAR_JOUR:
        raise HTTPException(status_code=429, detail=MSG_PLAFOND)
    with _verrou:
        if project_id in _en_cours:
            raise HTTPException(status_code=409, detail=MSG_EN_COURS)
        _en_cours.add(project_id)
    try:
        # Comptée dès le départ (plafond ci-dessus), même si l'appel échoue ensuite.
        log_action(db, user, ACTION, target_type="project", target_id=project_id)
        extraits = pe.selectionner_extraits(pieces)
        org_id = user.organization_id
        texts: dict[str, str] = {}
        paths: dict[str, str] = {}
        rangs: dict[str, int] = {}
        if extraits:
            from routers.analysis import _build_anchor_docs
            texts, paths, rangs = _build_anchor_docs(db, project_id, None)
        db.rollback()   # lecture finie : la connexion est rendue avant l'appel au modèle
        points: list[dict] = []
        if extraits:
            try:
                bruts, usage = await asyncio.to_thread(pe.appeler_haiku, pe.construire_message(extraits))
            except Exception as e:
                logger.error("points à éclaircir projet %s : appel Haiku en échec : %s", project_id, e)
                raise HTTPException(status_code=503, detail=MSG_IA)
            print(ligne_jetons("points_a_eclaircir", pe.MODELE, usage), flush=True)
            couts_ia.enregistrer(db, org_id, "points_a_eclaircir", pe.MODELE, usage, reference=project_id)
            points = await asyncio.to_thread(pe.ancrer, pe.normaliser(bruts), texts, paths, rangs)
        project = _get_project_or_404(project_id, org_id, db)
        project.infos_marche = {**(project.infos_marche or {}), pe.CLE_INFOS: points}
        db.commit()
        return {"points": points, "cout_unites": 0}
    finally:
        with _verrou:
            _en_cours.discard(project_id)
