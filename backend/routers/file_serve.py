import logging
import mimetypes
import re
from pathlib import Path
from urllib.parse import quote, unquote
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from models.project import Project
from models.document import Document
from routers.auth import get_auth_user
from services.file_storage import SIGNED_URL_TTL, sign_file_path, verify_file_signature
from services.pdf_highlighter import PdfHighlighter

logger = logging.getLogger(__name__)


def _content_disposition(filename: str, disposition: str = "inline") -> str:
    """Build a Content-Disposition header safe for accented filenames (RFC 5987)."""
    ascii_name = filename.encode("ascii", errors="replace").decode("ascii")
    utf8_name = quote(filename, safe="")
    return f'{disposition}; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_name}'


router = APIRouter()

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _authorize_path(file_path: str, org_id: str, db: Session) -> None:
    """Verify the organization owns the file at the given relative path.

    Known prefixes:
      • projects/<project_id>/...      → project must belong to org_id
      • organizations/<o_id>/...       → o_id must equal org_id
      • <project_id>/completed/...     → legacy candidature uploads (pre-migration);
                                         still supported via project ownership check.

    Anything else → 403 (no implicit trust).
    """
    parts = file_path.replace("\\", "/").split("/")
    if not parts:
        raise HTTPException(status_code=403, detail="Accès interdit")

    head = parts[0]

    if head == "projects":
        if len(parts) < 2:
            raise HTTPException(status_code=403, detail="Accès interdit")
        project_id = parts[1]
        proj = db.query(Project).filter(
            Project.id == project_id,
            Project.organization_id == org_id,
        ).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        return

    if head == "organizations":
        if len(parts) < 2:
            raise HTTPException(status_code=403, detail="Accès interdit")
        if parts[1] != org_id:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        return

    if head == "tests":
        from config import get_settings
        if not get_settings().DEBUG:
            raise HTTPException(status_code=403, detail="Accès interdit")
        return

    # Legacy: candidature.py used to store completed templates at
    # <project_id>/completed/... (pre-2026-04-30). Treat the first segment
    # as a project_id and authorise via project ownership.
    if _UUID_RE.match(head):
        proj = db.query(Project).filter(
            Project.id == head,
            Project.organization_id == org_id,
        ).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        return

    logger.warning(
        "file_serve: refused access to unknown prefix %r for org %s",
        head, org_id,
    )
    raise HTTPException(status_code=403, detail="Accès interdit")


@router.get("/sign")
def sign_file_url(
    path: str = Query(..., description="Chemin du fichier (/uploads/... ou relatif)"),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Mint une URL signée à durée limitée pour un fichier possédé par l'org.

    Le front appelle cet endpoint (Bearer) puis utilise l'URL retournée pour
    les accès navigateur directs (href, window.open, visionneuse PDF)."""
    rel = unquote(path.removeprefix("/uploads/").lstrip("/"))
    _authorize_path(rel, user.organization_id, db)
    return {
        "url": sign_file_path(rel, org_id=user.organization_id),
        "expires_in": SIGNED_URL_TTL,
    }


@router.get("/view/{file_path:path}")
async def view_file(
    file_path: str,
    org: str = Query(None, description="Organisation liée par la signature"),
    exp: str = Query(None, description="Expiration (epoch)"),
    sig: str = Query(None, description="Signature HMAC"),
    page: int = Query(None, description="Numéro de page à afficher"),
    highlight: str = Query(None, description="Texte à surligner dans le PDF"),
    db: Session = Depends(get_db),
):
    """Serve a file inline. Si c'est un PDF avec highlight, surligne le passage en jaune.

    Security (C22 — URLs signées à durée limitée):
      • requires a valid, unexpired HMAC signature binding (path, org, exp) —
        minted via GET /api/files/sign; sans signature valide → 403
      • ownership re-checked: the signed org must own the file (_authorize_path)
      • blocks path traversal via .resolve() + prefix check
    """
    file_path = unquote(file_path)
    if not (org and exp and sig) or not verify_file_signature(file_path, org, exp, sig):
        raise HTTPException(
            status_code=403,
            detail="Lien invalide ou expiré — rechargez la page pour obtenir un nouveau lien.",
        )
    _authorize_path(file_path, org, db)

    full_path = UPLOADS_ROOT / file_path

    # Path traversal defence
    try:
        full_path = full_path.resolve()
        if not str(full_path).startswith(str(UPLOADS_ROOT.resolve())):
            raise HTTPException(status_code=403, detail="Accès interdit")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Chemin invalide")

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    content_type = mimetypes.guess_type(str(full_path))[0] or "application/octet-stream"

    # Si c'est un PDF avec un texte à surligner
    if full_path.suffix.lower() == '.pdf' and highlight and page:
        highlighted_path = PdfHighlighter.highlight_text_in_pdf(
            pdf_path=full_path,
            page_number=page,
            search_text=highlight,
        )
        if highlighted_path and highlighted_path.exists():
            return FileResponse(
                path=str(highlighted_path),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": _content_disposition(full_path.name),
                    "Cache-Control": "no-cache",
                },
            )

    return FileResponse(
        path=str(full_path),
        media_type=content_type,
        headers={"Content-Disposition": _content_disposition(full_path.name)},
    )
