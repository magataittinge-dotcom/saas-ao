import zipfile
import re
import unicodedata
import io as _io
from typing import List, Optional, Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.user import User
from models.project import Project, ProjectDocument
from schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectDocumentUpdate
from schemas.document import ProjectDocumentResponse
from routers.auth import get_auth_user
from services.file_storage import FileStorage
from services.document_processor import DocumentProcessor
from services.pdf_converter import PdfConverter
from services.lot_detector import LotDetector
from services.document_tagger import assign_document_lots
from pathlib import Path as FilePath

UPLOADS_ROOT = FilePath(__file__).parent.parent / "uploads"

router = APIRouter()
storage = FileStorage()
processor = DocumentProcessor()
lot_detector = LotDetector()


class LotSelectPayload(BaseModel):
    lot_id: Optional[str] = None       # None = pas de lot sélectionné (marché unique)
    lot_name: Optional[str] = None


# ─── Document type detection (AMÉLIORATION 8) ─────────────────────────────────

def _normalize_fname(text: str) -> str:
    """Lowercase + strip diacritics (for filename matching)."""
    nfkd = unicodedata.normalize("NFKD", text)
    return re.sub(r'\s+', ' ', nfkd.encode("ascii", "ignore").decode("ascii").lower()).strip()


def _detect_doc_type(filename: str, form_type: str) -> str:
    """
    Auto-detect document type from filename.
    Enhanced with normalized matching and more patterns (AMÉLIORATION 8).
    Uses (?<![a-z0-9]) / (?![a-z0-9]) instead of \b to correctly handle underscores.
    """
    if form_type != "autre":
        return form_type

    norm = _normalize_fname(filename)

    # Token boundary helpers: underscores, dots, dashes act as separators
    def tok(t: str) -> str:
        return r'(?<![a-z0-9])' + t + r'(?![a-z0-9])'

    # ── RC — Règlement de Consultation ────────────────────────────────────────
    # Note: 'rdc' removed — it matches "rez-de-chaussée" in plan filenames
    is_rc = bool(re.search(
        r'reglement|r[eè]gl[\._\s]?consul|' + tok('rc') + r'|'
        r'reglement.{0,4}consultation',
        norm
    ))
    is_annexe = bool(re.search(r'annexe|nommage|cadre|liste|modele', norm))
    is_plan = bool(re.search(r'plan|arch|coupe|facade|niveau|rez.{0,4}de.{0,4}chaussee|zoom|etage|r\+\d', norm))
    if is_rc and not is_annexe and not is_plan:
        return 'rc'

    # ── CCAP — Cahier des Clauses Administratives ──────────────────────────────
    if re.search(tok('ccap') + r'|clauses.{0,4}admin', norm):
        return 'ccap'

    # ── CCTP — Cahier des Clauses Techniques ──────────────────────────────────
    if re.search(tok('cctp') + r'|clauses.{0,4}tech|cahier.{0,6}technique', norm):
        return 'cctp'

    # ── DPGF / BPU / DQE — Pricing documents (+ .ods) ────────────────────────
    if filename.lower().endswith(".ods") and re.search(r'dpgf|prix|bordereau|decomposition', norm):
        return 'dpgf'
    if re.search(tok('dpgf') + r'|decomposition|prix.{0,6}global', norm):
        return 'dpgf'
    if re.search(tok('bpu') + r'|bordereau.{0,6}prix|prix.{0,6}unitaire', norm):
        return 'dpgf'
    if re.search(tok('dqe') + r'|detail.{0,6}quantitatif|detail.{0,6}estimatif', norm):
        return 'dpgf'

    # ── Acte d'Engagement ─────────────────────────────────────────────────────
    if re.search(
        r'acte.{0,6}engagement|acte_engagement|' + tok('ae') + r'|attri\d*|' + tok('dc[34]'),
        norm
    ):
        return 'acte_engagement'

    # ── Plans ─────────────────────────────────────────────────────────────────
    if re.search(tok('plans?') + r'|\.dwg$|\.dwf$|\.dxf$|archi|coupe|facade|niveau|rez.{0,4}de.{0,4}chaussee', norm):
        return 'plan'

    return 'autre'


# ─── ZIP filename decoding (AMÉLIORATION 4) ────────────────────────────────────

