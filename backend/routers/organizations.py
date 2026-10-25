from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.organization import Organization
from schemas.organization import OrganizationResponse, OrganizationUpdate
from routers.auth import get_auth_user
from services.upload_validation import RegleDepot, recevoir_fichier

router = APIRouter()

_LOGO_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg"})
# B8 — ordre de grandeur : un logo PNG/JPG pèse de quelques dizaines de Ko à
# 2-3 Mo en haute définition ; 5 Mo laisse passer ces exports et borne ce que
# chaque export du mémoire relit pour la page de garde (avant : 2 Mo, vérifiés
# après lecture complète).
_LOGO_MAX_SIZE = 5 * 1024 * 1024


@router.post("/me/logo")
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C8b — logo de l'entreprise (page de garde du mémoire).

    Stocké au coffre-fort catégorie references_moyens + organizations.logo_url."""
    from models.document import Document
    from services.file_storage import FileStorage

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    filename = (file.filename or "").strip()
    regle = RegleDepot(_LOGO_EXTENSIONS, _LOGO_MAX_SIZE, "PNG ou JPG")
    with await recevoir_fichier(request, file, regle) as recu:
        file_url = await FileStorage().upload_stream(
            recu.flux, filename,
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
