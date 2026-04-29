from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.document import Document
from schemas.document import DocumentResponse
from routers.auth import get_auth_user
from services.audit_logger import log_action
from services.file_storage import FileStorage
from services.expiry_checker import compute_status

router = APIRouter()
storage = FileStorage()


@router.get("", response_model=List[DocumentResponse])
def list_documents(
    include_deleted: bool = False,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    q = db.query(Document).filter(Document.organization_id == user.organization_id)
    if not include_deleted:
        q = q.filter(Document.deleted_at.is_(None))
    return q.order_by(Document.uploaded_at.desc()).all()


@router.get("/expiring-soon")
def list_expiring_soon(
    days: int = 30,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """List vault documents that are expired or will expire within `days`.

    Used by the dashboard banner ('3 attestations à renouveler') and by the
    `MARKETING_STRATEGY.md` quick-win 'reminder attestations expirantes'.
    Returns the docs with computed days_left so the UI doesn't have to.
    """
    from datetime import date as _date
    days = max(1, min(days, 365))
    today = _date.today()
    docs = (
        db.query(Document)
        .filter(
            Document.organization_id == user.organization_id,
            Document.deleted_at.is_(None),
            Document.expiry_date.isnot(None),
        )
        .order_by(Document.expiry_date.asc())
        .all()
    )
    out = []
    for d in docs:
        days_left = (d.expiry_date - today).days
        if days_left > days:
            continue
        out.append({
            "id": d.id,
            "type": d.type,
            "file_name": d.file_name,
            "expiry_date": d.expiry_date.isoformat(),
            "days_left": days_left,
            "status": "expired" if days_left < 0 else "expiring_soon",
            "file_url": d.file_url,
        })
    return {"count": len(out), "items": out}


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
    log_action(
        db, user, "vault.upload",
        target_type="document", target_id=doc.id,
        extra={"type": type, "file_name": file.filename, "size": len(content)},
    )
    return doc


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Soft-delete: keep history for compliance/restore."""
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.organization_id == user.organization_id,
        Document.deleted_at.is_(None),
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    doc.deleted_at = datetime.utcnow()
    db.commit()
    log_action(
        db, user, "vault.delete",
        target_type="document", target_id=doc_id,
        extra={"type": doc.type, "file_name": doc.file_name},
    )


@router.post("/{doc_id}/restore", response_model=DocumentResponse)
def restore_document(
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Restore a soft-deleted vault document."""
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.organization_id == user.organization_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    if not doc.deleted_at:
        raise HTTPException(status_code=400, detail="Document non supprimé")
    doc.deleted_at = None
    db.commit()
    db.refresh(doc)
    log_action(
        db, user, "vault.restore",
        target_type="document", target_id=doc_id,
    )
    return doc
