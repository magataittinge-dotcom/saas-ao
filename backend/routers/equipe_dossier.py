"""B3 — « Votre équipe face au dossier » : ``GET /api/projects/{id}/equipe``. Lecture seule, sans IA.

Les exigences du dossier exporté (tronc commun + lot choisi : ``requete_exigences_du_dossier``) qui citent une
habilitation ou une qualification, en face du profil de L'ORGANISATION de l'utilisateur (habilitations, qualifications
non supprimées, certifications des fiches de l'équipe) : ``services.equipe_dossier``. Isolement multi-tenant : projet lu
avec ``org_id`` (404 sinon) ; chaque lecture du profil est filtrée sur ``user.organization_id``."""
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from database import get_db
from models.compliance_item import ComplianceItem
from models.memoire_config import MemoireConfig
from models.qualification import Qualification
from models.team_member import TeamMember
from models.user import User
from routers.auth import get_auth_user
from services.equipe_dossier import Profil, equipe_face_au_dossier, resume
from services.exigences import requete_exigences_du_dossier
from services.project_access import get_owned_project
from services.rate_limit import limiter

router = APIRouter()
PARIS = ZoneInfo("Europe/Paris")   # une habilitation valable « jusqu'au 12/11 » l'est toute la journée, heure de Paris


def profil_de(db: Session, org_id: str) -> Profil:
    cfg = db.query(MemoireConfig).filter(MemoireConfig.organization_id == org_id).first()
    qualifs = (db.query(Qualification)
               .filter(Qualification.organization_id == org_id, Qualification.deleted_at.is_(None)).all())
    equipe = db.query(TeamMember.certifications).filter(TeamMember.organization_id == org_id).all()
    return Profil(
        habilitations=list((cfg.habilitations if cfg else None) or []),
        qualifications=[{"famille": q.famille, "intitule": q.intitule, "organisme": q.organisme,
                         "perimetre": q.perimetre, "numero": q.numero, "date_fin": q.date_fin} for q in qualifs],
        certifications_equipe=[c for (c,) in equipe if c],
    )


@router.get("/{project_id}/equipe")
@limiter.limit("30/minute")
def equipe_face_au_dossier_route(
    request: Request,
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, user.organization_id, db)
    exigences = [
        {"id": e.id, "texte": e.exigence_text,
         "source": {"type": "exigence", "id": e.id, "document": e.source_document, "page": e.source_page}}
        for e in requete_exigences_du_dossier(db, project)
        .order_by(ComplianceItem.created_at, ComplianceItem.id).all()
    ]
    return resume(equipe_face_au_dossier(exigences, profil_de(db, user.organization_id), datetime.now(PARIS).date()))
