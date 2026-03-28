from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.organization import Organization
from schemas.organization import OrganizationResponse, OrganizationUpdate
from routers.auth import get_auth_user

router = APIRouter()


@router.get("/me", response_model=OrganizationResponse)
def get_my_organization(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    return org


@router.patch("/me", response_model=OrganizationResponse)
def update_my_organization(
    payload: OrganizationUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(org, field, value)

    db.commit()
    db.refresh(org)
    return org
