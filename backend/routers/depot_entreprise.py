"""Dépôt de documents dans les cases de « Mon entreprise » (migration 0032).

- GET  /api/entreprise/depots/cases   : les huit cases (nom, ce qu'on y met, ce que Synorix en fait) — source unique ;
- GET  /api/entreprise/depots/etat    : l'état de chaque case (`?rubrique=`) ;
- POST /api/entreprise/depots/{case}  : dépôt de un à dix fichiers dans UNE case.

Un fichier entre au coffre-fort avec sa rubrique et son type de pièce, puis (D2) Synorix le lit et PROPOSE des
informations : rien n'entre dans le profil avant validation. Chaque requête est filtrée par l'organisation de
l'utilisateur authentifié, jamais lue du corps.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models.depot_entreprise import LectureDepot
from models.document import Document
from models.user import User
from routers.auth import get_auth_user
from services import depot_cases, depot_controles, upload_validation
from services.audit_logger import log_action
from services.depot_etat import etats
from services.file_storage import FileStorage
from services.rate_limit import limiter
from services.vault_classifier import compute_document_status, detect_vault_type

logger = logging.getLogger(__name__)
router = APIRouter()
storage = FileStorage()

_REGLE = upload_validation.RegleDepot(
    frozenset(depot_cases.EXTENSIONS), depot_cases.PLAFOND_OCTETS, depot_cases.FORMATS_LISIBLES)
_ETATS_QUI_BLOQUENT_LE_REDEPOT = ("en_lecture", "lu", "coffre_seul", "ocr_requis")


def _sha256(flux) -> str:
    flux.seek(0)
    h = hashlib.sha256()
    for morceau in iter(lambda: flux.read(4 * 1024 * 1024), b""):
        h.update(morceau)
    flux.seek(0)
    return h.hexdigest()


def _type_de_la_piece(case: depot_cases.CaseDepot, nom: str) -> str:
    """Le type de pièce vient de la case ; seul « certificat » regarde le nom pour distinguer Qualibat, RGE, CACES…"""
    if case.id == "certificat":
        detecte = detect_vault_type(nom)
        return detecte if detecte in depot_cases.TYPES_CERTIFICAT else "autre"
    return case.type_piece


def _refus(nom: str, exc: HTTPException) -> dict:
    return {"nom": nom, "accepte": False, "statut": exc.status_code, "detail": exc.detail}


@router.get("/cases")
def lister_les_cases(user: User = Depends(get_auth_user)):
    return {
        "cases": [depot_cases.definition_publique(c) for c in depot_cases.CASES],
        "plafond_mo": depot_cases.PLAFOND_MO, "max_fichiers": depot_cases.MAX_FICHIERS_PAR_ENVOI,
        "formats": list(depot_cases.EXTENSIONS), "message_format": depot_cases.MESSAGE_FORMAT,
    }


@router.get("/etat")
def etat_des_cases(
    rubrique: Optional[str] = Query(None),
    user: User = Depends(get_auth_user), db: Session = Depends(get_db),
):
    if rubrique is not None and rubrique not in depot_cases.RUBRIQUES:
        raise HTTPException(status_code=422, detail="Rubrique inconnue.")
    return {"cases": etats(db, user.organization_id, rubrique)}


@router.post("/{case_id}")
@limiter.limit("20/minute")
async def deposer(
    request: Request,
    case_id: str,
    fichiers: List[UploadFile] = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    case = depot_cases.case_par_id(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case de dépôt inconnue.")
    if not fichiers:
        raise HTTPException(status_code=422, detail="Aucun fichier reçu.")
    if len(fichiers) > depot_cases.MAX_FICHIERS_PAR_ENVOI:
        raise HTTPException(
            status_code=413,
            detail=f"{depot_cases.MAX_FICHIERS_PAR_ENVOI} fichiers au plus par envoi.")

    org_id = user.organization_id
    resultats: list[dict] = []
    total_octets = 0
    a_lire: list[str] = []
    for fichier in fichiers:
        nom = (fichier.filename or "").strip() or "fichier"
        try:
            # request=None : le Content-Length est celui de TOUS les fichiers de l'envoi, pas d'un seul.
            with await upload_validation.recevoir_fichier(None, fichier, _REGLE) as recu:
                total_octets += recu.taille
                if total_octets > depot_cases.PLAFOND_TOTAL_ENVOI:
                    raise HTTPException(
                        status_code=413,
                        detail="L'envoi dépasse 55 Mo : déposez ce fichier dans un second envoi.")
                tete = await asyncio.to_thread(lambda: (recu.flux.seek(0), recu.flux.read(1024))[1])
                await asyncio.to_thread(depot_controles.controler_contenu, recu.flux, recu.extension, tete)
                empreinte = await asyncio.to_thread(_sha256, recu.flux)

                deja = db.query(LectureDepot).join(Document, Document.id == LectureDepot.document_id).filter(
                    LectureDepot.organization_id == org_id, LectureDepot.case_depot == case.id,
                    LectureDepot.sha256 == empreinte, LectureDepot.etat.in_(_ETATS_QUI_BLOQUENT_LE_REDEPOT),
                    Document.deleted_at.is_(None)).first()
                if deja is not None:   # même fichier, même case : ni nouvelle pièce ni nouvel appel
                    resultats.append({
                        "nom": nom, "accepte": True, "deja_depose": True, "document_id": deja.document_id,
                        "lecture_id": deja.id, "etat": deja.etat})
                    continue

                file_url = await storage.upload_stream(
                    recu.flux, nom, f"organizations/{org_id}/vault", fichier.content_type)
        except HTTPException as exc:
            resultats.append(_refus(nom, exc))
            continue

        type_piece = _type_de_la_piece(case, nom)
        doc = Document(
            organization_id=org_id, type=type_piece,
            category=case.categorie, file_url=file_url, file_name=nom,
            status=compute_document_status(type_piece, None),
            rubrique_entreprise=case.rubrique, case_depot=case.id,
        )
        db.add(doc)
        db.flush()
        lecture = LectureDepot(
            organization_id=org_id, document_id=doc.id, case_depot=case.id, rubrique=case.rubrique,
            sha256=empreinte, etat="coffre_seul")
        db.add(lecture)
        db.commit()
        # Jamais le nom du fichier dans le journal : un CV ou une liste du personnel peut porter un nom de personne.
        log_action(db, user, "depot.upload", target_type="document", target_id=doc.id,
                   extra={"case": case.id, "rubrique": case.rubrique, "type": type_piece})
        resultats.append({
            "nom": nom, "accepte": True, "deja_depose": False, "document_id": doc.id,
            "lecture_id": lecture.id, "etat": lecture.etat})
        a_lire.append(lecture.id)

    return {"case": case.id, "resultats": resultats}
