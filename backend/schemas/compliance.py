from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ComplianceItemResponse(BaseModel):
    id: str
    project_id: str
    exigence_text: str
    source_document: Optional[str]
    source_page: Optional[int]
    source_excerpt: Optional[str]
    status: str
    category: str
    priority: str
    suggestion_ia: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChecklistItemResponse(BaseModel):
    id: str
    project_id: str
    document_type_required: str
    linked_document_id: Optional[str]
    status: str
    details: Optional[str]
    source_in_rc: Optional[str]

    model_config = {"from_attributes": True}
