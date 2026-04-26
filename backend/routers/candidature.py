"""
Candidature checklist endpoints.

* GET    /{project_id}/checklist                              — read full checklist
* POST   /{project_id}/checklist/{item_id}/upload-completed   — upload a user-filled template
                                                                (source_kind='dce_template')
* PUT    /{project_id}/checklist/{item_id}/link               — link an existing vault doc
                                                                (source_kind='vault')
"""
import logging
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile,
)
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from database import get_db
from models.checklist_item import ChecklistItem
from models.document import Document
from models.project import Project, ProjectDocument
from models.user import User
from routers.auth import get_auth_user
from schemas.compliance import ChecklistItemResponse

logger = logging.getLogger(__name__)

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"

_COMPLETED_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".xls"}
_COMPLETED_MAX_SIZE = 50 * 1024 * 1024  # 50 MB

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/{project_id}/checklist", response_model=List[ChecklistItemResponse])
def get_checklist(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    return (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .all()
    )


@router.post(
    "/{project_id}/checklist/{item_id}/upload-completed",
    response_model=ChecklistItemResponse,
)
@limiter.limit("10/minute")
async def upload_completed_template(
    request: Request,
    project_id: str,
    item_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """User uploads a completed copy of a DCE template (DC1 signé, DPGF rempli, …)."""
    _get_project_or_404(project_id, user.organization_id, db)
    item = _get_checklist_item_or_404(item_id, project_id, db)

    if item.source_kind != "dce_template":
        raise HTTPException(
            status_code=400,
            detail="Cet item n'est pas un template DCE — utilisez l'endpoint /link à la place.",
        )

    raw_name = file.filename or ""
    safe_name = Path(raw_name).name  # strip any path components → defeats traversal
    if not safe_name or ".." in safe_name:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")

    ext = Path(safe_name).suffix.lower()
    if ext not in _COMPLETED_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier non autorisé : {ext or '(aucun)'}. "
                   f"Formats acceptés : PDF, DOCX, XLSX, XLS.",
        )

    content = await file.read()
    if len(content) > _COMPLETED_MAX_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 50 Mo).")

    # Deduce the ProjectDocument.type from the linked template (e.g. 'dc1_template').
    # Fallback to 'autre' when the template reference is missing — covers the rare
    # case where the IA flagged a template but no template was uploaded in the DCE.
    doc_type = "autre"
    if item.template_project_doc_id:
        template = db.query(ProjectDocument).filter(
            ProjectDocument.id == item.template_project_doc_id,
            ProjectDocument.project_id == project_id,
        ).first()
        if template:
            doc_type = template.type

    stored_name = f"{uuid.uuid4()}_{safe_name}"
    rel_path = Path(project_id) / "completed" / stored_name
    abs_path = UPLOADS_ROOT / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(content)
    file_url = f"/uploads/{rel_path.as_posix()}"

    pd = ProjectDocument(
        project_id=project_id,
        type=doc_type,
        file_url=file_url,
        file_name=safe_name,
        file_size=len(content),
        is_user_completed=True,
    )
    db.add(pd)
    db.flush()  # need pd.id before updating item

    item.completed_project_doc_id = pd.id
    item.status = "present"
    if item.details:
        item.details = f"Template complété : {safe_name}"
    db.commit()
    db.refresh(item)
    return item


class LinkVaultDocBody(BaseModel):
    document_id: str


@router.put(
    "/{project_id}/checklist/{item_id}/link",
    response_model=ChecklistItemResponse,
)
def link_vault_document(
    project_id: str,
    item_id: str,
    body: LinkVaultDocBody,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Link a vault Document to a checklist item (source_kind='vault')."""
    _get_project_or_404(project_id, user.organization_id, db)
    item = _get_checklist_item_or_404(item_id, project_id, db)

    if item.source_kind != "vault":
        raise HTTPException(
            status_code=400,
            detail="Cet item attend un template DCE, pas un document du coffre-fort.",
        )

    doc = db.query(Document).filter(
        Document.id == body.document_id,
        Document.organization_id == user.organization_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document du coffre-fort introuvable.")

    item.linked_document_id = doc.id
    item.status = _vault_doc_status(doc)
    db.commit()
    db.refresh(item)
    return item


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project


def _get_checklist_item_or_404(item_id: str, project_id: str, db: Session) -> ChecklistItem:
    item = db.query(ChecklistItem).filter(
        ChecklistItem.id == item_id,
        ChecklistItem.project_id == project_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de checklist introuvable")
    return item


def _vault_doc_status(doc: Document) -> str:
    if doc.status == "expired":
        return "expire"
    if doc.status == "expiring_soon":
        return "expiration_proche"
    return "present"
