from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.project import Project
from models.compliance_item import ComplianceItem
from schemas.compliance import ComplianceItemResponse
from routers.auth import get_auth_user

router = APIRouter()


@router.get("/{project_id}/compliance", response_model=List[ComplianceItemResponse])
def get_compliance_matrix(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    return (
        db.query(ComplianceItem)
        .filter(ComplianceItem.project_id == project_id)
        .order_by(ComplianceItem.category, ComplianceItem.created_at)
        .all()
    )


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
