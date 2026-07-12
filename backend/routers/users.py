import logging
import shutil
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.user import User
from models.team_member import TeamMember
from models.organization import Organization
from models.project import Project, ProjectDocument
from models.reference import Reference
from models.document import Document
from models.memoire import MemoireTechnique
from models.memoire_config import MemoireConfig
from models.memoire_template import MemoireTemplate
from models.compliance_item import ComplianceItem
from models.checklist_item import ChecklistItem
from models.quota_consumption import QuotaConsumption
from models.notification import Notification
from routers.auth import get_auth_user
from services.file_storage import UPLOADS_ROOT

logger = logging.getLogger(__name__)
router = APIRouter()


class TeamMemberCreate(BaseModel):
    name: str
    role: str
    specialite: Optional[str] = None
    experience_years: Optional[int] = None
    certifications: Optional[str] = None


class TeamMemberResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    role: str
    specialite: Optional[str]
    experience_years: Optional[int]
    certifications: Optional[str]
    cv_url: Optional[str]

    model_config = {"from_attributes": True}


@router.get("/team", response_model=List[TeamMemberResponse])
def list_team(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    return db.query(TeamMember).filter(TeamMember.organization_id == user.organization_id).all()


@router.post("/team", response_model=TeamMemberResponse)
def create_team_member(
    payload: TeamMemberCreate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    member = TeamMember(organization_id=user.organization_id, **payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/me", status_code=200)
def delete_my_account(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """RGPD droit à l'oubli — supprime le compte utilisateur et TOUTES ses données."""
    org_id = user.organization_id

    # Count what we're deleting for audit log
    project_ids = [p.id for p in db.query(Project.id).filter(Project.organization_id == org_id).all()]

    # Delete project-related data
    if project_ids:
        db.query(ComplianceItem).filter(ComplianceItem.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(ChecklistItem).filter(ChecklistItem.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(MemoireTechnique).filter(MemoireTechnique.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(ProjectDocument).filter(ProjectDocument.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(Project).filter(Project.id.in_(project_ids)).delete(synchronize_session=False)

    # Delete organization-level data (R6 : QuotaConsumption + Notification
    # étaient OUBLIÉS — leur FK vers organizations empêchait la suppression
    # de l'org sur Postgres → 500, droit à l'oubli cassé pour toute org
    # ayant consommé 1 unité ou reçu 1 notification).
    db.query(MemoireConfig).filter(MemoireConfig.organization_id == org_id).delete(synchronize_session=False)
    db.query(MemoireTemplate).filter(MemoireTemplate.organization_id == org_id).delete(synchronize_session=False)
    db.query(Reference).filter(Reference.organization_id == org_id).delete(synchronize_session=False)
    db.query(Document).filter(Document.organization_id == org_id).delete(synchronize_session=False)
    db.query(TeamMember).filter(TeamMember.organization_id == org_id).delete(synchronize_session=False)
    db.query(QuotaConsumption).filter(QuotaConsumption.organization_id == org_id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.organization_id == org_id).delete(synchronize_session=False)

    # Delete ALL users of the org (demandeur inclus) par filtre — robuste
    # même si l'objet `user` provient d'une autre session que `db`.
    db.query(User).filter(User.organization_id == org_id).delete(synchronize_session=False)

    # Delete organization
    db.query(Organization).filter(Organization.id == org_id).delete(synchronize_session=False)

    db.commit()

    # R6 — purge des fichiers disque (best-effort, après le commit DB) : plus
    # aucune donnée perso résiduelle sur le VPS (uploads projets + coffre).
    for pid in project_ids:
        shutil.rmtree(UPLOADS_ROOT / "projects" / pid, ignore_errors=True)
    shutil.rmtree(UPLOADS_ROOT / "organizations" / org_id, ignore_errors=True)

    logger.info(f"RGPD: compte supprimé — user={user.email}, org={org_id}, projets={len(project_ids)}")
    return {"deleted": True, "projects_deleted": len(project_ids)}


@router.delete("/team/{member_id}", status_code=204)
def delete_team_member(
    member_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.organization_id == user.organization_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    db.delete(member)
    db.commit()
