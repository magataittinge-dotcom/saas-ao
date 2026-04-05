import io
import zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.project import Project, ProjectDocument
from models.compliance_item import ComplianceItem
from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique
from schemas.export import ExportSummary, ExportDetail, ComplianceExportItem, ChecklistExportItem, MemoireExportInfo, DpgfExportInfo
from routers.auth import get_auth_user

router = APIRouter()


@router.get("/{project_id}/export/detail", response_model=ExportDetail)
def get_export_detail(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Detailed export data for the verification dashboard."""
    _get_project_or_404(project_id, user.organization_id, db)

    compliance_items = (
        db.query(ComplianceItem)
        .filter(ComplianceItem.project_id == project_id)
        .order_by(ComplianceItem.category, ComplianceItem.created_at)
        .all()
    )
    checklist_items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .all()
    )
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    project_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()

    # Build checklist with linked doc names
    from models.document import Document
    checklist_export = []
    for item in checklist_items:
        doc_name = None
        if item.linked_document_id:
            doc = db.query(Document).filter(Document.id == item.linked_document_id).first()
            if doc:
                doc_name = doc.file_name
        checklist_export.append(ChecklistExportItem(
            id=item.id,
            document_type_required=item.document_type_required,
            status=item.status,
            details=item.details,
            linked_document_name=doc_name,
        ))

    # Mémoire info
    memoire_info = None
    if memoire:
        cj = memoire.content_json or {}
        sections = 1  # preambule
        for part_key in ("partie_a", "partie_b", "partie_c"):
            part = cj.get(part_key, {})
            if isinstance(part, dict):
                sections += sum(1 for v in part.values() if v)
        # Estimate ~1 page per 500 words
        total_text = str(cj)
        word_count = len(total_text.split())
        estimated_pages = max(1, word_count // 500)
        memoire_info = MemoireExportInfo(
            version=memoire.version,
            generated_at=memoire.generated_at,
            sections_count=sections,
            estimated_pages=estimated_pages,
        )

    # DPGF info
    dpgf_info = None
    dpgf_doc = next((d for d in project_docs if d.type == "dpgf"), None)
    if dpgf_doc:
        dpgf_info = DpgfExportInfo(file_name=dpgf_doc.file_name, file_id=dpgf_doc.id)

    return ExportDetail(
        compliance_total=len(compliance_items),
        compliance_covered=sum(1 for i in compliance_items if i.status == "couvert"),
        checklist_total=len(checklist_items),
        checklist_present=sum(1 for i in checklist_items if i.status == "present"),
        has_memoire=memoire is not None,
        has_dpgf=dpgf_doc is not None,
        compliance_items=[ComplianceExportItem.model_validate(i) for i in compliance_items],
        checklist_items=checklist_export,
        memoire_info=memoire_info,
        dpgf_info=dpgf_info,
    )


@router.get("/{project_id}/export/summary", response_model=ExportSummary)
def get_export_summary(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)

    compliance_items = db.query(ComplianceItem).filter(ComplianceItem.project_id == project_id).all()
    checklist_items = db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).all()
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    project_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()

    return ExportSummary(
        compliance_total=len(compliance_items),
        compliance_covered=sum(1 for i in compliance_items if i.status == "couvert"),
        checklist_total=len(checklist_items),
        checklist_present=sum(1 for i in checklist_items if i.status == "present"),
        has_memoire=memoire is not None,
        has_dpgf=any(d.type == "dpgf" for d in project_docs),
    )


@router.get("/{project_id}/export/docx")
def export_docx(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)

    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")

    from models.organization import Organization
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    org_name = org.name if org else "Entreprise"

    from services.docx_exporter import build_memoire_docx
    docx_bytes = build_memoire_docx(memoire.content_json, project.name, org_name)

    filename = f"Memoire_Technique_{project.name.replace(' ', '_')}.docx"
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/export/zip")
def export_zip(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)

    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    from models.organization import Organization
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()

    org_name = org.name if org else "Entreprise"

    from services.docx_exporter import build_memoire_docx
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if memoire:
            docx_bytes = build_memoire_docx(memoire.content_json, project.name, org_name)
            zf.writestr(f"Memoire_Technique_{project.name.replace(' ', '_')}.docx", docx_bytes)

        zf.writestr(
            "README.txt",
            f"Dossier AO : {project.name}\nGénéré par Synorix\n",
        )

    buf.seek(0)
    filename = f"Dossier_AO_{project.name.replace(' ', '_')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
