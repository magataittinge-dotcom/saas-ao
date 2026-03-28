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
from schemas.export import ExportSummary
from routers.auth import get_auth_user
from services.docx_exporter import DocxExporter

router = APIRouter()


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
    _get_project_or_404(project_id, user.organization_id, db)

    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")

    from models.organization import Organization
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()

    exporter = DocxExporter()
    docx_bytes = exporter.export(memoire.content_json, org)

    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=memoire_technique.docx"},
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

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if memoire:
            exporter = DocxExporter()
            docx_bytes = exporter.export(memoire.content_json, org)
            zf.writestr("memoire_technique.docx", docx_bytes)

        zf.writestr(
            "README.txt",
            f"Dossier AO : {project.name}\nGénéré par AO BTP IA\n",
        )

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=dossier_ao.zip"},
    )


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
