from datetime import datetime, date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models.user import User
from models.project import Project
from models.document import Document
from routers.auth import get_auth_user

router = APIRouter()


@router.get("/stats")
def get_dashboard_stats(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    org_id = user.organization_id
    now = date.today()
    first_of_month = now.replace(day=1)

    en_cours = db.query(Project).filter(
        Project.organization_id == org_id,
        Project.status.in_(["brouillon", "en_cours"]),
    ).count()

    soumis_ce_mois = db.query(Project).filter(
        Project.organization_id == org_id,
        Project.status == "soumis",
        Project.updated_at >= first_of_month,
    ).count()

    gagnes = db.query(Project).filter(
        Project.organization_id == org_id,
        Project.status == "gagné",
    ).count()

    total_decided = db.query(Project).filter(
        Project.organization_id == org_id,
        Project.status.in_(["gagné", "perdu"]),
    ).count()

    taux_succes = round(gagnes / total_decided * 100) if total_decided > 0 else 0

    docs_expires = db.query(Document).filter(
        Document.organization_id == org_id,
        Document.status == "expired",
    ).count()

    docs_expirant = db.query(Document).filter(
        Document.organization_id == org_id,
        Document.status == "expiring_soon",
    ).count()

    return {
        "projects_en_cours": en_cours,
        "projects_soumis_ce_mois": soumis_ce_mois,
        "projects_gagnes": gagnes,
        "taux_succes": taux_succes,
        "documents_expires": docs_expires,
        "documents_expirant_bientot": docs_expirant,
    }
