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


def _authorize_path(file_path: str, user: User, db: Session) -> None:
    """Verify the user is allowed to read a file at the given relative path.

    Known prefixes:
      • projects/<project_id>/...      → project must belong to user.organization_id
      • organizations/<org_id>/...     → org_id must equal user.organization_id
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
            Project.organization_id == user.organization_id,
        ).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        return

    if head == "organizations":
        if len(parts) < 2:
            raise HTTPException(status_code=403, detail="Accès interdit")
        org_id = parts[1]
        if org_id != user.organization_id:
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
            Project.organization_id == user.organization_id,
        ).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        return

    logger.warning(
        "file_serve: refused access to unknown prefix %r for user %s",
        head, user.id,
    )
    raise HTTPException(status_code=403, detail="Accès interdit")


@router.get("/view/{file_path:path}")
async def view_file(
    file_path: str,
    page: int = Query(None, description="Numéro de page à afficher"),
    highlight: str = Query(None, description="Texte à surligner dans le PDF"),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Serve a file inline. Si c'est un PDF avec highlight, surligne le passage en jaune.

    Security:
      • requires authentication (get_auth_user)
      • verifies ownership via _authorize_path
      • blocks path traversal via .resolve() + prefix check
    """
    file_path = unquote(file_path)
    _authorize_path(file_path, user, db)

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
