"""Qualifications, labels, certifications de management et assurances déclarés par l'entreprise.

Chaque requête est filtrée par `organization_id` (celui de l'utilisateur authentifié, jamais lu du corps).
Le justificatif (`document_id`) doit appartenir à la même entreprise et ne pas être supprimé : vérifié à
l'écriture. Suppression douce, comme `references`.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.document import Document
from models.qualification import Qualification
from models.user import User
from routers.auth import get_auth_user
from schemas.qualification import QualificationCreate, QualificationResponse, QualificationUpdate
from services.audit_logger import log_action

router = APIRouter()


def _verifier_document(db: Session, user: User, document_id: Optional[str]) -> None:
    """Le justificatif doit être une pièce de la même entreprise, non supprimée. Même réponse pour « inconnu »
    et « d'une autre entreprise » : on ne révèle pas l'existence d'une pièce d'autrui."""
    if document_id is None:
        return
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.organization_id == user.organization_id,
        Document.deleted_at.is_(None),
    ).first()
    if not doc:
        raise HTTPException(status_code=422, detail="Justificatif introuvable dans votre coffre-fort")


def _trouver(db: Session, user: User, qualification_id: str) -> Qualification:
    q = db.query(Qualification).filter(
        Qualification.id == qualification_id,
        Qualification.organization_id == user.organization_id,
        Qualification.deleted_at.is_(None),
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Qualification introuvable")
    return q


@router.get("", response_model=List[QualificationResponse])
def list_qualifications(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    return (
        db.query(Qualification)
        .filter(Qualification.organization_id == user.organization_id, Qualification.deleted_at.is_(None))
        .order_by(Qualification.famille, Qualification.date_fin.is_(None), Qualification.date_fin)
        .all()
    )


@router.post("", response_model=QualificationResponse, status_code=201)
def create_qualification(
    payload: QualificationCreate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _verifier_document(db, user, payload.document_id)
    q = Qualification(organization_id=user.organization_id, **payload.model_dump())
    db.add(q)
    db.commit()
    db.refresh(q)
    log_action(db, user, "qualification.create", target_type="qualification", target_id=q.id,
               extra={"famille": q.famille})
    return q


@router.patch("/{qualification_id}", response_model=QualificationResponse)
def update_qualification(
    qualification_id: str,
    payload: QualificationUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    q = _trouver(db, user, qualification_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("document_id") is not None:
        _verifier_document(db, user, changes["document_id"])
    for cle, valeur in changes.items():
        setattr(q, cle, valeur)
    if q.date_obtention and q.date_fin and q.date_fin < q.date_obtention:
        raise HTTPException(status_code=422, detail="La date de fin ne peut pas précéder la date d'obtention")
    db.commit()
    db.refresh(q)
    log_action(db, user, "qualification.update", target_type="qualification", target_id=q.id,
               extra={"changed_fields": list(changes.keys())})
    return q


@router.delete("/{qualification_id}", status_code=204)
def delete_qualification(
    qualification_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    q = _trouver(db, user, qualification_id)
    q.deleted_at = datetime.utcnow()
    db.commit()
    log_action(db, user, "qualification.delete", target_type="qualification", target_id=q.id,
               extra={"famille": q.famille})
