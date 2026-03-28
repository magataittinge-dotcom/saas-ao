from pydantic import BaseModel


class ExportSummary(BaseModel):
    compliance_total: int
    compliance_covered: int
    checklist_total: int
    checklist_present: int
    has_memoire: bool
    has_dpgf: bool
