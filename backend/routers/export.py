import asyncio
import io
import json
import logging
import re
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path as FilePath
from urllib.parse import quote
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.project import Project, ProjectDocument
from models.compliance_item import ComplianceItem
from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique
from schemas.export import ExportSummary, ExportDetail, ComplianceExportItem, ChecklistExportItem, MemoireExportInfo, DpgfExportInfo, ProjectDocumentExportItem
from routers.auth import get_auth_user
from services.file_storage import FileStorage
from services.dpgf_checker import check_dpgf
from services.pdf_export import PdfConversionError, docx_to_pdf

logger = logging.getLogger(__name__)

UPLOADS_ROOT = FilePath(__file__).parent.parent / "uploads"

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
            linked_document_id=item.linked_document_id,
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
    dpgf_doc = next((d for d in project_docs if d.type == "dpgf_template"), None)
    if dpgf_doc:
        dpgf_info = DpgfExportInfo(file_name=dpgf_doc.file_name, file_id=dpgf_doc.id)

    # DPGF remplie info
    project = _get_project_or_404(project_id, user.organization_id, db)
    dpgf_remplie = None
    if project.dpgf_remplie_url:
        dpgf_remplie = {
            "file_name": project.dpgf_remplie_name,
            "verification": project.dpgf_remplie_check or {},
        }

    # Project documents list for preview
    project_docs_export = [
        ProjectDocumentExportItem(
            id=d.id,
            file_name=d.file_name,
            type=d.type or "autre",
            pdf_preview_url=d.pdf_preview_url,
        )
        for d in project_docs
    ]

    # C13b — convention de nommage du RC (signalée dans l'UI d'export)
    from services.export_naming import detect_naming_convention
    rc_doc = next(
        (d for d in project_docs if (d.type or "") == "rc" and d.extracted_text
         and not d.extracted_text.startswith("[document volumineux")),
        None,
    )
    convention = detect_naming_convention(rc_doc.extracted_text) if rc_doc else None

    return ExportDetail(
        compliance_total=len(compliance_items),
        compliance_covered=sum(1 for i in compliance_items if i.status == "couvert"),
        checklist_total=len(checklist_items),
        checklist_present=sum(1 for i in checklist_items if i.status == "present"),
        has_memoire=memoire is not None,
        has_dpgf=dpgf_doc is not None,
        compliance_items=[ComplianceExportItem.model_validate(i) for i in compliance_items],
        checklist_items=checklist_export,
        project_documents=project_docs_export,
        memoire_info=memoire_info,
        dpgf_info=dpgf_info,
        dpgf_remplie=dpgf_remplie,
        naming_convention=convention["template"] if convention else None,
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
        has_dpgf=any(d.type == "dpgf_template" for d in project_docs),
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

    # Point 7 — SOURCE UNIQUE : même builder complet que /memoire/export-docx
    # (page de garde, organigramme, carte, logo). Le builder nu laissait le
    # bouton de l'étape Export produire un docx sans page de garde ni images.
    from routers.memoire import build_project_memoire_docx
    docx_bytes = build_project_memoire_docx(project, memoire, org, db)

    filename = f"Memoire_Technique_{project.name.replace(' ', '_')}.docx"
    ascii_name = filename.encode("ascii", errors="replace").decode("ascii")
    utf8_name = quote(filename, safe="")
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"},
    )


