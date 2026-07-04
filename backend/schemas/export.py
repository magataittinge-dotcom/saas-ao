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
    linked_document_id: Optional[str] = None

    model_config = {"from_attributes": True}


class ProjectDocumentExportItem(BaseModel):
    id: str
    file_name: str
    type: str
    pdf_preview_url: Optional[str] = None

    model_config = {"from_attributes": True}


class MemoireExportInfo(BaseModel):
    version: int
    generated_at: datetime
    sections_count: int
    estimated_pages: int


class DpgfExportInfo(BaseModel):
    file_name: str
    file_id: str


class DpgfRemplieInfo(BaseModel):
    file_name: Optional[str] = None
    verification: Optional[dict] = None


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
    project_documents: list[ProjectDocumentExportItem] = []
    memoire_info: Optional[MemoireExportInfo] = None
    dpgf_info: Optional[DpgfExportInfo] = None
    dpgf_remplie: Optional[DpgfRemplieInfo] = None
    # C13b — convention de nommage détectée dans le RC (template), sinon None
    naming_convention: Optional[str] = None