def _decode_zip_entry_name(member: zipfile.ZipInfo) -> str:
    """
    Robustly decode a ZIP entry filename.
    Handles CP437 (default ZIP), Latin-1, and Windows-1252 encodings
    used by French public procurement platforms (PLACE, achatpublic.com, AWS).
    """
    if member.flag_bits & 0x800:
        # UTF-8 flag set — Python already decoded it correctly
        raw = member.filename
    else:
        # Python decoded as CP437 by default; French files may use Latin-1
        try:
            raw = member.filename.encode('cp437').decode('latin-1')
        except (UnicodeDecodeError, UnicodeEncodeError):
            try:
                raw = member.filename.encode('cp437').decode('utf-8', errors='replace')
            except Exception:
                raw = member.filename

    # Keep only the basename (flatten directory structure)
    base = raw.replace("\\", "/").split("/")[-1]

    # Sanitize characters that are invalid on most filesystems and in URLs
    base = re.sub(r'[<>:"|?*\x00-\x1f]', '_', base)
    # Collapse multiple underscores/spaces
    base = re.sub(r'_+', '_', base).strip('_. ')

    return base or "fichier_sans_nom"


# ─── Lots cache invalidation (AMÉLIORATION 7) ─────────────────────────────────

def _invalidate_lots_cache(project_id: str, db: Session) -> None:
    """Set lots_detectes = NULL to force re-detection on next GET /lots."""
    db.query(Project).filter(Project.id == project_id).update(
        {"lots_detectes": None},
        synchronize_session=False,
    )
    db.commit()


