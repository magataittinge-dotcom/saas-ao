import zipfile
import re
import unicodedata
import io as _io
import threading
from typing import List, Optional, Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, File, Form
from slowapi import Limiter
from slowapi.util import get_remote_address
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
from services import pipeline_tracker
from pathlib import Path as FilePath

UPLOADS_ROOT = FilePath(__file__).parent.parent / "uploads"

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
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
    Enhanced with normalized matching and full BTP document patterns.
    Uses (?<![a-z0-9]) / (?![a-z0-9]) instead of \\b to correctly handle underscores.
    """
    if form_type != "autre":
        return form_type

    norm = _normalize_fname(filename)

    # Token boundary helpers: underscores, dots, dashes act as separators
    def tok(t: str) -> str:
        return r'(?<![a-z0-9])' + t + r'(?![a-z0-9])'

    # Helpers to exclude false positives
    is_annexe = bool(re.search(r'annexe|nommage|cadre|liste|modele', norm))
    is_plan_fname = bool(re.search(
        r'(?<![a-z0-9])arch\s*\d|coupe|niveau|zoom|etage|r\+\d|'
        r'(?<![a-z0-9])el\d|(?<![a-z0-9])plan\b',
        norm,
    ))

    # ── RC — Règlement de Consultation ────────────────────────────────────────
    # Variants: RC, RCE, RDC (Règlement De Consultation), "reglement", "règlement"
    # RDC matched ONLY when NOT in a plan filename (plan/arch/coupe/EL02 - RDC)
    is_rc = bool(re.search(
        r'reglement|r[eè]gl[\._\s]?consul|' + tok('rc') + r'|' + tok('rce') + r'|'
        r'reglement.{0,4}consultation|r[eè]glement.{0,4}la.{0,4}consultation',
        norm,
    ))
    if not is_rc and not is_plan_fname and re.search(tok('rdc'), norm):
        is_rc = True
    if is_rc and not is_annexe:
        return 'rc'

    # ── CCAP — Cahier des Clauses Administratives ──────────────────────────────
    if re.search(tok('ccap') + r'|clauses.{0,6}admin|cahier.{0,6}admin', norm):
        return 'ccap'

    # ── CCTP — Cahier des Clauses Techniques ──────────────────────────────────
    # Also match lot-specific descriptive files: "lot XX ... _DCE.pdf" (common CCTP pattern)
    if re.search(tok('cctp') + r'|clauses.{0,6}tech|cahier.{0,6}technique|descriptif.{0,6}tech', norm):
        return 'cctp'
    # Lot-specific DCE PDFs are per-lot CCTPs: "lot 01 Demolition-GO_DCE.pdf"
    if re.search(r'lot[\s_-]*\d{1,2}.*_dce\.pdf$', norm) and not is_annexe:
        return 'cctp'

    # ── DPGF / BPU / DQE — Pricing documents (+ .ods) ────────────────────────
    if filename.lower().endswith(".ods") and re.search(r'dpgf|prix|bordereau|decomposition', norm):
        return 'dpgf'
    if re.search(tok('dpgf') + r'|decomposition|d[eé]composition|prix.{0,6}global|prix.{0,6}forfaitaire', norm):
        return 'dpgf'
    if re.search(tok('bpu') + r'|bordereau.{0,6}prix|prix.{0,6}unitaire', norm):
        return 'dpgf'
    if re.search(tok('dqe') + r'|d[eé]tail.{0,6}quantitatif|quantitatif.{0,6}estimatif', norm):
        return 'dpgf'

    # ── Acte d'Engagement ─────────────────────────────────────────────────────
    if re.search(
        r'acte.{0,6}engagement|acte_engagement|' + tok('ae') + r'|attri\d*|' + tok('dc[34]'),
        norm,
    ):
        return 'acte_engagement'

    # ── DC1 / DC2 — Formulaires de candidature ───────────────────────────────
    if re.search(tok('dc1') + r'|lettre.{0,6}candidature', norm):
        return 'acte_engagement'   # grouped with candidature admin docs
    if re.search(tok('dc2') + r'|declaration.{0,6}candidat', norm):
        return 'acte_engagement'

    # ── Plans ─────────────────────────────────────────────────────────────────
    if re.search(
        tok('plans?') + r'|\.dwg$|\.dwf$|\.dxf$|'
        r'(?<![a-z0-9])arch\s*\d|coupe|facade|niveau|rez.{0,4}de.{0,4}chaussee',
        norm,
    ):
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
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Aucune organisation associée à ce compte. Veuillez compléter votre inscription.")
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
@limiter.limit("10/minute")
async def upload_project_document(
    request: Request,
    project_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    type: str = Form("autre"),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
) -> Any:
    import time as _time
    import logging as _logging
    _tlog = _logging.getLogger("TIMING")
    _t0 = _time.monotonic()

    _get_project_or_404(project_id, user.organization_id, db)

    # ── Upload validation ────────────────────────────────────────────────────
    _ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".zip", ".png", ".jpg", ".jpeg"}
    _MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
    filename = (file.filename or "").lower()
    ext = filename[filename.rfind("."):] if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Type de fichier non autorisé : {ext}")

    content = await file.read()
    if len(content) > _MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 50 Mo)")
    print(f"[TIMING] file.read(): {_time.monotonic()-_t0:.2f}s ({len(content)/1024/1024:.1f} MB)", flush=True)

    # ── ZIP handling ──────────────────────────────────────────────────────────
    if file.filename.lower().endswith(".zip"):
        # Mark project as processing
        project = _get_project_or_404(project_id, user.organization_id, db)
        project.processing_status = "extracting_zip"
        project.processing_progress = 0
        project.processing_detail = "Extraction de l'archive..."
        db.commit()

        _t1 = _time.monotonic()
        docs, zip_warnings = await _handle_zip_upload(content, project_id, background_tasks, db)
        print(f"[TIMING] _handle_zip_upload ({len(docs)} docs): {_time.monotonic()-_t1:.2f}s (total: {_time.monotonic()-_t0:.2f}s)", flush=True)

        # Collect docs that still need text extraction
        docs_needing_text = [(d.id, d.file_name, d.type, d.file_size or 0, d.file_url or "") for d in docs if d.extracted_text is None]
        if docs_needing_text:
            project.processing_status = "extracting_text"
            project.processing_progress = 0
            project.processing_detail = f"0/{len(docs_needing_text)} documents"
            db.commit()
            # Launch parallel extraction in a background thread
            print(f"[TIMING] launching _extract_all_parallel: {len(docs_needing_text)} docs needing text (total: {_time.monotonic()-_t0:.2f}s)", flush=True)
            threading.Thread(
                target=_extract_all_parallel,
                args=(project_id, docs_needing_text),
                daemon=True,
            ).start()
        else:
            project.processing_status = "ready"
            project.processing_progress = 100
            project.processing_detail = ""
            db.commit()

        # Invalidate lots cache after new documents added (AMÉLIORATION 7)
        _invalidate_lots_cache(project_id, db)
        # Mark step 1 complete and advance to step 2
        _mark_step_1_complete(project, db)

        print(f"[TIMING] endpoint returning response (total: {_time.monotonic()-_t0:.2f}s)", flush=True)
        response: dict = {
            "documents": [ProjectDocumentResponse.model_validate(d) for d in docs],
            "extracted_count": len(docs),
        }
        if zip_warnings:
            response["warnings"] = zip_warnings  # AMÉLIORATION 9
        return response

    # ── Regular single-file upload ────────────────────────────────────────────
    project = _get_project_or_404(project_id, user.organization_id, db)
    doc = await _create_project_document(
        content, file.filename, file.content_type or "",
        type, project_id, background_tasks, db,
    )
    # Invalidate lots cache (AMÉLIORATION 7)
    _invalidate_lots_cache(project_id, db)
    # Mark step 1 complete and advance to step 2
    _mark_step_1_complete(project, db)
    return ProjectDocumentResponse.model_validate(doc)


def _mark_step_1_complete(project: Project, db: Session) -> None:
    """Mark step 1 (upload) as complete and advance current_step to 2 if needed."""
    steps = dict(project.completed_steps or {})
    if not steps.get("1"):
        steps["1"] = True
        project.completed_steps = steps
    if project.current_step <= 1:
        project.current_step = 2
    db.commit()


def _extract_all_parallel(project_id: str, docs_info: list) -> None:
    """
    2-phase parallel text extraction.

    Phase 1 (FAST — user waits):
      Pre-pass: big PDFs (>2MB) get a placeholder synchronously (no thread).
      Pool: only small files (<2MB) + key doc types go to ThreadPoolExecutor.
      Marks processing_status='ready' when done → user can continue.

    Phase 2 (BACKGROUND — user has moved on):
      Full extraction of deferred large PDFs for PDF viewer highlighting.
    """
    import logging as _logging
    import time as _time
    from concurrent.futures import ThreadPoolExecutor, as_completed
    _log = _logging.getLogger(__name__)
    _tlog = _logging.getLogger("TIMING")

    from database import SessionLocal

    _KEY_TYPES = {'rc', 'ccap', 'cctp', 'dpgf', 'acte_engagement'}
    _500KB = 500 * 1024  # Aggressive threshold: only tiny PDFs in pool

    # ── Pre-pass: classify and immediately handle big files ───────────────
    # docs_info items: (doc_id, filename, doc_type, file_size, file_url)
    fast_docs = []     # (doc_id, filename) — submitted to thread pool
    phase2_docs = []   # (doc_id, filename) — deferred full extraction

    skipped = 0
    total_all = len(docs_info)

    db = SessionLocal()
    try:
        for doc_id, filename, doc_type, file_size, file_url in docs_info:
            lower = filename.lower()
            is_pdf = lower.endswith(".pdf")
            is_key = doc_type in _KEY_TYPES

            if is_pdf and not is_key and file_size > _500KB:
                # PDF > 500KB non-key: placeholder immediately, no thread
                doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
                if doc and doc.extracted_text is None:
                    doc.extracted_text = f"[document volumineux - {filename}]"
                    skipped += 1
                phase2_docs.append((doc_id, filename))
            else:
                # Small PDF (<500KB), key doc (any size), or DOCX/XLSX → pool
                fast_docs.append((doc_id, filename))

        db.commit()
    finally:
        db.close()

    total_fast = len(fast_docs)
    print(
        f"[TIMING] pre-pass done: {total_all} total, "
        f"{total_fast} fast (pool), {skipped} placeholder, "
        f"{len(phase2_docs)} deferred",
        flush=True,
    )

    # Update progress: skipped files count as done
    completed_count = [skipped]
    count_lock = threading.Lock()

    def _update_progress(done: int) -> None:
        try:
            db_p = SessionLocal()
            try:
                project = db_p.query(Project).filter(Project.id == project_id).first()
                if project and project.processing_status == "extracting_text":
                    project.processing_progress = min(int((done / max(total_all, 1)) * 100), 99)
                    project.processing_detail = f"{done}/{total_all} documents"
                    db_p.commit()
            finally:
                db_p.close()
        except Exception:
            pass

    _update_progress(skipped)

    def _extract_fast(doc_id: str, filename: str) -> None:
        """Extract text for a small file. Runs in thread pool."""
        extracted_text = ""
        page_count = None
        try:
            db_inner = SessionLocal()
            try:
                doc = db_inner.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
                if not doc or doc.extracted_text is not None:
                    return
                if not doc.file_url:
                    return
                rel = doc.file_url.removeprefix("/uploads/")
                file_path = UPLOADS_ROOT / rel
                if not file_path.exists():
                    return
                content = file_path.read_bytes()
                result_text, result_pages = processor.extract(content, filename)
                if result_text:
                    extracted_text = result_text.replace("\x00", "")
                page_count = result_pages
            finally:
                db_inner.close()
        except Exception as e:
            _log.error(f"Fast extraction failed for {filename}: {e}")

        try:
            db_inner = SessionLocal()
            try:
                doc = db_inner.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
                if doc and doc.extracted_text is None:
                    doc.extracted_text = extracted_text
                    if page_count is not None:
                        doc.page_count = page_count
                    db_inner.commit()
            finally:
                db_inner.close()
        except Exception as e:
            _log.error(f"DB update failed for {filename}: {e}")

        with count_lock:
            completed_count[0] += 1
            done = completed_count[0]
        _update_progress(done)

    def _mark_ready() -> None:
        try:
            db_r = SessionLocal()
            try:
                project = db_r.query(Project).filter(Project.id == project_id).first()
                if project:
                    project.processing_status = "ready"
                    project.processing_progress = 100
                    project.processing_detail = ""
                    db_r.commit()
            finally:
                db_r.close()
        except Exception:
            pass

    # ── Phase 1: extract only small files in thread pool ─────────────────
    t0 = _time.monotonic()
    try:
        if fast_docs:
            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = {
                    executor.submit(_extract_fast, doc_id, fname): (doc_id, fname)
                    for doc_id, fname in fast_docs
                }
                # Global timeout: 60s max for entire phase 1
                for future in as_completed(futures, timeout=60):
                    doc_id, fname = futures[future]
                    try:
                        future.result(timeout=0)  # already done from as_completed
                    except Exception as e:
                        _log.error(f"Fast extraction error for {fname}: {e}")
    except TimeoutError:
        # Global 60s timeout hit — mark remaining as empty
        _log.warning(f"Phase 1 global timeout (60s) for {project_id}")
        db_to = SessionLocal()
        try:
            remaining = db_to.query(ProjectDocument).filter(
                ProjectDocument.project_id == project_id,
                ProjectDocument.extracted_text.is_(None),
            ).all()
            for doc in remaining:
                doc.extracted_text = ""
            db_to.commit()
        finally:
            db_to.close()
    except Exception as e:
        _log.error(f"Phase 1 failed for {project_id}: {e}")

    elapsed = _time.monotonic() - t0
    print(f"[TIMING] Phase 1 pool done: {total_fast} files in {elapsed:.1f}s", flush=True)
    _mark_ready()

    # ── Phase 2: full extraction of deferred large PDFs (silent) ─────────
    if not phase2_docs:
        return

    _log.info(f"Phase 2 starting for {project_id}: {len(phase2_docs)} large PDFs")

    def _extract_phase2(doc_id: str, filename: str) -> None:
        """Full text extraction for large PDFs (viewer highlighting)."""
        try:
            db_inner = SessionLocal()
            try:
                doc = db_inner.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
                if not doc or not doc.file_url:
                    return
                rel = doc.file_url.removeprefix("/uploads/")
                file_path = UPLOADS_ROOT / rel
                if not file_path.exists():
                    return
                content = file_path.read_bytes()
                result_text, result_pages = processor.extract(content, filename)
                if result_text:
                    doc.extracted_text = result_text.replace("\x00", "")
                if result_pages is not None:
                    doc.page_count = result_pages
                db_inner.commit()
            finally:
                db_inner.close()
        except Exception as e:
            _log.error(f"Phase2 extraction failed for {filename}: {e}")

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(_extract_phase2, doc_id, fname): fname
                for doc_id, fname in phase2_docs
            }
            for future in as_completed(futures, timeout=300):
                fname = futures[future]
                try:
                    future.result(timeout=0)
                except Exception as e:
                    _log.warning(f"Phase2 error for {fname}: {e}")
        _log.info(f"Phase 2 done for {project_id}: {len(phase2_docs)} large PDFs")
    except TimeoutError:
        _log.warning(f"Phase 2 global timeout (300s) for {project_id}")
    except Exception as e:
        _log.error(f"Phase2 failed for {project_id}: {e}")


def _track_extraction_progress(project_id: str, total_needing_text: int) -> None:
    """Background thread: poll DB every 2s to track text extraction progress.
    Marks as ready when all docs have extracted_text set (NULL = not processed yet).
    Stall detection: if no progress for 120s, assume all background tasks finished.
    Hard timeout: 10 minutes max (large DCE with 78MB PDFs can be slow)."""
    import logging as _logging
    import time
    _logging.basicConfig(level=_logging.INFO)
    _log = _logging.getLogger(__name__)
    print(f"=== TRACKER STARTED === project={project_id}, docs_needing_text={total_needing_text}", flush=True)
    try:
        from database import SessionLocal
        poll_interval = 2  # poll every 2s for granular progress
        max_wait = 600     # 10 minutes hard timeout
        stall_max = 120    # 120s with no progress change → done
        elapsed = 0
        last_extracted = -1
        stall_time = 0

        while elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == project_id).first()
                if not project or project.processing_status != "extracting_text":
                    _log.info(f"Tracker {project_id}: status changed to '{project.processing_status if project else 'N/A'}', stopping")
                    break
                total_docs = db.query(ProjectDocument).filter(
                    ProjectDocument.project_id == project_id
                ).count()
                extracted = db.query(ProjectDocument).filter(
                    ProjectDocument.project_id == project_id,
                    ProjectDocument.extracted_text.isnot(None),
                ).count()

                # Stall detection
                if extracted == last_extracted:
                    stall_time += poll_interval
                else:
                    stall_time = 0
                    last_extracted = extracted

                pct = min(int((extracted / max(total_docs, 1)) * 100), 99)
                project.processing_progress = pct
                project.processing_detail = f"{extracted}/{total_docs} documents"

                print(f"[TRACKER] {project_id}: {extracted}/{total_docs} docs, pct={pct}%, stall={stall_time}s, elapsed={elapsed}s", flush=True)

                done = extracted >= total_docs or stall_time >= stall_max
                if done:
                    project.processing_status = "ready"
                    project.processing_progress = 100
                    project.processing_detail = ""
                    db.commit()
                    _log.info(f"Tracker done for {project_id}: {extracted}/{total_docs} docs (stall={stall_time}s, elapsed={elapsed}s)")
                    break
                db.commit()
            finally:
                db.close()

        # Hard timeout fallback — always mark ready
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project and project.processing_status == "extracting_text":
                project.processing_status = "ready"
                project.processing_progress = 100
                project.processing_detail = ""
                db.commit()
                _log.warning(f"Tracker hard timeout for {project_id} after {elapsed}s")
        finally:
            db.close()
    except Exception as e:
        _log.error(f"_track_extraction_progress error for {project_id}: {e}")
        # Emergency: mark ready so frontend isn't stuck forever
        try:
            from database import SessionLocal
            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == project_id).first()
                if project and project.processing_status == "extracting_text":
                    project.processing_status = "ready"
                    project.processing_progress = 100
                    db.commit()
            finally:
                db.close()
        except Exception:
            pass


def _extract_text_background(doc_id: str, content: bytes, filename: str) -> None:
    """Background task: extract text from document and update DB.
    Always sets extracted_text (empty string on failure) so NULL = 'not yet processed'."""
    import logging as _logging
    _log = _logging.getLogger(__name__)
    extracted_text = ""
    page_count = None
    try:
        from database import SessionLocal

        result_text, result_pages = processor.extract(content, filename)
        if result_text:
            extracted_text = result_text.replace("\x00", "")
        page_count = result_pages
    except Exception as e:
        _log.error(f"Background text extraction failed for {filename}: {e}")

    try:
        from database import SessionLocal
        db = SessionLocal()
        try:
            doc = db.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
            if doc:
                doc.extracted_text = extracted_text
                if page_count is not None:
                    doc.page_count = page_count
                db.commit()
                _log.info(f"Text extraction done for {filename} (doc {doc_id}): {len(extracted_text)} chars, {page_count} pages")
        finally:
            db.close()
    except Exception as e:
        _log.error(f"DB update failed for {filename} (doc {doc_id}): {e}")


async def _create_project_document(
    content: bytes,
    filename: str,
    content_type: str,
    form_type: str,
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session,
    skip_bg_extraction: bool = False,
) -> ProjectDocument:
    """Upload one file, persist to DB, schedule text extraction + PDF conversion in background.
    skip_bg_extraction: True when called from ZIP (parallel extractor handles it)."""
    import logging as _logging
    _log = _logging.getLogger(__name__)

    file_url = await storage.upload(
        content,
        filename,
        f"projects/{project_id}/dce",
        content_type or None,
    )

    doc_type = _detect_doc_type(filename, form_type)

    doc = ProjectDocument(
        project_id=project_id,
        type=doc_type,
        file_url=file_url,
        file_name=filename,
        file_size=len(content),
        extracted_text=None,
        page_count=None,
        related_lots=assign_document_lots(filename, doc_type),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Text extraction always deferred to _extract_all_parallel for ZIP
    if not skip_bg_extraction:
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
    import time as _time
    _log = _logging.getLogger(__name__)
    _tlog = _logging.getLogger("TIMING")

    created: List[ProjectDocument] = []
    _tz0 = _time.monotonic()

    try:
        zf = zipfile.ZipFile(_io.BytesIO(content), 'r')
    except zipfile.BadZipFile:
        if depth == 0:
            raise HTTPException(status_code=400, detail="Fichier ZIP invalide ou corrompu")
        warnings.append("Archive ZIP imbriquée invalide ou corrompue (ignorée)")
        return []

    import uuid as _uuid

    # Phase A: read all valid members from ZIP into memory
    pending: list[tuple[str, bytes]] = []  # (base_filename, file_bytes)

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
                except Exception as e:
                    warnings.append(f"{base} : archive imbriquée non extractible ({e})")
                continue

            # AMÉLIORATION 9: track unsupported formats for warnings
            if suffix not in _ZIP_ALLOWED:
                if suffix in (".rar", ".7z"):
                    warnings.append(
                        f"{base} : format {suffix} non supporté — convertissez en .zip"
                    )
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
                continue

            try:
                file_bytes = zf.read(member)
            except Exception as e:
                warnings.append(f"{base} : impossible de lire le fichier ({e})")
                continue

            pending.append((base, file_bytes))
            existing_names.add(base.lower().strip())

    _t_read = _time.monotonic() - _tz0
    print(f"[TIMING] ZIP read: {len(pending)} files in {_t_read:.2f}s", flush=True)

    # Phase B: write all files to disk in batch
    _tw0 = _time.monotonic()
    file_records: list[tuple[str, str, str, int]] = []  # (base, file_url, doc_type, file_size)
    prefix = f"projects/{project_id}/dce"
    for base, file_bytes in pending:
        key = f"{prefix}/{_uuid.uuid4()}-{base}"
        path = UPLOADS_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(file_bytes)
        file_url = f"/uploads/{key}"
        doc_type = _detect_doc_type(base, "autre")
        file_records.append((base, file_url, doc_type, len(file_bytes)))
    _t_write = _time.monotonic() - _tw0
    print(f"[TIMING] disk write: {len(file_records)} files in {_t_write:.2f}s", flush=True)

    # Phase C: bulk insert all documents — single commit
    _td0 = _time.monotonic()
    for base, file_url, doc_type, file_size in file_records:
        doc = ProjectDocument(
            project_id=project_id,
            type=doc_type,
            file_url=file_url,
            file_name=base,
            file_size=file_size,
            extracted_text=None,
            page_count=None,
            related_lots=assign_document_lots(base, doc_type),
        )
        db.add(doc)
        created.append(doc)
    db.commit()
    # Refresh all to get IDs
    for doc in created:
        db.refresh(doc)
    _t_db = _time.monotonic() - _td0

    print(
        f"[TIMING] _extract_zip_members: {len(created)} files in {_time.monotonic()-_tz0:.2f}s "
        f"(read={_t_read:.2f}s, write={_t_write:.2f}s, db={_t_db:.2f}s)",
        flush=True,
    )
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


@router.get("/{project_id}/processing-status")
def get_processing_status(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)

    # Try structured tracker first (analysis / memoire pipelines)
    tracked = pipeline_tracker.get_status(project_id)
    if tracked:
        return tracked

    # Fallback to legacy DB fields (upload / extraction phases)
    db_status = project.processing_status or "ready"
    db_progress = project.processing_progress or 0
    db_detail = project.processing_detail or ""

    # Map legacy DB status to structured format
    step_map = {
        "uploading":        ("Upload des fichiers", 5),
        "extracting_zip":   ("Extraction de l'archive", 15),
        "extracting_text":  ("Extraction des documents", 10 + int(db_progress * 0.15)),
        "detecting_lots":   ("Détection des lots", 30),
        "ready":            ("Prêt", 0),
        "error":            ("Erreur", 0),
    }
    label, pct = step_map.get(db_status, (db_status, 0))

    return {
        "status": db_status,
        "progress": pct,
        "current_step": label,
        "steps": [],
        "estimated_remaining_s": 0,
        "started_at": None,
        "elapsed_s": 0,
        "pipeline_type": "legacy",
        "detail": db_detail,
    }


@router.get("/{project_id}/extraction-status")
def get_extraction_status(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Check how many documents have completed text extraction (phase 2).
    NULL extracted_text = not yet processed."""
    _get_project_or_404(project_id, user.organization_id, db)
    total = db.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id,
    ).count()
    extracted = db.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id,
        ProjectDocument.extracted_text.isnot(None),
    ).count()
    return {
        "total": total,
        "extracted": extracted,
        "ready": extracted >= total,
    }


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
    On cache miss: launches detection in background thread, returns status immediately.
    Frontend polls /processing-status for real progress, then re-calls /lots for results.
    """
    project = _get_project_or_404(project_id, user.organization_id, db)
    docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()

    if not docs:
        raise HTTPException(status_code=400, detail="Aucun document uploadé pour ce projet")

    # Ensure step 1 is marked complete (covers projects uploaded before this fix)
    if project.current_step <= 1:
        _mark_step_1_complete(project, db)

    # ── Cache hit (AMÉLIORATION 7) ─────────────────────────────────────────────
    if project.lots_detectes is not None:
        cached = project.lots_detectes
        return {"lots": cached, "count": len(cached), "cached": True}

    # ── Already detecting? Return current status ──────────────────────────────
    if project.processing_status == "detecting_lots":
        return {"status": "detecting_lots", "progress": project.processing_progress or 0, "detail": project.processing_detail or ""}

    # ── Cache miss: launch detection in background ────────────────────────────
    project.processing_status = "detecting_lots"
    project.processing_progress = 0
    project.processing_detail = "Démarrage de la détection..."
    db.commit()

    # Serialize document data for the background thread (avoid sharing SQLAlchemy objects)
    docs_data = []
    for doc in docs:
        docs_data.append({
            "id": doc.id,
            "file_name": doc.file_name,
            "file_url": doc.file_url,
            "extracted_text": doc.extracted_text,
            "type": doc.type,
            "related_lots": doc.related_lots,
        })

    threading.Thread(
        target=_run_lot_detection_background,
        args=(project_id, docs_data, str(UPLOADS_ROOT)),
        daemon=True,
    ).start()

    return {"status": "detecting_lots", "progress": 0, "detail": "Démarrage de la détection..."}


def _run_lot_detection_background(project_id: str, docs_data: list, uploads_root_str: str) -> None:
    """Background thread: run lot detection with real progress updates to DB."""
    import logging
    _log = logging.getLogger(__name__)
    _log.info(f"Lot detection background thread started for project {project_id}")

    from database import SessionLocal
    from pathlib import Path as _Path

    uploads_root = _Path(uploads_root_str)

    def _update_progress(pct: int, detail: str) -> None:
        """Callback: write progress to DB so frontend can poll it."""
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project and project.processing_status == "detecting_lots":
                project.processing_progress = pct
                project.processing_detail = detail
                db.commit()
        except Exception as e:
            _log.warning(f"Lot detection progress update failed: {e}")
        finally:
            db.close()

    # Build lightweight doc-like objects for lot_detector
    class _DocProxy:
        def __init__(self, d: dict):
            self.id = d["id"]
            self.file_name = d["file_name"]
            self.file_url = d["file_url"]
            self.extracted_text = d["extracted_text"]
            self.type = d["type"]
            self.related_lots = d["related_lots"]

    doc_proxies = [_DocProxy(d) for d in docs_data]

    try:
        import time as _time
        _t0 = _time.monotonic()
        lots = lot_detector.detect(doc_proxies, uploads_root=uploads_root, on_progress=_update_progress)
        print(f"[TIMING] lot_detector.detect: {_time.monotonic()-_t0:.2f}s, {len(lots or [])} lots found", flush=True)

        # Save results
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.lots_detectes = lots or []
                project.processing_status = "ready"
                project.processing_progress = 100
                project.processing_detail = ""
                db.commit()
        finally:
            db.close()

    except Exception as e:
        _log.error(f"Lot detection failed for {project_id}: {e}")
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.processing_status = "error"
                project.processing_progress = 0
                project.processing_detail = f"Erreur: {str(e)[:200]}"
                db.commit()
        finally:
            db.close()


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
