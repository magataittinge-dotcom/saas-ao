from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime


class DocumentResponse(BaseModel):
    id: str
    organization_id: str
    type: str
    file_url: str
    file_name: str
    issued_date: Optional[date]
    expiry_date: Optional[date]
    status: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ProjectDocumentResponse(BaseModel):
    id: str
    project_id: str
    type: str
    file_url: str
    file_name: str
    file_size: Optional[int] = None
    page_count: Optional[int] = None
    pdf_preview_url: Optional[str] = None
    related_lots: Optional[List[str]] = None
    uploaded_at: datetime

    model_config = {"from_attributes": True}
