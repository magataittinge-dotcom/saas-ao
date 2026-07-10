from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime


class DocumentResponse(BaseModel):
    id: str
    organization_id: str
    type: str
    category: str
    file_url: str
    file_name: str
    issued_date: Optional[date]
    expiry_date: Optional[date]
    status: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class DocumentUpdateRequest(BaseModel):
    """Re-classement manuel d'un document du coffre-fort (PATCH)."""
    type: Optional[str] = None
    category: Optional[str] = None
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None


class ProjectDocumentResponse(BaseModel):
    id: str
    project_id: str
    type: str
    file_url: str
    file_name: str
    file_size: Optional[int] = None
    page_count: Optional[int] = None
    # Audit écart #3 — warning d'extraction par fichier (scanné/corrompu/.doc).
    extraction_warning: Optional[str] = None
    pdf_preview_url: Optional[str] = None
    related_lots: Optional[List[str]] = None
    uploaded_at: datetime
    # C16 — renseigné uniquement dans la réponse d'upload quand le fichier
    # ressemble à un document perso (URSSAF, KBIS…) : {type, category}.
    vault_suggestion: Optional[dict] = None

    model_config = {"from_attributes": True}
