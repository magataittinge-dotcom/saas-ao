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
    lot: str | None = None,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Exigences du projet. ?lot=lotN → tronc commun ('_commun') + spécifique
    du lot ; défaut : lot sélectionné du projet ; legacy (lot NULL) inclus."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    q = db.query(ComplianceItem).filter(ComplianceItem.project_id == project_id)
    scope = lot or project.selected_lot
    if scope:
        q = q.filter(
            (ComplianceItem.lot == "_commun")
            | (ComplianceItem.lot == scope)
            | (ComplianceItem.lot.is_(None))
        )
    return q.order_by(ComplianceItem.category, ComplianceItem.created_at).all()


@router.get("/{project_id}/compliance/lots")
def get_analyzed_lots(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Lots ayant des exigences analysées (multi-lots) — pour le sélecteur."""
    _get_project_or_404(project_id, user.organization_id, db)
    rows = db.query(ComplianceItem.lot).filter(
        ComplianceItem.project_id == project_id,
        ComplianceItem.lot.isnot(None),
        ComplianceItem.lot != "_commun",
    ).distinct().all()
    return {"lots": sorted(r[0] for r in rows)}


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
