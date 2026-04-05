from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ExportSummary(BaseModel):
    compliance_total: int
    compliance_covered: int
    checklist_total: int
    checklist_present: int
    has_memoire: bool
    has_dpgf: bool


class ComplianceExportItem(BaseModel):
    id: str
    exigence_text: str
    category: str
    priority: str
    status: str

    model_config = {"from_attributes": True}


class ChecklistExportItem(BaseModel):
    id: str
    document_type_required: str
    status: str
    details: Optional[str] = None
    linked_document_name: Optional[str] = None

    model_config = {"from_attributes": True}


class MemoireExportInfo(BaseModel):
    version: int
    generated_at: datetime
    sections_count: int
    estimated_pages: int


class DpgfExportInfo(BaseModel):
    file_name: str
    file_id: str


class ExportDetail(BaseModel):
    # Summary counts
    compliance_total: int
    compliance_covered: int
    checklist_total: int
    checklist_present: int
    has_memoire: bool
    has_dpgf: bool

    # Detailed items
    compliance_items: list[ComplianceExportItem]
    checklist_items: list[ChecklistExportItem]
    memoire_info: Optional[MemoireExportInfo] = None
    dpgf_info: Optional[DpgfExportInfo] = None