@router.get("/{project_id}/export/zip")
def export_zip(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """
    Export a ZIP containing ONLY the deliverables produced by the company.
    Never includes originals from the DCE (RC, CCAP, CCTP, blank templates).

    Contents:
      - 01_Candidature/ : vault documents linked via checklist
                          + ProjectDocuments flagged is_user_completed=True
      - 02_Offre/       : Memoire_technique.docx + DPGF remplie
                          + user-completed offer documents (AE signé, etc.)
    """
    project = _get_project_or_404(project_id, user.organization_id, db)

    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    from models.organization import Organization
    from models.document import Document
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    org_name = org.name if org else "Entreprise"

    project_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    # C13b — l'ordre des pièces suit l'ordre du RC (rc_position posé par
    # l'analyse) ; les checklists antérieures (NULL) restent en fin.
    from sqlalchemy import func as _func
    checklist_items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id)
        .order_by(_func.coalesce(ChecklistItem.rc_position, 999_999))
        .all()
    )

    # C13b — convention de nommage éventuelle du RC
    from services.export_naming import apply_convention, detect_naming_convention
    rc_doc = next(
        (d for d in project_docs if (d.type or "") == "rc" and d.extracted_text
         and not d.extracted_text.startswith("[document volumineux")),
        None,
    )
    convention = detect_naming_convention(rc_doc.extracted_text) if rc_doc else None
    lot_segment = project.selected_lot or (project.selected_lot_name or "lot").split("—")[0].strip()

    # Collect coffre-fort documents linked via checklist
    linked_doc_ids = {ci.linked_document_id for ci in checklist_items if ci.linked_document_id}
    vault_docs = (
        db.query(Document).filter(Document.id.in_(linked_doc_ids)).all()
        if linked_doc_ids else []
    )
    vault_by_id = {d.id: d for d in vault_docs}

    def _piece_arcname(counter: int, original_name: str) -> str:
        """Numérotation ordre RC + convention du RC si détectée."""
        stem = FilePath(original_name).stem
        ext = FilePath(original_name).suffix
        if convention:
            named = apply_convention(
                convention["template"],
                lot=lot_segment, entreprise=org_name, piece=stem,
            )
            return f"{counter:02d}_{named}{ext}"
        return f"{counter:02d}_{original_name}"

    # ── Build root folder name ────────────────────────────────────────────────
    lot_suffix = ""
    if project.selected_lot_name:
        lot_suffix = "_" + _sanitize(project.selected_lot_name)
    date_str = datetime.utcnow().strftime("%Y%m%d")
    root = f"Reponse_AO_{_sanitize(project.name)}{lot_suffix}_{date_str}"

    # ── Offer-side destination for user-completed project documents ───────
    # DPGF/AE completed by the user belong to 02_Offre, everything else to
    # 01_Candidature (DC1, DC2, declaration honneur, etc.).
    OFFER_COMPLETED_TYPES = {"dpgf_template", "acte_engagement_template"}

    warnings: list[str] = []
    buf = io.BytesIO()
    seen_names: dict[str, int] = {}

    from services.docx_exporter import build_memoire_docx

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:

        # ── 01_Candidature: vault documents linked by checklist ───────────
        # C13b — numérotation = ordre du RC, convention de nommage appliquée.
        piece_counter = 0
        for ci in checklist_items:
            doc = vault_by_id.get(ci.linked_document_id) if ci.linked_document_id else None
            if not doc:
                continue
            piece_counter += 1
            _add_file_to_zip(
                zf, doc.file_url, _piece_arcname(piece_counter, doc.file_name),
                f"{root}/01_Candidature", seen_names,
            )

        # ── User-completed project documents (DC1/DC2 rempli, AE signé) ───
        for doc in project_docs:
            if not getattr(doc, "is_user_completed", False):
                continue
            doc_type = doc.type or "autre"
            folder_sub = "02_Offre" if doc_type in OFFER_COMPLETED_TYPES else "01_Candidature"
            if folder_sub == "01_Candidature":
                piece_counter += 1
                arcname = _piece_arcname(piece_counter, doc.file_name)
            else:
                arcname = doc.file_name
            _add_file_to_zip(zf, doc.file_url, arcname, f"{root}/{folder_sub}", seen_names)

        # ── 02_Offre: mémoire technique ───────────────────────────────────
        # C13a — le PDF est la version dépôt par défaut ; conversion
        # impossible → fallback DOCX (jamais de ZIP sans mémoire).
        if memoire:
            from routers.memoire import build_project_memoire_docx
            docx_bytes = build_project_memoire_docx(project, memoire, org, db)
            try:
                pdf_bytes = docx_to_pdf(docx_bytes)
                zf.writestr(f"{root}/02_Offre/Memoire_technique.pdf", pdf_bytes)
            except PdfConversionError as exc:
                logger.warning("PDF mémoire indisponible pour le ZIP : %s", exc)
                warnings.append(
                    "Mémoire fourni en Word (conversion PDF indisponible sur ce serveur)"
                )
                zf.writestr(f"{root}/02_Offre/Memoire_technique.docx", docx_bytes)
        else:
            warnings.append("Mémoire technique non généré")

        # ── 3_ANNEXES : pièces du coffre sélectionnées au pre-flight ───────
        # (BONUS Lot 5) — ownership org : seuls les documents de l'org sortent.
        annexe_ids = list(((memoire.variables if memoire else None) or {}).get(
            "annexe_document_ids") or [])
        if annexe_ids:
            annexe_docs = db.query(Document).filter(
                Document.id.in_(annexe_ids),
                Document.organization_id == user.organization_id,
                Document.deleted_at.is_(None),
            ).all()
            for doc in annexe_docs:
                _add_file_to_zip(zf, doc.file_url, doc.file_name, f"{root}/3_ANNEXES", seen_names)

        # ── 02_Offre: filled DPGF if uploaded ─────────────────────────────
        if project.dpgf_remplie_url and project.dpgf_remplie_name:
            _add_file_to_zip(
                zf, project.dpgf_remplie_url,
                f"DPGF_remplie_{project.dpgf_remplie_name}",
                f"{root}/02_Offre", seen_names,
            )
        elif any((d.type or "") == "dpgf_template" for d in project_docs):
            warnings.append("DPGF non remplie")

        # ── Warnings for expected-but-missing user-completed documents ────
        has_completed_ae = any(
            (d.type or "") == "acte_engagement_template" and getattr(d, "is_user_completed", False)
            for d in project_docs
        )
        if not has_completed_ae and any((d.type or "") == "acte_engagement_template" for d in project_docs):
            warnings.append("Acte d'engagement non signé")

        # ── Ensure 3 folders exist (even if empty) ────────────────────────
        for sub in ("01_Candidature", "02_Offre", "03_Technique"):
            folder_path = f"{root}/{sub}/"
            if folder_path not in {info.filename for info in zf.filelist}:
                zf.writestr(folder_path, "")

    buf.seek(0)
    zip_filename = f"{root}.zip"
    ascii_zip = zip_filename.encode("ascii", errors="replace").decode("ascii")
    utf8_zip = quote(zip_filename, safe="")
    headers = {
        "Content-Disposition": f"attachment; filename=\"{ascii_zip}\"; filename*=UTF-8''{utf8_zip}",
        "X-Export-Warnings": json.dumps(warnings),
    }

    from services.audit_logger import log_action
    log_action(
        db, user, "export.zip",
        target_type="project", target_id=project_id,
        extra={
            "project_name": project.name,
            "lot": project.selected_lot,
            "warnings_count": len(warnings),
            "size_bytes": buf.getbuffer().nbytes,
        },
    )
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sanitize(name: str) -> str:
    """Normalize filename: remove accents, replace spaces/special chars with underscores."""
    # Decompose unicode and strip accents
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    # Replace non-alphanumeric (except dot, hyphen) with underscore
    clean = re.sub(r"[^a-zA-Z0-9.\-]", "_", ascii_str)
    # Collapse multiple underscores
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean or "document"


