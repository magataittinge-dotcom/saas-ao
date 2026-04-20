import mimetypes
from pathlib import Path
from urllib.parse import quote, unquote
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from routers.auth import get_auth_user
from services.pdf_highlighter import PdfHighlighter


def _content_disposition(filename: str, disposition: str = "inline") -> str:
    """Build a Content-Disposition header safe for accented filenames (RFC 5987)."""
    ascii_name = filename.encode("ascii", errors="replace").decode("ascii")
    utf8_name = quote(filename, safe="")
    return f'{disposition}; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_name}'

router = APIRouter()

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"


@router.get("/view/{file_path:path}")
async def view_file(
    file_path: str,
    page: int = Query(None, description="Numéro de page à afficher"),
    highlight: str = Query(None, description="Texte à surligner dans le PDF"),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Serve a file inline. Si c'est un PDF avec highlight, surligne le passage en jaune."""
    file_path = unquote(file_path)
    full_path = UPLOADS_ROOT / file_path

    # Sécurité : empêcher path traversal
    try:
        full_path = full_path.resolve()
        if not str(full_path).startswith(str(UPLOADS_ROOT.resolve())):
            raise HTTPException(status_code=403, detail="Accès interdit")
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
