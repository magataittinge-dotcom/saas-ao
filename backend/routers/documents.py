from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.document import Document
from schemas.document import DocumentResponse
from routers.auth import get_auth_user
from services.file_storage import FileStorage
from services.expiry_checker import compute_status

router = APIRouter()
storage = FileStorage()


@router.get("", response_model=List[DocumentResponse])
def list_documents(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    return (
        db.query(Document)
        .filter(Document.organization_id == user.organization_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )


@router.post("", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    type: str = Form("autre"),
    issued_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    file_url = await storage.upload(
        content,
        file.filename,
        f"organizations/{user.organization_id}/vault",
        file.content_type,
    )

    exp_date = date.fromisoformat(expiry_date) if expiry_date else None
    iss_date = date.fromisoformat(issued_date) if issued_date else None
    status = compute_status(exp_date)

    doc = Document(
        organization_id=user.organization_id,
        type=type,
        file_url=file_url,
        file_name=file.filename,
        issued_date=iss_date,
        expiry_date=exp_date,
        status=status,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.organization_id == user.organization_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    db.delete(doc)
    db.commit()