def _add_file_to_zip(
    zf: zipfile.ZipFile,
    file_url: str,
    original_name: str,
    folder: str,
    seen_names: dict[str, int],
) -> None:
    """Read a file from local storage and add it to the ZIP under folder/."""
    if not file_url:
        return

    # Resolve local file path
    if file_url.startswith("/uploads/"):
        rel = file_url.removeprefix("/uploads/")
        file_path = UPLOADS_ROOT / rel
    else:
        # S3 URL or unknown — skip (future: download from S3)
        return

    if not file_path.exists():
        return

    # Sanitize filename, preserve extension
    ext = file_path.suffix  # e.g. ".pdf"
    stem = _sanitize(FilePath(original_name).stem)
    clean_name = f"{stem}{ext}"

    # Handle duplicates within the same folder
    key = f"{folder}/{clean_name}"
    if key in seen_names:
        seen_names[key] += 1
        clean_name = f"{stem}_{seen_names[key]}{ext}"
    else:
        seen_names[key] = 1

    zf.write(file_path, f"{folder}/{clean_name}")


# ── Document download ────────────────────────────────────────────────────────

@router.get("/{project_id}/documents/{doc_id}/download")
def download_document(
    project_id: str,
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Download a project document (original file)."""
    _get_project_or_404(project_id, user.organization_id, db)
    doc = db.query(ProjectDocument).filter(
        ProjectDocument.id == doc_id,
        ProjectDocument.project_id == project_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    file_path = _resolve_local_path(doc.file_url)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    media_type = mimetypes.guess_type(doc.file_name)[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=doc.file_name,
    )


@router.get("/{project_id}/documents/{doc_id}/preview")
def preview_document(
    project_id: str,
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Preview a project document inline (Content-Disposition: inline)."""
    _get_project_or_404(project_id, user.organization_id, db)
    doc = db.query(ProjectDocument).filter(
        ProjectDocument.id == doc_id,
        ProjectDocument.project_id == project_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    # Prefer PDF preview if available
    preview_url = doc.pdf_preview_url or doc.file_url
    file_path = _resolve_local_path(preview_url)
    if not file_path or not file_path.exists():
        # Fallback to original file
        file_path = _resolve_local_path(doc.file_url)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename=\"{doc.file_name.encode('ascii', errors='replace').decode('ascii')}\"; filename*=UTF-8''{quote(doc.file_name, safe='')}"},
    )


