from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.organization import Organization
from schemas.organization import OrganizationResponse, OrganizationUpdate
from routers.auth import get_auth_user

router = APIRouter()

_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg"}
_LOGO_MAX_SIZE = 2 * 1024 * 1024  # 2 Mo


@router.post("/me/logo")
async def upload_logo(
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C8b — logo de l'entreprise (page de garde du mémoire).

    Stocké au coffre-fort catégorie references_moyens + organizations.logo_url."""
    from pathlib import Path as _Path
    from models.document import Document
    from services.file_storage import FileStorage

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    filename = (file.filename or "").strip()
    ext = _Path(filename).suffix.lower()
    if ext not in _LOGO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format de logo non supporté : {ext or '(aucun)'} — PNG ou JPG attendu.",
        )
    content = await file.read()
    if len(content) > _LOGO_MAX_SIZE:
        raise HTTPException(status_code=400, detail="Logo trop volumineux (max 2 Mo).")

    storage = FileStorage()
    file_url = await storage.upload(
        content, filename,
        f"organizations/{user.organization_id}/vault",
        file.content_type,
    )
    doc = Document(
        organization_id=user.organization_id,
        type="autre",
        category="references_moyens",   # rangé avec les moyens de l'entreprise
        status="unclassified",           # un logo n'a pas de date de validité
        file_url=file_url,
        file_name=filename,
    )
    db.add(doc)
    org.logo_url = file_url
    db.commit()
    return {"logo_url": file_url}


@router.get("/me", response_model=OrganizationResponse)
def get_my_organization(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    return org


@router.patch("/me", response_model=OrganizationResponse)
def update_my_organization(
    payload: OrganizationUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(org, field, value)

    db.commit()
    db.refresh(org)
    return org
