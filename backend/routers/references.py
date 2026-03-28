from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models.user import User
from models.reference import Reference
from routers.auth import get_auth_user

router = APIRouter()


class ReferenceCreate(BaseModel):
    intitule: str
    adresse: Optional[str] = None
    maitre_ouvrage: Optional[str] = None
    maitre_oeuvre: Optional[str] = None
    lot: Optional[str] = None
    montant_ht: Optional[float] = None
    annee: Optional[int] = None
    statut: str = "en_cours"
    is_reference: bool = True


class ReferenceResponse(BaseModel):
    id: str
    organization_id: str
    intitule: str
    adresse: Optional[str]
    maitre_ouvrage: Optional[str]
    maitre_oeuvre: Optional[str]
    lot: Optional[str]
    montant_ht: Optional[float]
    annee: Optional[int]
    statut: str
    is_reference: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=List[ReferenceResponse])
def list_references(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    return (
        db.query(Reference)
        .filter(Reference.organization_id == user.organization_id)
        .order_by(Reference.annee.desc())
        .all()
    )


@router.post("", response_model=ReferenceResponse)
def create_reference(
    payload: ReferenceCreate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    ref = Reference(organization_id=user.organization_id, **payload.model_dump())
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


@router.delete("/{ref_id}", status_code=204)
def delete_reference(
    ref_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    ref = db.query(Reference).filter(
        Reference.id == ref_id,
        Reference.organization_id == user.organization_id,
    ).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Référence introuvable")
    db.delete(ref)
    db.commit()
