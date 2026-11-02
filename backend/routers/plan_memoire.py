"""Le plan du mémoire (B1) : proposé sans IA, modifié par le patron, validé.

Aucune de ces routes n'appelle le modèle. Isolement multi-tenant : le projet est lu avec ``org_id`` (404 sinon) et le
plan est toujours cherché par ``project_id`` ET ``organization_id``."""
import copy
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session, defer

from database import get_db
from models.memoire_config import MemoireConfig
from models.plan_memoire import PlanMemoire
from models.project import ProjectDocument
from models.reference import Reference
from models.team_member import TeamMember
from models.user import User
from routers.auth import get_auth_user
from schemas.plan_memoire import PlanMemoireIn
from services import plan_fiches
from services import plan_memoire as service
from services.audit_logger import log_action
from services.document_tagger import get_documents_for_lot
from services.exigences import exigences_pour_memoire
from services.project_access import get_owned_project
from services.project_status import ensure_relaunchable
from services.rate_limit import limiter
from services.relecture_memoire import limite_de_pages

router = APIRouter()

_CATEGORIES_ANNONCE = ("offre", "technique")


def _lot_du_plan(project) -> str:
    return (project.selected_lot or "")[:64]


def _plan_enregistre(db: Session, project, org_id: str) -> Optional[PlanMemoire]:
    return (db.query(PlanMemoire)
            .filter(PlanMemoire.project_id == project.id, PlanMemoire.organization_id == org_id,
                    PlanMemoire.lot == _lot_du_plan(project))
            .first())


def _textes_du_dossier(db: Session, project) -> tuple[list[dict], list[dict]]:
    """(textes à lire pour les parties annoncées, exigences pour la limite de pages), avec leur source."""
    exigences = exigences_pour_memoire(db, project)
    textes, pour_limite = [], []
    for e in exigences:
        source = {"type": "exigence", "id": e.id, "document": e.source_document, "page": e.source_page}
        pour_limite.append({"texte": e.exigence_text, "source": {"type": "exigence", "id": e.id}})
        if e.category in _CATEGORIES_ANNONCE:
            textes.append({"texte": e.exigence_text, "source": source})
    ids_lots = [l.get("id") for l in (project.lots_detectes or []) if l.get("id")]
    docs = (db.query(ProjectDocument).options(defer(ProjectDocument.extracted_text))
            .filter(ProjectDocument.project_id == project.id, ProjectDocument.type.in_(("rc", "cctp"))).all())
    for doc in get_documents_for_lot(docs, project.selected_lot, ids_lots):
        texte = db.query(ProjectDocument.extracted_text).filter(ProjectDocument.id == doc.id).scalar()
        if texte:
            textes.append({"texte": texte, "source": {"type": "champ", "document": doc.file_name, "page": None}})
    return textes, pour_limite


def _reponse(db: Session, project, enregistre: Optional[PlanMemoire]) -> dict:
    org_id = project.organization_id
    textes, pour_limite = _textes_du_dossier(db, project)
    attendues = service.extraire_parties_attendues(textes)
    limite = limite_de_pages(pour_limite)
    plan = enregistre.parties if enregistre else service.proposer(project.criteres_jugement, attendues)
    corps = service.vue(plan, project.criteres_jugement, attendues, limite)

    # B2 — la fiche de chaque partie : exigences du dossier rattachées (sans IA) et cases proposées de « Mon entreprise »
    exigences = [{"id": e.id, "texte": e.exigence_text, "categorie": e.category,
                  "source": {"type": "exigence", "id": e.id, "document": e.source_document, "page": e.source_page}}
                 for e in exigences_pour_memoire(db, project)]
    references = (db.query(Reference)
                  .filter(Reference.organization_id == org_id, Reference.is_reference == True,  # noqa: E712
                          Reference.deleted_at.is_(None)).all())
    equipe = db.query(TeamMember).filter(TeamMember.organization_id == org_id).order_by(TeamMember.name).all()
    cfg = db.query(MemoireConfig).filter(MemoireConfig.organization_id == org_id).first()
    materiel = [l for l in (getattr(cfg, "materiel_liste", None) or []) if isinstance(l, dict)]
    par_exigences = plan_fiches.exigences_par_partie(plan, exigences)
    par_cases = plan_fiches.propositions(plan, references, equipe, materiel, project.selected_lot_name)
    for partie in corps["parties"]:
        partie["exigences"] = par_exigences.get(partie["cle"], [])
        partie["propose"] = par_cases.get(partie["cle"], {"references": [], "personnes": [], "materiel": []})
    return {
        **corps,
        "enregistre": enregistre is not None,
        "valide": bool(enregistre and enregistre.valide_le),
        "valide_le": enregistre.valide_le.isoformat() if enregistre and enregistre.valide_le else None,
        "version": enregistre.version if enregistre else 0,
    }


def _normaliser(payload: PlanMemoireIn) -> list[dict]:
    try:
        return service.valider([p.model_dump() for p in payload.parties])
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


def _enregistrer(db: Session, project, org_id: str, parties: list[dict], valider: bool) -> PlanMemoire:
    ligne = (db.query(PlanMemoire)
             .filter(PlanMemoire.project_id == project.id, PlanMemoire.organization_id == org_id,
                     PlanMemoire.lot == _lot_du_plan(project))
             .with_for_update().first())
    if ligne is None:
        ligne = PlanMemoire(project_id=project.id, organization_id=org_id, lot=_lot_du_plan(project),
                            parties=parties, version=1, valide_le=None)
        db.add(ligne)
    elif ligne.parties != parties:
        ligne.parties = copy.deepcopy(parties)
        ligne.version = (ligne.version or 0) + 1
        ligne.valide_le = None            # un plan modifié est à valider de nouveau
    if valider:
        ligne.valide_le = datetime.utcnow()
    db.commit()
    db.refresh(ligne)
    return ligne


@router.get("/{project_id}/plan-memoire")
@limiter.limit("60/minute")
def lire_plan(request: Request, project_id: str, user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    project = get_owned_project(project_id, user.organization_id, db)
    return _reponse(db, project, _plan_enregistre(db, project, user.organization_id))


@router.put("/{project_id}/plan-memoire")
@limiter.limit("60/minute")
def enregistrer_plan(request: Request, project_id: str, payload: PlanMemoireIn,
                     user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    project = get_owned_project(project_id, user.organization_id, db)
    ensure_relaunchable(project)
    ligne = _enregistrer(db, project, user.organization_id, _normaliser(payload), valider=False)
    return _reponse(db, project, ligne)


@router.post("/{project_id}/plan-memoire/valider")
@limiter.limit("30/minute")
def valider_plan(request: Request, project_id: str, payload: Optional[PlanMemoireIn] = Body(default=None),
                 user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """Valide le plan : celui envoyé (enregistré d'abord), sinon le plan enregistré, sinon le plan proposé."""
    project = get_owned_project(project_id, user.organization_id, db)
    ensure_relaunchable(project)
    if payload is not None:
        parties = _normaliser(payload)
    else:
        existant = _plan_enregistre(db, project, user.organization_id)
        if existant is not None:
            parties = existant.parties
        else:
            textes, _ = _textes_du_dossier(db, project)
            parties = service.proposer(project.criteres_jugement, service.extraire_parties_attendues(textes))
    ligne = _enregistrer(db, project, user.organization_id, parties, valider=True)
    log_action(db, user, "memoire.plan_valide", target_type="project", target_id=project_id,
               extra={"version": ligne.version, "parties": len(parties)})
    return _reponse(db, project, ligne)
