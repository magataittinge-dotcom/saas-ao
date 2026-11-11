import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db
from models.user import User
from models.team_member import TeamMember
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
    experience_resume: Optional[str] = Field(default=None, max_length=1000)  # migration 0029


class TeamMemberUpdate(BaseModel):
    """Modification d'une personne clé : seuls les champs envoyés changent."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    role: Optional[str] = Field(default=None, min_length=1, max_length=255)
    specialite: Optional[str] = Field(default=None, max_length=255)
    experience_years: Optional[int] = Field(default=None, ge=0, le=80)
    certifications: Optional[str] = Field(default=None, max_length=500)
    experience_resume: Optional[str] = Field(default=None, max_length=1000)


class TeamMemberResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    role: str
    specialite: Optional[str]
    experience_years: Optional[int]
    certifications: Optional[str]
    cv_url: Optional[str]
    experience_resume: Optional[str] = None

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


@router.patch("/team/{member_id}", response_model=TeamMemberResponse)
def update_team_member(
    member_id: str,
    payload: TeamMemberUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.organization_id == user.organization_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    for champ, valeur in payload.model_dump(exclude_unset=True).items():
        if valeur is None and champ in {"name", "role"}:
            continue  # colonnes obligatoires : un null n'efface pas
        setattr(member, champ, valeur)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/me", status_code=200)
def delete_my_account(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """RGPD droit à l'oubli — supprime le compte utilisateur et TOUTES ses données.

    S-02 — toutes les lignes de l'organisation (tables déduites des modèles : services/suppression_compte.py), dans
    une seule transaction ; les fichiers déposés sont effacés du disque après le commit."""
    from services import suppression_compte

    org_id = user.organization_id
    try:
        bilan = suppression_compte.supprimer_organisation(db, org_id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("RGPD : suppression du compte impossible (org=%s)", org_id)
        raise HTTPException(status_code=500, detail="Le compte n’a pas pu être supprimé. Rien n’a été effacé ; "
                                                    "réessayez dans un instant ou écrivez-nous.")
    project_ids = bilan["project_ids"]

    # Purge des fichiers disque (après le commit DB) : plus aucune donnée perso résiduelle sur le VPS.
    suppression_compte.purger_fichiers(UPLOADS_ROOT, org_id, project_ids, bilan["fichiers"])

    logger.info("RGPD: compte supprimé — org=%s, projets=%d, tables=%d", org_id, len(project_ids), len(bilan["tables"]))
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