# ─── Project CRUD ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[ProjectResponse])
def list_projects(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    return (
        db.query(Project)
        .filter(Project.organization_id == user.organization_id)
        .order_by(Project.updated_at.desc())
        .all()
    )


@router.post("", response_model=ProjectResponse)
def create_project(
    payload: ProjectCreate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = Project(
        organization_id=user.organization_id,
        name=payload.name,
        maitre_ouvrage=payload.maitre_ouvrage,
        deadline=payload.deadline,
        status="brouillon",
        current_step=1,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, user.organization_id, db)
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)
    db.delete(project)
    db.commit()


# ─── Project Documents ────────────────────────────────────────────────────────

@router.get("/{project_id}/documents", response_model=List[ProjectDocumentResponse])
def list_project_documents(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    return db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()


def _convert_to_pdf_background(doc_id: str, file_url: str, filename: str) -> None:
    """Background task : convertit le fichier en PDF pour prévisualisation."""
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        from database import SessionLocal

        if not PdfConverter.can_convert(filename):
            return
        if not file_url.startswith("/uploads/"):
            return

        source_path = UPLOADS_ROOT / file_url.removeprefix("/uploads/")
        if not source_path.exists():
            _log.error(f"Fichier source introuvable pour conversion: {source_path}")
            return

        pdf_path = PdfConverter.convert_to_pdf(source_path, source_path.parent)
        if not pdf_path:
            return

        relative_pdf = pdf_path.relative_to(UPLOADS_ROOT)
        pdf_preview_url = f"/uploads/{relative_pdf}"

        db = SessionLocal()
        try:
            doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
            if doc:
                doc.pdf_preview_url = pdf_preview_url
                db.commit()
        finally:
            db.close()
    except Exception as e:
        _log.error(f"Erreur conversion PDF background pour {filename}: {e}")


@router.post("/{project_id}/documents")
async def upload_project_document(
    project_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    type: str = Form("autre"),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
) -> Any:
    _get_project_or_404(project_id, user.organization_id, db)

    content = await file.read()

    # ── ZIP handling ──────────────────────────────────────────────────────────
    if file.filename.lower().endswith(".zip"):
        docs, zip_warnings = await _handle_zip_upload(content, project_id, background_tasks, db)
        # Invalidate lots cache after new documents added (AMÉLIORATION 7)
        _invalidate_lots_cache(project_id, db)
        response: dict = {
            "documents": [ProjectDocumentResponse.model_validate(d) for d in docs],
            "extracted_count": len(docs),
        }
        if zip_warnings:
            response["warnings"] = zip_warnings  # AMÉLIORATION 9
        return response

    # ── Regular single-file upload ────────────────────────────────────────────
    doc = await _create_project_document(
        content, file.filename, file.content_type or "",
        type, project_id, background_tasks, db,
    )
    # Invalidate lots cache (AMÉLIORATION 7)
    _invalidate_lots_cache(project_id, db)
    return ProjectDocumentResponse.model_validate(doc)


def _extract_text_background(doc_id: str, content: bytes, filename: str) -> None:
    """Background task: extract text from document and update DB."""
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        from database import SessionLocal

        extracted_text, page_count = processor.extract(content, filename)
        # PostgreSQL rejects NUL (0x00) in text columns — strip them
        if extracted_text:
            extracted_text = extracted_text.replace("\x00", "")

        db = SessionLocal()
        try:
            doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
            if doc:
                if extracted_text is not None:
                    doc.extracted_text = extracted_text
                if page_count is not None:
                    doc.page_count = page_count
                db.commit()
                _log.info(f"Text extraction done for {filename} (doc {doc_id}): {len(extracted_text or '')} chars, {page_count} pages")
        finally:
            db.close()
    except Exception as e:
        _log.error(f"Background text extraction failed for {filename}: {e}")


async def _create_project_document(
    content: bytes,
    filename: str,
    content_type: str,
    form_type: str,
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session,
) -> ProjectDocument:
    """Upload one file, persist to DB, schedule text extraction + PDF conversion in background."""
    import logging as _logging
    _log = _logging.getLogger(__name__)

    file_url = await storage.upload(
        content,
        filename,
        f"projects/{project_id}/dce",
        content_type or None,
    )

    doc_type = _detect_doc_type(filename, form_type)

    # Key document types needed for lot detection — extract text synchronously
    # if file is small enough (< 5MB). Large files (plans, scans) stay async.
    _KEY_DOC_TYPES = {'rc', 'ccap', 'cctp', 'dpgf', 'acte_engagement'}
    _SYNC_EXTRACT_MAX = 5 * 1024 * 1024  # 5 MB

    extracted_text = None
    page_count = None
    if doc_type in _KEY_DOC_TYPES and len(content) < _SYNC_EXTRACT_MAX:
        try:
            extracted_text, page_count = processor.extract(content, filename)
            if extracted_text:
                extracted_text = extracted_text.replace("\x00", "")
        except Exception as e:
            _log.warning(f"Sync extraction failed for {filename}, will retry in background: {e}")
            extracted_text = None
            page_count = None

    doc = ProjectDocument(
        project_id=project_id,
        type=doc_type,
        file_url=file_url,
        file_name=filename,
        file_size=len(content),
        extracted_text=extracted_text,
        page_count=page_count,
        related_lots=assign_document_lots(filename, doc_type),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # If text wasn't extracted synchronously, schedule background extraction
    if extracted_text is None:
        background_tasks.add_task(_extract_text_background, doc.id, content, filename)

    try:
        if PdfConverter.can_convert(filename):
            background_tasks.add_task(_convert_to_pdf_background, doc.id, doc.file_url, filename)
    except Exception as e:
        _log.error(f"Impossible de planifier la conversion PDF pour {filename}: {e}")

    return doc


# Files to extract from a ZIP (AMÉLIORATION 1: added .ods)
_ZIP_ALLOWED = {".pdf", ".docx", ".xlsx", ".xls", ".doc", ".ods"}
# Ignore macOS artefacts and hidden files
_ZIP_IGNORE = re.compile(r'^(__MACOSX[/\\]|\.)', re.IGNORECASE)


async def _extract_zip_members(
    content: bytes,
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session,
    existing_names: set,
    used_in_zip: set,
    warnings: List[str],
    depth: int = 0,
) -> List[ProjectDocument]:
    """
    Core ZIP extraction logic (recursive for nested ZIPs — AMÉLIORATION 2).
    depth: current recursion level (max 2).
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)

    created: List[ProjectDocument] = []

    try:
        zf = zipfile.ZipFile(_io.BytesIO(content), 'r')
    except zipfile.BadZipFile:
        if depth == 0:
            raise HTTPException(status_code=400, detail="Fichier ZIP invalide ou corrompu")
        warnings.append("Archive ZIP imbriquée invalide ou corrompue (ignorée)")
        return []

    with zf:
        members = zf.infolist()
        for member in members:
            if member.is_dir():
                continue

            raw_name = member.filename
            parts = raw_name.replace("\\", "/").split("/")
            if any(p.startswith("__MACOSX") or (p.startswith(".") and p not in (".", "..")) for p in parts):
                continue

            base = _decode_zip_entry_name(member)
            if not base:
                continue

            suffix = FilePath(base).suffix.lower()

            # AMÉLIORATION 2: nested ZIP — recurse (max 2 levels)
            if suffix == ".zip" and depth < 2:
                if member.file_size == 0:
                    continue
                try:
                    inner_bytes = zf.read(member)
                    inner_docs = await _extract_zip_members(
                        inner_bytes, project_id, background_tasks, db,
                        existing_names, used_in_zip, warnings, depth=depth + 1,
                    )
                    created.extend(inner_docs)
                    _log.info(f"ZIP imbriqué '{base}' extrait: {len(inner_docs)} fichiers")
                except Exception as e:
                    warnings.append(f"{base} : archive imbriquée non extractible ({e})")
                continue

            # AMÉLIORATION 9: track unsupported formats for warnings
            if suffix not in _ZIP_ALLOWED:
                if suffix in (".rar", ".7z"):
                    warnings.append(
                        f"{base} : format {suffix} non supporté — convertissez en .zip"
                    )
                else:
                    _log.debug(f"ZIP: ignoré {raw_name} (extension {suffix})")
                continue

            if member.file_size == 0:
                continue

            # Deduplicate basename within this upload session
            if base in used_in_zip:
                stem = FilePath(base).stem
                ext = FilePath(base).suffix
                counter = 2
                while f"{stem}_{counter}{ext}" in used_in_zip:
                    counter += 1
                base = f"{stem}_{counter}{ext}"
            used_in_zip.add(base)

            # Skip if already exists in the project
            if base.lower().strip() in existing_names:
                _log.info(f"ZIP: doublon ignoré '{base}' (déjà présent dans le projet)")
                continue

            try:
                file_bytes = zf.read(member)
            except Exception as e:
                warnings.append(f"{base} : impossible de lire le fichier ({e})")
                _log.warning(f"ZIP: impossible de lire {raw_name}: {e}")
                continue

            try:
                doc = await _create_project_document(
                    file_bytes, base, "", "autre",
                    project_id, background_tasks, db,
                )
                created.append(doc)
                existing_names.add(base.lower().strip())
                _log.info(f"ZIP extrait: {base} → type={doc.type}")
            except Exception as e:
                db.rollback()
                warnings.append(f"{base} : erreur lors de l'import ({e})")
                _log.error(f"ZIP: erreur création doc pour {raw_name}: {e}")

    return created


async def _handle_zip_upload(
    content: bytes,
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session,
) -> tuple[List[ProjectDocument], List[str]]:
    """
    Extract a ZIP and create one ProjectDocument per valid file inside.
    Returns (created_docs, warnings).

    AMÉLIORATION 2: nested ZIP support (max 2 levels)
    AMÉLIORATION 9: returns warnings for failed/skipped files
    """
    # Pre-fetch existing filenames for duplicate check
    existing_rows = (
        db.query(ProjectDocument.file_name)
        .filter(ProjectDocument.project_id == project_id)
        .all()
    )
    existing_names: set = {row[0].lower().strip() for row in existing_rows}
    used_in_zip: set = set()
    warnings: List[str] = []

    created = await _extract_zip_members(
        content, project_id, background_tasks, db,
        existing_names, used_in_zip, warnings, depth=0,
    )
    return created, warnings


@router.patch("/{project_id}/documents/{doc_id}", response_model=ProjectDocumentResponse)
def update_project_document(
    project_id: str,
    doc_id: str,
    payload: ProjectDocumentUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    doc = db.query(ProjectDocument).filter(
        ProjectDocument.id == doc_id,
        ProjectDocument.project_id == project_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    doc.type = payload.type
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{project_id}/documents/{doc_id}", status_code=204)
def delete_project_document(
    project_id: str,
    doc_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    doc = db.query(ProjectDocument).filter(
        ProjectDocument.id == doc_id,
        ProjectDocument.project_id == project_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    storage.delete_local(doc.file_url)
    db.delete(doc)
    db.commit()
    # Invalidate lots cache after document removal (AMÉLIORATION 7)
    _invalidate_lots_cache(project_id, db)


@router.get("/{project_id}/lots")
def detect_lots(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """
    Detect lots from uploaded documents. Fast (no AI), uses extracted text only.
    AMÉLIORATION 7: returns cached result if lots_detectes is not NULL.
    Cache is invalidated on document upload or delete.
    """
    project = _get_project_or_404(project_id, user.organization_id, db)
    docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()

    if not docs:
        raise HTTPException(status_code=400, detail="Aucun document uploadé pour ce projet")

    # ── Cache hit (AMÉLIORATION 7) ─────────────────────────────────────────────
    if project.lots_detectes is not None:
        cached = project.lots_detectes
        return {"lots": cached, "count": len(cached), "cached": True}

    # ── Cache miss: run detection ──────────────────────────────────────────────
    lots = lot_detector.detect(docs, uploads_root=UPLOADS_ROOT)

    # Persist result in cache
    project.lots_detectes = lots or []
    db.commit()

    return {"lots": lots, "count": len(lots), "cached": False}


@router.post("/{project_id}/lots/select", response_model=ProjectResponse)
def select_lot(
    project_id: str,
    payload: LotSelectPayload,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Save the selected lot and advance to step 3 (AI analysis)."""
    project = _get_project_or_404(project_id, user.organization_id, db)

    project.selected_lot = payload.lot_id or None
    project.selected_lot_name = payload.lot_name or None

    # Mark step 2 complete, advance to step 3
    steps = dict(project.completed_steps or {})
    steps["2"] = True
    project.completed_steps = steps
    if project.current_step <= 2:
        project.current_step = 3

    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/complete-step/{step}", response_model=ProjectResponse)
def complete_step(
    project_id: str,
    step: int,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Mark a step as explicitly completed (user validation button). Advances current_step if needed."""
    project = _get_project_or_404(project_id, user.organization_id, db)

    steps = dict(project.completed_steps or {})
    steps[str(step)] = True
    project.completed_steps = steps

    if project.current_step <= step:
        project.current_step = step + 1

    db.commit()
    db.refresh(project)
    return project


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
