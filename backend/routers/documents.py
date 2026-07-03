from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.document import Document, DOCUMENT_TYPES, VAULT_CATEGORIES
from models.project import Project, ProjectDocument
from schemas.document import DocumentResponse, DocumentUpdateRequest
from routers.auth import get_auth_user
from services.audit_logger import log_action
from services.file_storage import FileStorage
from services.vault_classifier import (
    category_for_type,
    compute_document_status,
    detect_vault_type,
)

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

    # États honnêtes : « valide » = reconnu ET daté, jamais « fichier reçu ».
    # Un type explicite du front prime ; sinon classement auto par nom de
    # fichier ; rien de reconnu → unclassified (aucun badge de validité).
    doc_type = type if type and type != "autre" else detect_vault_type(file.filename or "")
    category = "unclassified" if doc_type == "autre" else category_for_type(doc_type)
    status = compute_document_status(doc_type, exp_date, issued_date=iss_date)

    doc = Document(
        organization_id=user.organization_id,
        type=doc_type,
        category=category,
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


class FromProjectDocRequest(BaseModel):
    project_doc_id: str
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None


class DismissVaultPromptRequest(BaseModel):
    project_doc_id: str


def _get_owned_project_doc(project_doc_id: str, org_id: str, db: Session) -> ProjectDocument:
    pd = (
        db.query(ProjectDocument)
        .join(Project, Project.id == ProjectDocument.project_id)
        .filter(
            ProjectDocument.id == project_doc_id,
            Project.organization_id == org_id,
        )
        .first()
    )
    if not pd:
        raise HTTPException(status_code=404, detail="Document de projet introuvable")
    return pd


@router.post("/from-project-doc", response_model=DocumentResponse)
async def save_project_doc_to_vault(
    payload: FromProjectDocRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C16 — coffre-fort progressif : copie un document de projet dans le
    coffre-fort (1 tap depuis le bandeau). Classement auto + statut honnête ;
    le document ne sera plus jamais re-proposé."""
    pd = _get_owned_project_doc(payload.project_doc_id, user.organization_id, db)

    from services.file_storage import UPLOADS_ROOT as _uploads_root
    src = _uploads_root / pd.file_url.removeprefix("/uploads/")
    if not pd.file_url.startswith("/uploads/") or not src.exists():
        raise HTTPException(status_code=404, detail="Fichier source introuvable")

    file_url = await storage.upload(
        src.read_bytes(),
        pd.file_name,
        f"organizations/{user.organization_id}/vault",
    )

    doc_type = detect_vault_type(pd.file_name)
    category = "unclassified" if doc_type == "autre" else category_for_type(doc_type)
    doc = Document(
        organization_id=user.organization_id,
        type=doc_type,
        category=category,
        file_url=file_url,
        file_name=pd.file_name,
        issued_date=payload.issued_date,
        expiry_date=payload.expiry_date,
        status=compute_document_status(doc_type, payload.expiry_date, issued_date=payload.issued_date),
    )
    db.add(doc)
    pd.vault_prompt_dismissed = True  # enregistré → plus de re-proposition
    db.commit()
    db.refresh(doc)
    log_action(
        db, user, "vault.save_from_project",
        target_type="document", target_id=doc.id,
        extra={"project_doc_id": pd.id, "type": doc_type},
    )
    return doc


@router.post("/vault-prompt/dismiss")
def dismiss_vault_prompt(
    payload: DismissVaultPromptRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C16 — refus du bandeau : flag no-repropose pour CE document."""
    pd = _get_owned_project_doc(payload.project_doc_id, user.organization_id, db)
    pd.vault_prompt_dismissed = True
    db.commit()
    return {"dismissed": True}


@router.patch("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: str,
    payload: DocumentUpdateRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Re-classement manuel (catégorie + type + dates) — ownership org vérifié.

    Le statut est recalculé honnêtement : type reconnu + date → validité
    réelle ; sans date → unverified ; type "autre" → unclassified."""
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.organization_id == user.organization_id,
        Document.deleted_at.is_(None),
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    if payload.type is not None:
        if payload.type not in DOCUMENT_TYPES:
            raise HTTPException(status_code=422, detail=f"Type inconnu : {payload.type}")
        doc.type = payload.type
        doc.category = category_for_type(payload.type)
    if payload.category is not None:
        if payload.category not in VAULT_CATEGORIES:
            raise HTTPException(status_code=422, detail=f"Catégorie inconnue : {payload.category}")
        doc.category = payload.category
    if payload.issued_date is not None:
        doc.issued_date = payload.issued_date
    if payload.expiry_date is not None:
        doc.expiry_date = payload.expiry_date

    doc.status = compute_document_status(doc.type, doc.expiry_date, issued_date=doc.issued_date)
    db.commit()
    db.refresh(doc)
    log_action(
        db, user, "vault.reclassify",
        target_type="document", target_id=doc.id,
        extra={"type": doc.type, "category": doc.category, "status": doc.status},
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