# ── DPGF filled upload + verification ───────────────────────────────────────

_DPGF_EXTENSIONS = {".xlsx", ".xlsm", ".xls", ".ods", ".pdf"}
_storage = FileStorage()


@router.post("/{project_id}/dpgf-upload")
async def upload_filled_dpgf(
    project_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Upload a filled DPGF and run automatic verification."""
    project = _get_project_or_404(project_id, user.organization_id, db)

    # Validate extension
    ext = FilePath(file.filename or "").suffix.lower()
    if ext not in _DPGF_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté ({ext}). Formats acceptés : {', '.join(_DPGF_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50 MB
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 50 Mo)")

    # Store file
    file_url = await _storage.upload(
        content, file.filename or f"dpgf_remplie{ext}",
        prefix=f"projects/{project_id}/dpgf_remplie",
        content_type=file.content_type,
    )

    # Run verification
    local_path = _resolve_local_path(file_url)
    verification = {"valid": True, "warnings": [], "total_ht": None, "nb_lignes": 0, "nb_lignes_remplies": 0, "nb_lignes_vides": 0}
    if local_path and local_path.exists():
        # R8 — parse openpyxl/xlrd hors event-loop (règle WSL2).
        verification = await asyncio.to_thread(check_dpgf, local_path)

    # Save to project
    project.dpgf_remplie_url = file_url
    project.dpgf_remplie_name = file.filename
    project.dpgf_remplie_check = verification
    db.commit()

    return {
        "file_name": file.filename,
        "file_url": file_url,
        "verification": verification,
    }


@router.get("/{project_id}/dpgf-check")
def get_dpgf_check(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Get the latest DPGF verification result."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    if not project.dpgf_remplie_url:
        raise HTTPException(status_code=404, detail="Aucune DPGF remplie uploadée")
    return {
        "file_name": project.dpgf_remplie_name,
        "verification": project.dpgf_remplie_check or {},
    }


@router.get("/{project_id}/dpgf-remplie/download")
def download_filled_dpgf(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Download the filled DPGF file."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    if not project.dpgf_remplie_url:
        raise HTTPException(status_code=404, detail="Aucune DPGF remplie uploadée")

    file_path = _resolve_local_path(project.dpgf_remplie_url)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur")

    filename = project.dpgf_remplie_name or "DPGF_remplie"
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename,
    )


def _resolve_local_path(file_url: str) -> FilePath | None:
    """Resolve a /uploads/... URL to a local file path."""
    if not file_url or not file_url.startswith("/uploads/"):
        return None
    rel = file_url.removeprefix("/uploads/")
    return UPLOADS_ROOT / rel


# R11 — source UNIQUE (filtre org + soft-delete) ; fini les 7 copies.
from services.project_access import get_owned_project as _get_project_or_404
