import zipfile
import re
import shutil
import tempfile
import unicodedata
import io as _io
import threading
from typing import IO, List, Optional, Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, File, Form
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.user import User
from models.project import Project, ProjectDocument, PROJECT_DOC_TYPES
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

# Upload limits — DCE archives can legitimately reach ~1.5 GB on big projects.
_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".zip", ".png", ".jpg", ".jpeg"}
_MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024     # 2 GB
_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024          # 4 MB per chunk
_UPLOAD_SPOOL_THRESHOLD = 10 * 1024 * 1024    # spill to disk past 10 MB

# Anti-zip-bomb (C21) — caps cumulés sur TOUTES les profondeurs d'archive.
_ZIP_MAX_FILES = 1000                              # nb max de membres (fichiers) extraits
_ZIP_MAX_TOTAL_UNCOMPRESSED = 4 * 1024 * 1024 * 1024  # 4 GB décompressés cumulés
_ZIP_MAX_RATIO = 100                               # ratio décompressé/compressé max
# Le ratio n'est vérifié qu'au-delà de ce plancher déclaré : les petites archives
# très compressibles (un .doc texte) sont légitimes et bornées par le cap absolu.
_ZIP_RATIO_MIN_DECLARED = 10 * 1024 * 1024         # 10 MB


class ZipBombError(Exception):
    """Archive détectée comme bombe de décompression — rejet 413."""


class _ZipBudget:
    """Compteurs partagés à travers la récursion des archives imbriquées,
    + traces (fichiers écrits, docs commis) pour le cleanup en cas de rejet."""

    def __init__(self):
        self.files = 0
        self.declared_bytes = 0
        self.written_bytes = 0
        self.written_paths: list = []
        self.created_doc_ids: list = []


def _check_zip_archive_budget(zf: "zipfile.ZipFile", budget: _ZipBudget) -> None:
    """Pré-check sur les métadonnées de l'archive (avant toute décompression).

    Les tailles déclarées peuvent mentir — l'enforcement réel a lieu aussi
    pendant le streaming (_copy_zip_member_bounded). Fail closed."""
    members = [m for m in zf.infolist() if not m.is_dir()]

    budget.files += len(members)
    if budget.files > _ZIP_MAX_FILES:
        raise ZipBombError(
            f"Archive rejetée : plus de {_ZIP_MAX_FILES} fichiers contenus "
            "(archives imbriquées comprises)."
        )

    declared = sum(m.file_size for m in members)
    compressed = sum(m.compress_size for m in members)
    budget.declared_bytes += declared
    if budget.declared_bytes > _ZIP_MAX_TOTAL_UNCOMPRESSED:
        gb = _ZIP_MAX_TOTAL_UNCOMPRESSED // (1024 ** 3)
        raise ZipBombError(
            f"Archive rejetée : taille décompressée annoncée supérieure à {gb} Go."
        )
    if declared > _ZIP_RATIO_MIN_DECLARED and declared > _ZIP_MAX_RATIO * max(compressed, 1):
        raise ZipBombError(
            "Archive rejetée : ratio de décompression anormal "
            f"(> {_ZIP_MAX_RATIO}:1) — bombe de décompression suspectée."
        )


