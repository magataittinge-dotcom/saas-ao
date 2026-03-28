from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.memoire_config import MemoireConfig
from schemas.memoire_config import MemoireConfigResponse, MemoireConfigUpdate
from routers.auth import get_auth_user
from services.document_processor import DocumentProcessor
from services.ai.memoire_importer import MemoireImporter

router = APIRouter()


@router.get("", response_model=MemoireConfigResponse)
def get_memoire_config(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    config = db.query(MemoireConfig).filter(
        MemoireConfig.organization_id == user.organization_id
    ).first()
    if not config:
        # Return empty config so frontend can display the form
        config = MemoireConfig(
            organization_id=user.organization_id,
            chiffre_affaires=[
                {"annee": "", "montant": ""},
                {"annee": "", "montant": ""},
                {"annee": "", "montant": ""},
            ],
            postes_cles=[
                {"poste": "Directeur Travaux", "nom": "", "role": ""},
                {"poste": "Conducteur Travaux", "nom": "", "role": ""},
                {"poste": "Chef de Chantier", "nom": "", "role": ""},
                {"poste": "Administration", "nom": "", "role": ""},
            ],
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.put("", response_model=MemoireConfigResponse)
def update_memoire_config(
    payload: MemoireConfigUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    config = db.query(MemoireConfig).filter(
        MemoireConfig.organization_id == user.organization_id
    ).first()
    if not config:
        config = MemoireConfig(organization_id=user.organization_id)
        db.add(config)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, field, value)

    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return config


@router.post("/import")
async def import_memoire(
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Extract structured data from an existing mémoire technique (.docx or .pdf)."""
    filename = file.filename or ""
    if not (filename.lower().endswith(".docx") or filename.lower().endswith(".pdf")):
        raise HTTPException(status_code=400, detail="Seuls les fichiers .docx et .pdf sont acceptés")

    content = await file.read()
    processor = DocumentProcessor()
    text, _ = processor.extract(content, filename)

    if not text or len(text.strip()) < 100:
        raise HTTPException(status_code=422, detail="Impossible d'extraire le texte du document")

    try:
        importer = MemoireImporter()
        extracted = await importer.extract(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'extraction IA : {str(e)}")

    # Count non-null fields
    fields_count = sum(1 for v in extracted.values() if v is not None and v != "" and v != [])

    return {"extracted": extracted, "fields_count": fields_count}
