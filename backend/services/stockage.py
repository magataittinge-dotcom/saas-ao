"""Quota de stockage par organisation et garde du disque (audit de sécurité, S-06).

Vérifiés AVANT d'écrire, au début de chaque dépôt (dossier d'un AO, coffre-fort, dépôts de Mon entreprise), sur la
taille annoncée de la requête (`Content-Length`, borne haute du fichier reçu) :
- quota : somme des tailles déjà enregistrées (`project_documents.file_size` des AO de l'organisation) + l'envoi
  > `QUOTA_STOCKAGE_GO` (20 Go par défaut ; offre gratuite : `QUOTA_STOCKAGE_GRATUIT_GO`, 5 Go ; 0 = pas de quota)
  → 413 ;
- disque : espace libre du dossier des dépôts sous `DISQUE_LIBRE_MIN_POURCENT` (15 %) → 507, pour tout le monde :
  un disque plein ferait tomber la base, l'API et les autres clients.
Limite connue : le coffre-fort et les dépôts de Mon entreprise n'enregistrent pas de taille en base ; ils comptent
pour la garde du disque, pas encore pour le quota.
"""
from __future__ import annotations

import logging
import os
import shutil

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

GO = 1024 ** 3
MSG_QUOTA = ("Votre espace de stockage est plein. Supprimez d'anciens appels d'offres ou des documents du "
             "coffre-fort pour faire de la place, ou passez à une offre supérieure.")
MSG_DISQUE = ("Le dépôt est momentanément indisponible. Vos documents déjà déposés sont intacts ; "
              "réessayez dans quelques heures.")


def _nombre(nom: str, defaut: float) -> float:
    try:
        valeur = float(os.environ.get(nom, "") or defaut)
    except ValueError:
        return defaut
    return valeur if valeur >= 0 else defaut


def quota_octets(plan: str | None) -> int:
    if (plan or "free") == "free":
        return int(_nombre("QUOTA_STOCKAGE_GRATUIT_GO", 5) * GO)
    return int(_nombre("QUOTA_STOCKAGE_GO", 20) * GO)


def utilise_octets(db: Session, org_id: str) -> int:
    from models.project import Project, ProjectDocument
    return int(db.query(func.coalesce(func.sum(ProjectDocument.file_size), 0))
               .join(Project, Project.id == ProjectDocument.project_id)
               .filter(Project.organization_id == org_id).scalar() or 0)


def _espace_disque(chemin) -> tuple[int, int]:
    """(total, libre) en octets."""
    u = shutil.disk_usage(str(chemin))
    return u.total, u.free


def verifier_disque() -> None:
    from services.file_storage import UPLOADS_ROOT
    seuil = _nombre("DISQUE_LIBRE_MIN_POURCENT", 15)
    if not seuil:
        return
    try:
        total, libre = _espace_disque(UPLOADS_ROOT)
    except OSError:
        return
    if total and libre * 100 / total < seuil:
        logger.error("Disque des dépôts sous %s %% d'espace libre : dépôts refusés", seuil)
        raise HTTPException(status_code=507, detail=MSG_DISQUE)


def verifier_avant_depot(db: Session, org_id: str, request=None) -> None:
    """413 si l'envoi ferait dépasser le quota de l'organisation, 507 si le disque est presque plein. Avant d'écrire."""
    verifier_disque()
    from models.organization import Organization
    org = db.query(Organization).filter(Organization.id == org_id).first()
    quota = quota_octets(getattr(org, "plan", None))
    if not quota:
        return
    entrant = 0
    if request is not None:
        try:
            entrant = max(0, int(request.headers.get("content-length") or 0))
        except ValueError:
            entrant = 0
    if utilise_octets(db, org_id) + entrant > quota:
        raise HTTPException(status_code=413, detail=MSG_QUOTA)