def _copy_zip_member_bounded(src, dst, declared_size: int, budget: _ZipBudget) -> int:
    """Copie un membre ZIP en comptant les octets réels. Rejette si le flux
    dépasse la taille déclarée dans l'en-tête (en-tête falsifié) ou si le
    cumul décompressé de l'upload dépasse le cap global."""
    written = 0
    while True:
        chunk = src.read(_UPLOAD_CHUNK_SIZE)
        if not chunk:
            break
        written += len(chunk)
        if written > declared_size:
            raise ZipBombError(
                "Archive rejetée : un fichier produit plus d'octets que sa "
                "taille annoncée — bombe de décompression suspectée."
            )
        budget.written_bytes += len(chunk)
        if budget.written_bytes > _ZIP_MAX_TOTAL_UNCOMPRESSED:
            gb = _ZIP_MAX_TOTAL_UNCOMPRESSED // (1024 ** 3)
            raise ZipBombError(
                f"Archive rejetée : taille décompressée cumulée supérieure à {gb} Go."
            )
        dst.write(chunk)
    return written

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# C14 — transitions de statut autorisées. Prêt (workflow) → soumis (dépôt
# daté) → gagné/perdu (terminaux). sans_suite (B7) est réouvrable ; gagné
# direct sans dépôt est interdit.
_STATUS_TRANSITIONS: dict = {
    "brouillon":  {"en_cours", "analyzed", "sans_suite", "soumis"},
    "en_cours":   {"brouillon", "analyzed", "sans_suite", "soumis"},
    "analyzed":   {"en_cours", "sans_suite", "soumis"},
    "sans_suite": {"en_cours", "analyzed"},
    "soumis":     {"gagné", "perdu", "en_cours"},
    "gagné":      set(),   # terminal
    "perdu":      set(),   # terminal
}
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
    Auto-detect a project_documents.type value from a filename.

    Returns a value from PROJECT_DOC_TYPES, defaulting to 'autre'.
    Word boundaries use (?<![a-z0-9]) / (?![a-z0-9]) so that underscores,
    dashes and dots act as separators (regex \\b doesn't help with '_').

    Priority cascade (most specific first):
      DC1 → DC2 → AE → DPGF → BPU → DQE → cadre_reponse → visite →
      pgc_sps → diagnostic → notice → dt → planning →
      RC → CCAP → CCTP → plan → autre.

    DPGF wins over BPU/DQE; DC1/DC2 win over AE if both terms appear.
    """
    if form_type and form_type != "autre" and form_type in PROJECT_DOC_TYPES:
        return form_type

    norm = _normalize_fname(filename)
    if not norm:
        return "autre"

    def tok(t: str) -> str:
        return r'(?<![a-z0-9])' + t + r'(?![a-z0-9])'

    # ── 1. DC1 — Lettre de candidature ─────────────────────────────────────
    if re.search(
        r'(?<![a-z0-9])dc[\s_\-]?1(?![a-z0-9])|lettre.{0,8}candidature',
        norm,
    ):
        return 'dc1_template'

    # ── 2. DC2 — Déclaration du candidat ───────────────────────────────────
    if re.search(
        r'(?<![a-z0-9])dc[\s_\-]?2(?![a-z0-9])|declaration.{0,8}candidat',
        norm,
    ):
        return 'dc2_template'

    # ── 3. Acte d'engagement ───────────────────────────────────────────────
    # 'AE' alone is too generic — only trust it at start of name, just before
    # the file extension ("2829 - AE.pdf", "DCE_AE.pdf"), with the full phrase,
    # or with explicit confirmers (signe, rempli, vierge…).
    if re.search(
        r'acte.{0,6}engagement|'
        r'^ae(?![a-z0-9])|'
        r'(?<![a-z0-9])ae(?=\.[a-z]{2,5}$)|'
        r'(?<![a-z0-9])ae[\s_.\-](?:signe|rempli|vierge|template|complete|final)|'
        r'(?<![a-z0-9])attri\d+',
        norm,
    ):
        return 'acte_engagement_template'

    # ── 4. DPGF — Décomposition Prix Global et Forfaitaire ────────────────
    # DPGF wins when combined with BPU/DQE in the same filename.
    if filename.lower().endswith(".ods") and re.search(
        r'dpgf|prix|bordereau|decomposition', norm,
    ):
        return 'dpgf_template'
    if re.search(
        tok('dpgf') + r'|d[eé]composition.{0,12}prix|'
        r'prix.{0,6}global|prix.{0,6}forfaitaire',
        norm,
    ):
        return 'dpgf_template'

    # ── 5. BPU — Bordereau de Prix Unitaire ───────────────────────────────
    if re.search(tok('bpu') + r'|bordereau.{0,6}prix|prix.{0,6}unitaire', norm):
        return 'bpu_template'

    # ── 6. DQE — Détail Quantitatif Estimatif ─────────────────────────────
    if re.search(
        tok('dqe') + r'|d[eé]tail.{0,6}quantitatif|quantitatif.{0,6}estimatif',
        norm,
    ):
        return 'dqe_template'

    # ── 7. Cadre de réponse mémoire ───────────────────────────────────────
    if re.search(r'cadre.{0,8}r[eé]ponse|cadre.{0,8}memoire', norm):
        return 'cadre_reponse'

    # ── 8. Attestation de visite ──────────────────────────────────────────
    if re.search(
        r'attestation.{0,8}visite|visite.{0,8}obligatoire|visite.{0,8}site',
        norm,
    ):
        return 'attestation_visite_template'

    # ── 9. PGC SPS — Plan Général de Coordination Sécurité Protection Santé ─
    # Goes BEFORE 'planning' so "PGC SPS.pdf" doesn't get planning'd by mistake.
    if re.search(
        r'(?<![a-z0-9])pgc[\s_.\-]?sps(?![a-z0-9])|'
        r'plan.{0,8}general.{0,8}coordination|'
        r'coordination.{0,8}sps',
        norm,
    ):
        return 'pgc_sps'

    # ── 10. Diagnostic / contrôle technique ───────────────────────────────
    # DAT (Dossier Amiante Travaux), CREP (plomb), RAAT, étude structure /
    # géotech (G2 PRO, G2 AVP…), bureaux de contrôle (APAVE, SOCOTEC,
    # QUALICONSULT, BUREAU VERITAS), diag amiante / plomb / termite.
    if re.search(
        r'diagnos|' +
        tok('diag') + r'|' +
        tok('dat') + r'|' +
        tok('crep') + r'|' +
        tok('raat') + r'|' +
        r'apave|socotec|qualiconsult|veritas|bureau.{0,4}controle|'
        r'controle.{0,4}technique|'
        r'(?<![a-z0-9])g2[\s_.\-]?(?:pro|avp|aps|g[12])?(?![a-z0-9])|'
        r'etude.{0,4}structure|etude.{0,4}geotechnique|'
        r'(?<![a-z0-9])amiante(?![a-z0-9])|'
        r'(?<![a-z0-9])plomb(?![a-z0-9])',
        norm,
    ):
        return 'diagnostic'

    # ── 11. Notice (accessibilité / sécurité / acoustique / PC / EP) ──────
    # In a DCE, "notice" is almost always a design/safety notice attached
    # to the permis de construire or a technical chapter.
    if re.search(tok('notice'), norm):
        return 'notice'

    # ── 12. DT — déclarations concessionnaires (ENEDIS, GRDF, ORANGE…) ────
    # Pattern: 'DT' + separator + ≥3 letters (operator name).
    # Rejects DTU/DTI (no separator after DT) so technical reference docs
    # don't get miscategorised.
    if re.search(r'^dt[\s_.\-][a-z]{3,}', norm):
        return 'dt'

    # ── 13. Planning ──────────────────────────────────────────────────────
    if re.search(tok('planning'), norm):
        return 'planning'

    # ── Plan filename markers — used to disambiguate 'RDC' below ──────────
    is_plan_fname = bool(re.search(
        r'(?<![a-z0-9])arch\s*\d|coupe|niveau|zoom|etage|r\+\d|'
        r'(?<![a-z0-9])el\d|(?<![a-z0-9])plan\b|\.dwg$|\.dwf$|\.dxf$',
        norm,
    ))
    is_annexe = bool(re.search(r'annexe|nommage|liste|modele', norm))

    # ── 14. RC — Règlement de Consultation ────────────────────────────────
    # 'RDC' is ambiguous: it can mean Règlement de Consultation (rc) OR
    # Rez-De-Chaussée (a plan). Disambiguation: if any plan marker is
    # present in the filename (Plan_RDC.dwg, RDC_coupe.pdf), keep it as
    # a plan; otherwise treat it as a règlement.
    is_rc = bool(re.search(
        r'reglement|r[eè]gl[\._\s]?consul|' + tok('rc') + r'|' + tok('rce') + r'|'
        r'reglement.{0,4}consultation|r[eè]glement.{0,4}la.{0,4}consultation',
        norm,
    ))
    if not is_rc and not is_plan_fname and re.search(tok('rdc'), norm):
        is_rc = True
    if is_rc and not is_annexe:
        return 'rc'

    # ── 15. CCAP — Cahier des Clauses Administratives ─────────────────────
    if re.search(tok('ccap') + r'|clauses.{0,6}admin|cahier.{0,6}admin', norm):
        return 'ccap'

    # ── 16. CCTP — Cahier des Clauses Techniques ──────────────────────────
    if re.search(
        tok('cctp') + r'|clauses.{0,6}tech|cahier.{0,6}technique|'
        r'descriptif.{0,6}tech',
        norm,
    ):
        return 'cctp'
    # Carnet de détail / menuiseries / plans = pièces écrites techniques.
    if re.search(r'carnet.{0,4}(?:de.{0,4})?(?:detail|menuiserie|plan)', norm):
        return 'cctp'
    # Lot-specific DCE PDFs are usually per-lot CCTPs: "lot 01 GO_DCE.pdf"
    if re.search(r'lot[\s_-]*\d{1,2}.*_dce\.pdf$', norm) and not is_annexe:
        return 'cctp'
    # Corps-d'état prefix: "DCE-GO01.pdf", "DCE-CVC.pdf", "DCE-MEN03.docx".
    # Codes BTP courants : GO (Gros Œuvre), ST (Structure), PIC (Plomberie),
    # CVC (Chauffage-Ventilation), MEN (Menuiserie), ELE (Électricité),
    # PEI (Peinture), REV (Revêtements), VRD (Voirie), ITE (Isolation
    # Thermique Extérieure), FAC (Façade), CHA (Charpente), COU (Couverture),
    # ETA (Étanchéité). 2–4 lettres + 0–3 chiffres pour rester strict.
    if re.search(r'^dce-[a-z]{2,4}\d{0,3}\.(pdf|docx)$', norm):
        return 'cctp'

    # ── 17. Plans ─────────────────────────────────────────────────────────
    if is_plan_fname or re.search(
        tok('plans?') + r'|coupe|facade|niveau|rez.{0,4}de.{0,4}chaussee',
        norm,
    ):
        return 'plan'

    return 'autre'


# ─── ZIP filename decoding (AMÉLIORATION 4) ────────────────────────────────────

def _decode_zip_entry_name(member: zipfile.ZipInfo) -> str:
    """
    Robustly decode a ZIP entry filename.
    Handles CP437 (default ZIP), Latin-1, CP850, CP1252 and UTF-8 encodings
    used by French public procurement platforms (PLACE, achatpublic.com, AWS).

    The fix from earlier rounds (cp437→latin-1 only) leaked control chars
    like U+0090 / U+0082 for files originally encoded in CP850 (typical for
    French Windows ZIPs, e.g. "DCE - CARNET DE DÉTAIL.pdf" → 0x90 in CP850).

    Strategy: rebuild the original bytes from Python's CP437 decode, then try
    a list of likely encodings — keep the one whose result has the fewest
    control characters (best signal of "real text").
    """
    if member.flag_bits & 0x800:
        # UTF-8 flag set — Python already decoded it correctly
        raw = member.filename
    else:
        try:
            raw_bytes = member.filename.encode('cp437')
        except UnicodeEncodeError:
            raw_bytes = member.filename.encode('cp437', errors='replace')

        # Score candidate decodings by # of control chars (lower = better).
        # CP850 first because it's the historical French-Windows ZIP encoding
        # and is the source of the U+0090/U+0082 bug we hit on Gueux DCE.
        candidates = []
        for enc in ("cp850", "cp1252", "latin-1", "utf-8"):
            try:
                decoded = raw_bytes.decode(enc)
                ctrl_count = sum(
                    1 for c in decoded
                    if (ord(c) < 0x20 and c not in "\t\n\r") or 0x7F <= ord(c) < 0xA0
                )
                candidates.append((ctrl_count, len(decoded), enc, decoded))
            except UnicodeDecodeError:
                continue

        if candidates:
            # Pick the decoding with the fewest control chars; tiebreak on
            # length (longer wins — favours full-information encoding).
            candidates.sort(key=lambda c: (c[0], -c[1]))
            raw = candidates[0][3]
        else:
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
def list_projects(
    include_deleted: bool = False,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    q = db.query(Project).filter(Project.organization_id == user.organization_id)
    if not include_deleted:
        q = q.filter(Project.deleted_at.is_(None))
    return q.order_by(Project.updated_at.desc()).all()


@router.post("", response_model=ProjectResponse)
def create_project(
    payload: ProjectCreate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    from services.cache import org_cache

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
    org_cache.invalidate(f"dashboard_stats:{user.organization_id}")
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
    from services.cache import org_cache

    project = _get_project_or_404(project_id, user.organization_id, db)
    status_before = project.status

    # C14 — cycle de vie des statuts : transitions contrôlées.
    if payload.status is not None and payload.status != status_before:
        allowed = _STATUS_TRANSITIONS.get(status_before, set())
        if payload.status not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Transition de statut invalide : {status_before} → {payload.status}.",
            )
        if payload.status == "soumis":
            from datetime import datetime as _datetime
            project.depose_at = _datetime.utcnow()

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    if project.status != status_before:
        org_cache.invalidate(f"dashboard_stats:{user.organization_id}")
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Soft-delete: set deleted_at instead of removing rows.
    The project keeps its files and history for 30 days, then a cron may purge."""
    from datetime import datetime
    from services.audit_logger import log_action

    from services.cache import org_cache

    project = _get_project_or_404(project_id, user.organization_id, db)
    project.deleted_at = datetime.utcnow()
    db.commit()
    org_cache.invalidate(f"dashboard_stats:{user.organization_id}")
    log_action(
        db, user, "project.delete",
        target_type="project", target_id=project_id,
        extra={"name": project.name, "status": project.status},
    )


@router.post("/{project_id}/restore", response_model=ProjectResponse)
def restore_project(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Undo a soft-delete (within the 30-day window)."""
    from services.audit_logger import log_action

    project = (
        db.query(Project)
        .filter(
            Project.id == project_id,
            Project.organization_id == user.organization_id,
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    if not project.deleted_at:
        raise HTTPException(status_code=400, detail="Projet non supprimé")
    project.deleted_at = None
    db.commit()
    db.refresh(project)
    log_action(
        db, user, "project.restore",
        target_type="project", target_id=project_id,
    )
    return project


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
    """
    Stream uploads to a SpooledTemporaryFile (RAM up to 10 MB, then disk) so that
    large DCE archives never load fully into memory. Hard cap: 2 GB.
    """
    import time as _time
    _t0 = _time.monotonic()

    _get_project_or_404(project_id, user.organization_id, db)

    # ── Cheap validation: extension first, before reading any bytes ──────────
    raw_filename = (file.filename or "").strip()
    filename_lower = raw_filename.lower()
    ext = filename_lower[filename_lower.rfind("."):] if "." in filename_lower else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Type de fichier non autorisé : {ext}")

    # ── Pre-flight Content-Length check: reject obvious oversize fast ────────
    content_length_hdr = request.headers.get("content-length")
    if content_length_hdr:
        try:
            declared = int(content_length_hdr)
        except ValueError:
            declared = 0
        if declared > _MAX_UPLOAD_SIZE:
            size_mb = declared // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Fichier trop volumineux ({size_mb} Mo, max 2 Go). "
                    "Pour les DCE > 2 Go, contactez support@synorix.tech "
                    "pour activer l'upload chunked dédié aux gros marchés."
                ),
            )

    # ── Stream body into a spooled temp file with a running size cap ─────────
    spool: tempfile.SpooledTemporaryFile = tempfile.SpooledTemporaryFile(
        max_size=_UPLOAD_SPOOL_THRESHOLD, mode="w+b",
    )
    try:
        total = 0
        while True:
            chunk = await file.read(_UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_UPLOAD_SIZE:
                size_mb = total // (1024 * 1024)
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"Fichier trop volumineux ({size_mb} Mo, max 2 Go). "
                        "Pour les DCE > 2 Go, contactez support@synorix.tech "
                        "pour activer l'upload chunked dédié aux gros marchés."
                    ),
                )
            spool.write(chunk)
        file_size = total
        spool.seek(0)
        print(f"[TIMING] streamed upload: {_time.monotonic()-_t0:.2f}s ({file_size/1024/1024:.1f} MB)", flush=True)

        # ── ZIP handling — pass the spool, never load full bytes ─────────────
        if filename_lower.endswith(".zip"):
            from services import pipeline_tracker as _pt
            project = _get_project_or_404(project_id, user.organization_id, db)
            project.processing_status = "extracting_zip"
            project.processing_progress = 0
            project.processing_detail = "Extraction de l'archive..."
            db.commit()

            # Drive an "upload" pipeline so SSE subscribers see the same
            # shape as for analysis/mémoire (3 steps: uploading / zip / text).
            _pt.start_pipeline(project_id, "upload")
            # The 'uploading' step is already done by the time we get here
            # (axios delivered the body), so mark it complete and move on.
            _pt.start_step(project_id, "uploading")
            _pt.complete_step(project_id, "uploading")
            _pt.start_step(project_id, "extracting_zip")

            _t1 = _time.monotonic()
            try:
                docs, zip_warnings = await _handle_zip_upload(spool, project_id, background_tasks, db)
            except HTTPException as e:
                project.processing_status = "error"
                project.processing_detail = str(e.detail)
                db.commit()
                _pt.fail_pipeline(project_id, str(e.detail))
                raise
            print(f"[TIMING] _handle_zip_upload ({len(docs)} docs): {_time.monotonic()-_t1:.2f}s (total: {_time.monotonic()-_t0:.2f}s)", flush=True)

            _pt.complete_step(project_id, "extracting_zip")

            docs_needing_text = [
                (d.id, d.file_name, d.type, d.file_size or 0, d.file_url or "")
                for d in docs if d.extracted_text is None
            ]
            if docs_needing_text:
                project.processing_status = "extracting_text"
                project.processing_progress = 0
                project.processing_detail = f"0/{len(docs_needing_text)} documents"
                db.commit()
                _pt.start_step(project_id, "extracting_text")
                print(f"[TIMING] launching _extract_all_parallel: {len(docs_needing_text)} docs needing text (total: {_time.monotonic()-_t0:.2f}s)", flush=True)
                threading.Thread(
                    target=_extract_all_parallel,
                    args=(project_id, docs_needing_text),
                    daemon=True,
                    # Nom stable : les tests joignent les threads "synorix-*"
                    # en fin de test (écritures DB après reset de schéma sinon).
                    name=f"synorix-extract-{project_id}",
                ).start()
            else:
                project.processing_status = "ready"
                project.processing_progress = 100
                project.processing_detail = ""
                db.commit()
                _pt.complete_pipeline(project_id)

            _invalidate_lots_cache(project_id, db)
            _mark_step_1_complete(project, db)

            print(f"[TIMING] endpoint returning response (total: {_time.monotonic()-_t0:.2f}s)", flush=True)
            response: dict = {
                "documents": [ProjectDocumentResponse.model_validate(d) for d in docs],
                "extracted_count": len(docs),
            }
            if zip_warnings:
                response["warnings"] = zip_warnings
            return response

        # ── Single-file upload — stream spool to storage via copyfileobj ─────
        project = _get_project_or_404(project_id, user.organization_id, db)
        doc = await _create_project_document_from_stream(
            spool, file_size, raw_filename, file.content_type or "",
            type, project_id, background_tasks, db,
        )
        _invalidate_lots_cache(project_id, db)
        _mark_step_1_complete(project, db)
        response = ProjectDocumentResponse.model_validate(doc)

        # C16 — coffre-fort progressif : un doc perso reconnu (URSSAF, KBIS…)
        # déclenche le bandeau « enregistrer au coffre-fort » côté front.
        from services.vault_classifier import category_for_type, detect_vault_type
        vault_type = detect_vault_type(raw_filename)
        if vault_type != "autre":
            response.vault_suggestion = {
                "type": vault_type,
                "category": category_for_type(vault_type),
            }
        return response
    finally:
        try:
            spool.close()
        except Exception:
            pass


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

    # Progression intra-document (fix palier de fin à ~95 %) : les gros PDFs
    # du pool tickent PAR PAGE — fractions réelles agrégées, throttlées.
    page_fractions: dict = {}
    _last_partial_pub = [0.0]

    def _publish_partial() -> None:
        now = _time.monotonic()
        if now - _last_partial_pub[0] < 0.3:
            return
        _last_partial_pub[0] = now
        with count_lock:
            done = completed_count[0] + sum(page_fractions.values())
        try:
            from services import pipeline_tracker as _pt
            _pt.update_step_progress(project_id, max(0.0, min(done / max(total_all, 1), 0.99)))
        except Exception:
            pass

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
        # SSE: publish on the in-progress upload pipeline step.
        try:
            from services import pipeline_tracker as _pt
            _pt.update_step_progress(project_id, max(0.0, min(done / max(total_all, 1), 0.99)))
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
                def _on_page(done_pages: int, total_pages: int) -> None:
                    # Pas de lock ici : écriture d'une clé propre au thread,
                    # et _publish_partial prend count_lock lui-même.
                    page_fractions[doc_id] = done_pages / max(total_pages, 1)
                    _publish_partial()

                result_text, result_pages = processor.extract(
                    content, filename, on_page=_on_page)
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
            page_fractions.pop(doc_id, None)  # le fichier compte désormais entier
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
        # SSE: signal completion of the upload pipeline (if active).
        try:
            from services import pipeline_tracker as _pt
            _pt.complete_step(project_id, "extracting_text")
            _pt.complete_pipeline(project_id)
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


async def _create_project_document_from_stream(
    spool: IO[bytes],
    file_size: int,
    filename: str,
    content_type: str,
    form_type: str,
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session,
) -> ProjectDocument:
    """Persist a file-like upload to storage without ever loading full bytes in RAM."""
    import logging as _logging
    _log = _logging.getLogger(__name__)

    file_url = await storage.upload_stream(
        spool,
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
        file_size=file_size,
        extracted_text=None,
        page_count=None,
        related_lots=assign_document_lots(filename, doc_type),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(_extract_text_from_url_background, doc.id, doc.file_url, filename)

    try:
        if PdfConverter.can_convert(filename):
            background_tasks.add_task(_convert_to_pdf_background, doc.id, doc.file_url, filename)
    except Exception as e:
        _log.error(f"Impossible de planifier la conversion PDF pour {filename}: {e}")

    return doc


def _extract_text_from_url_background(doc_id: str, file_url: str, filename: str) -> None:
    """Background task: read the persisted file from disk and extract text.
    Reads bytes from disk on demand instead of carrying the upload payload through memory."""
    import logging as _logging
    _log = _logging.getLogger(__name__)
    extracted_text = ""
    page_count = None
    try:
        if file_url.startswith("/uploads/"):
            path = UPLOADS_ROOT / file_url.removeprefix("/uploads/")
            if not path.exists():
                _log.error(f"Fichier introuvable pour extraction: {path}")
                return
            content = path.read_bytes()
        else:
            # S3-backed file — extraction would need a download step we don't yet support.
            _log.warning(f"Extraction texte ignorée (URL non locale): {file_url}")
            return
        result_text, result_pages = processor.extract(content, filename)
        if result_text:
            extracted_text = result_text.replace("\x00", "")
        page_count = result_pages
    except Exception as e:
        _log.error(f"Extraction texte (disque) échouée pour {filename}: {e}")

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
        finally:
            db.close()
    except Exception as e:
        _log.error(f"Mise à jour DB échouée pour {filename} (doc {doc_id}): {e}")


# Files to extract from a ZIP (AMÉLIORATION 1: added .ods)
_ZIP_ALLOWED = {".pdf", ".docx", ".xlsx", ".xls", ".doc", ".ods"}
# Ignore macOS artefacts and hidden files
_ZIP_IGNORE = re.compile(r'^(__MACOSX[/\\]|\.)', re.IGNORECASE)


async def _extract_zip_members(
    source,  # IO[bytes] | bytes — file-like at outer call, bytes for nested archives
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session,
    existing_names: set,
    used_in_zip: set,
    warnings: List[str],
    budget: _ZipBudget,
    depth: int = 0,
) -> List[ProjectDocument]:
    """
    Core ZIP extraction (recursive — max 2 levels for nested ZIPs).

    `source` is a seekable file-like object on the outer call (so the archive
    is never fully loaded into memory) and bytes/BytesIO for nested archives.
    Members are streamed straight to disk via shutil.copyfileobj — at no point
    is the full uploaded payload held as a single bytes blob.
    """
    import logging as _logging
    import time as _time
    _log = _logging.getLogger(__name__)

    created: List[ProjectDocument] = []
    _tz0 = _time.monotonic()

    if isinstance(source, (bytes, bytearray)):
        zip_source: IO[bytes] = _io.BytesIO(source)
    else:
        zip_source = source
        try:
            zip_source.seek(0)
        except Exception:
            pass

    try:
        zf = zipfile.ZipFile(zip_source, 'r')
    except zipfile.BadZipFile:
        if depth == 0:
            raise HTTPException(status_code=400, detail="Fichier ZIP invalide ou corrompu")
        warnings.append("Archive ZIP imbriquée invalide ou corrompue (ignorée)")
        return []

    # Anti-zip-bomb (C21) : pré-check sur les métadonnées avant toute extraction.
    _check_zip_archive_budget(zf, budget)

    import uuid as _uuid

    file_records: list[tuple[str, str, str, int]] = []  # (base, file_url, doc_type, file_size)
    prefix = f"projects/{project_id}/dce"
    _t_read = 0.0

    with zf:
        members = zf.infolist()
        _t_read = _time.monotonic() - _tz0

        # DÉMO-1 — progression par fichier pendant l'extraction (throttlée).
        # Sans ça, l'étape « extraction du ZIP » était muette du début à la
        # fin → gel apparent à ~30 % sur les gros DCE.
        real_members = [m for m in members if not m.is_dir()]
        _last_tick = 0.0
        _done = 0

        def _tick_progress():
            nonlocal _last_tick
            now = _time.monotonic()
            if now - _last_tick < 0.5 or depth != 0:
                return
            _last_tick = now
            try:
                from services import pipeline_tracker as _tracker
                _tracker.update_step_progress(project_id, min(_done / max(len(real_members), 1), 0.99))
            except Exception:
                pass

        for member in members:
            if member.is_dir():
                continue
            _done += 1
            _tick_progress()

            raw_name = member.filename
            parts = raw_name.replace("\\", "/").split("/")
            if any(p.startswith("__MACOSX") or (p.startswith(".") and p not in (".", "..")) for p in parts):
                continue

            base = _decode_zip_entry_name(member)
            if not base:
                continue

            suffix = FilePath(base).suffix.lower()

            # AMÉLIORATION 2: nested ZIP — read into bytes (rare path, archives are usually <100MB)
            if suffix == ".zip" and depth < 2:
                if member.file_size == 0:
                    continue
                try:
                    # Lecture bornée : un membre .zip qui ment sur sa taille
                    # déclarée est rejeté avant de saturer la RAM.
                    inner_buf = _io.BytesIO()
                    with zf.open(member) as inner_src:
                        _copy_zip_member_bounded(inner_src, inner_buf, member.file_size, budget)
                    inner_docs = await _extract_zip_members(
                        inner_buf.getvalue(), project_id, background_tasks, db,
                        existing_names, used_in_zip, warnings, budget, depth=depth + 1,
                    )
                    created.extend(inner_docs)
                except ZipBombError:
                    raise
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

            if base.lower().strip() in existing_names:
                continue

            # Stream the member straight to disk — avoids loading huge files into RAM.
            key = f"{prefix}/{_uuid.uuid4()}-{base}"
            path = UPLOADS_ROOT / key
            path.parent.mkdir(parents=True, exist_ok=True)
            budget.written_paths.append(path)
            try:
                with zf.open(member) as src, open(path, "wb") as dst:
                    _copy_zip_member_bounded(src, dst, member.file_size, budget)
            except ZipBombError:
                raise
            except Exception as e:
                warnings.append(f"{base} : impossible de lire le fichier ({e})")
                if path.exists():
                    try:
                        path.unlink()
                    except Exception:
                        pass
                continue

            file_url = f"/uploads/{key}"
            doc_type = _detect_doc_type(base, "autre")
            file_records.append((base, file_url, doc_type, member.file_size))
            existing_names.add(base.lower().strip())

    _t_write = _time.monotonic() - _tz0 - _t_read
    print(f"[TIMING] ZIP stream-write: {len(file_records)} files in {_t_write:.2f}s", flush=True)

    # Bulk insert all documents — single commit
    _td0 = _time.monotonic()
    new_docs: List[ProjectDocument] = []
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
        new_docs.append(doc)
    db.commit()
    for doc in new_docs:
        db.refresh(doc)
    budget.created_doc_ids.extend(d.id for d in new_docs)
    created.extend(new_docs)
    _t_db = _time.monotonic() - _td0

    print(
        f"[TIMING] _extract_zip_members: {len(created)} files in {_time.monotonic()-_tz0:.2f}s "
        f"(read={_t_read:.2f}s, write={_t_write:.2f}s, db={_t_db:.2f}s)",
        flush=True,
    )
    return created


async def _handle_zip_upload(
    source,  # IO[bytes] (seekable) — typically a SpooledTemporaryFile
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session,
) -> tuple[List[ProjectDocument], List[str]]:
    """
    Extract a ZIP and create one ProjectDocument per valid file inside.
    Returns (created_docs, warnings).

    `source` is a file-like (the streamed upload spool); members are unpacked
    to disk without ever holding the whole archive as bytes.
    """
    existing_rows = (
        db.query(ProjectDocument.file_name)
        .filter(ProjectDocument.project_id == project_id)
        .all()
    )
    existing_names: set = {row[0].lower().strip() for row in existing_rows}
    used_in_zip: set = set()
    warnings: List[str] = []
    budget = _ZipBudget()

    try:
        created = await _extract_zip_members(
            source, project_id, background_tasks, db,
            existing_names, used_in_zip, warnings, budget, depth=0,
        )
    except ZipBombError as e:
        # Rejet propre : rien ne doit rester ni sur disque ni en DB.
        db.rollback()
        for path in budget.written_paths:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass
        if budget.created_doc_ids:
            db.query(ProjectDocument).filter(
                ProjectDocument.id.in_(budget.created_doc_ids),
            ).delete(synchronize_session=False)
            db.commit()
        raise HTTPException(status_code=413, detail=str(e))
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
        name=f"synorix-lots-{project_id}",
    ).start()

    return {"status": "detecting_lots", "progress": 0, "detail": "Démarrage de la détection..."}


def _run_lot_detection_background(project_id: str, docs_data: list, uploads_root_str: str) -> None:
    """Background thread: run lot detection with real progress updates to DB
    AND to the SSE bus via pipeline_tracker."""
    import logging
    _log = logging.getLogger(__name__)
    _log.info(f"Lot detection background thread started for project {project_id}")

    from database import SessionLocal
    from pathlib import Path as _Path
    from services import pipeline_tracker

    uploads_root = _Path(uploads_root_str)

    # Drive a single-step "lot_detection" pipeline so SSE subscribers see
    # the same shape as for analysis / mémoire.
    pipeline_tracker.start_pipeline(project_id, "lot_detection")
    pipeline_tracker.start_step(project_id, "detecting_lots")

    def _update_progress(pct: int, detail: str) -> None:
        """Callback: write progress to DB (legacy poll) AND push to SSE bus."""
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
        # SSE signal — pct is 0-100 from the detector, the step covers
        # 0-100 in pipeline_tracker so we publish ratio = pct / 100.
        try:
            pipeline_tracker.update_step_progress(project_id, max(0.0, min(pct / 100.0, 0.99)))
        except Exception:
            pass

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

        # ── C3 : nombre de lots annoncé dans le RC (déterministe) ─────────────
        from services.lot_detector import extract_announced_from_docs
        from services.ai import lot_fallback
        announced = extract_announced_from_docs(doc_proxies)

        # ── C4 : filet IA (au plus UN appel Sonnet) sur échec objectif ────────
        doc_texts = {
            p.file_name: (p.extracted_text or "")
            for p in doc_proxies
            if (p.type or "autre") in ("rc", "ccap", "autre")
        }
        lots, ia_used = lot_fallback.run_fallback_if_needed(doc_texts, lots or [], announced)
        if ia_used:
            print(f"[LOTS] filet IA utilisé → {len(lots)} lots après fusion", flush=True)
        # Invariant : jamais de lot sans libellé affiché.
        lots = lot_fallback.drop_unlabeled(lots)

        # Save results
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.lots_detectes = lots or []
                project.lots_announced = announced
                project.processing_status = "ready"
                project.processing_progress = 100
                project.processing_detail = ""
                db.commit()
        finally:
            db.close()
        pipeline_tracker.complete_step(project_id, "detecting_lots")
        pipeline_tracker.complete_pipeline(project_id)

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
        pipeline_tracker.fail_pipeline(project_id, str(e)[:200])


class LotRenamePayload(BaseModel):
    user_label: str


@router.patch("/{project_id}/lots/{lot_id}/rename", response_model=ProjectResponse)
def rename_lot(
    project_id: str,
    lot_id: str,
    payload: LotRenamePayload,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Persist a user-supplied label for a lot.

    When the auto-detector returns a bare 'Lot 6' with no description, the
    UI offers an inline rename. We store the override in lots_detectes
    (JSON column) under `user_label`, leaving the original `nom` intact
    for traceability.
    """
    project = _get_project_or_404(project_id, user.organization_id, db)
    label = (payload.user_label or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="Libellé vide")
    if len(label) > 200:
        raise HTTPException(status_code=400, detail="Libellé trop long (200 caractères max)")

    lots = list(project.lots_detectes or [])
    found = False
    for lot in lots:
        if lot.get("id") == lot_id:
            lot["user_label"] = label
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Lot introuvable")

    project.lots_detectes = lots
    # Force JSON column dirty flag so SQLAlchemy actually writes the update.
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(project, "lots_detectes")
    # If the user renamed the currently-selected lot, keep the
    # selected_lot_name in sync.
    if project.selected_lot == lot_id:
        project.selected_lot_name = label
    db.commit()
    db.refresh(project)
    return project


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


@router.get("/{project_id}/go-no-go")
def get_go_no_go_score(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Heuristic Go/No-Go score (0-100) based on already-extracted data.

    No IA call — purely arithmetic on:
      • days until deadline
      • % of checklist items present
      • # of relevant references for the selected lot
      • presence of a generated mémoire technique
      • presence of a filled DPGF

    For a full IA-backed scoring we have a P1 follow-up using the
    `scoring-offres-expert` skill.
    """
    from datetime import date as _date
    from models.checklist_item import ChecklistItem
    from models.compliance_item import ComplianceItem
    from models.memoire import MemoireTechnique
    from models.reference import Reference

    project = _get_project_or_404(project_id, user.organization_id, db)

    breakdown: dict[str, dict] = {}

    # 1. Time pressure (worth 25 pts)
    if project.deadline:
        days = (project.deadline - _date.today()).days
        if days < 0:
            time_score = 0
            time_msg = "Échéance dépassée"
        elif days <= 3:
            time_score = 5
            time_msg = f"Très court : {days} jours"
        elif days <= 7:
            time_score = 12
            time_msg = f"Court : {days} jours"
        elif days <= 14:
            time_score = 20
            time_msg = f"Faisable : {days} jours"
        else:
            time_score = 25
            time_msg = f"Confortable : {days} jours"
    else:
        time_score = 15
        time_msg = "Échéance non renseignée"
    breakdown["temps"] = {"score": time_score, "max": 25, "message": time_msg}

    # 2. Checklist completion (worth 25 pts)
    items = db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).all()
    if items:
        present = sum(1 for i in items if i.status in ("present", "non_applicable"))
        ratio = present / len(items)
        cl_score = round(ratio * 25)
        cl_msg = f"{present}/{len(items)} pièces couvertes"
    else:
        cl_score = 5
        cl_msg = "Checklist non générée"
    breakdown["checklist"] = {"score": cl_score, "max": 25, "message": cl_msg}

    # 3. References match (worth 20 pts)
    org_refs = db.query(Reference).filter(
        Reference.organization_id == user.organization_id,
        Reference.deleted_at.is_(None),
        Reference.is_reference == True,
    ).all()
    if project.selected_lot_name and org_refs:
        ranked = _rank_refs_for_score(org_refs, project.selected_lot_name)
        matched = sum(1 for r in ranked if r["matched"])
        ref_score = min(20, matched * 5)
        ref_msg = f"{matched} référence(s) directement pertinente(s)"
    elif org_refs:
        ref_score = 10
        ref_msg = f"{len(org_refs)} références au total — pas de filtre lot"
    else:
        ref_score = 0
        ref_msg = "Aucune référence renseignée"
    breakdown["references"] = {"score": ref_score, "max": 20, "message": ref_msg}

    # 4. Mémoire generated (worth 15 pts)
    memoire = (
        db.query(MemoireTechnique)
        .filter(MemoireTechnique.project_id == project_id)
        .first()
    )
    if memoire:
        breakdown["memoire"] = {"score": 15, "max": 15, "message": "Mémoire généré"}
    else:
        breakdown["memoire"] = {"score": 0, "max": 15, "message": "Mémoire non généré"}

    # 5. DPGF filled (worth 15 pts)
    if project.dpgf_remplie_url:
        check = project.dpgf_remplie_check or {}
        if check.get("valid"):
            breakdown["dpgf"] = {"score": 15, "max": 15, "message": "DPGF remplie validée"}
        else:
            breakdown["dpgf"] = {"score": 8, "max": 15, "message": "DPGF déposée mais avec warnings"}
    else:
        breakdown["dpgf"] = {"score": 0, "max": 15, "message": "DPGF non déposée"}

    total = sum(b["score"] for b in breakdown.values())

    if total >= 80:
        verdict = "GO"
        recommendation = "L'offre est prête à déposer."
    elif total >= 60:
        verdict = "GO modéré"
        recommendation = "Compléter les points faibles avant dépôt."
    elif total >= 40:
        verdict = "À RISQUE"
        recommendation = "Plusieurs blocages — repousser ou prioriser un autre AO."
    else:
        verdict = "NO-GO"
        recommendation = "Beaucoup trop de manques pour gagner — abandonner cet AO."

    return {
        "score": total,
        "verdict": verdict,
        "recommendation": recommendation,
        "breakdown": breakdown,
    }


def _rank_refs_for_score(refs, selected_lot_name: str | None):
    """Tag each ref with `matched=True` if its lot field contains keywords from
    selected_lot_name. Mirrors the scoring used in memoire_generator."""
    from services.ai.memoire_generator import _CORPS_METIER_KEYWORDS
    if not selected_lot_name:
        return [{"ref": r, "matched": False} for r in refs]
    lot_lower = selected_lot_name.lower()
    matched_kw: list[str] = []
    for kws, _file in _CORPS_METIER_KEYWORDS:
        if any(kw in lot_lower for kw in kws):
            matched_kw = kws
            break
    out = []
    for r in refs:
        ref_text = ((r.lot or "") + " " + (r.intitule or "")).lower()
        is_match = bool(matched_kw) and any(kw in ref_text for kw in matched_kw)
        out.append({"ref": r, "matched": is_match})
    return out


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    """Fetch a project for the org, ignoring soft-deleted rows."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
        Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
