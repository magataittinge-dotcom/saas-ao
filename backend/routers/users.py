from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models.user import User
from models.team_member import TeamMember
from routers.auth import get_auth_user

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
