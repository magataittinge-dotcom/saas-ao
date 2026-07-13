import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.memoire_config import MemoireConfig
from schemas.memoire_config import MemoireConfigResponse, MemoireConfigUpdate
from routers.auth import get_auth_user
from services.document_processor import DocumentProcessor
from services.ai.memoire_importer import MemoireImporter

router = APIRouter()


class StructureTextRequest(BaseModel):
    """C7 — texte libre à structurer vers les champs du profil."""
    text: str

    @field_validator("text")
    @classmethod
    def _text_bounds(cls, v):
        from services.ai.profile_structurer import MAX_TEXT_CHARS
        if not (v or "").strip():
            raise ValueError("Le texte est vide.")
        if len(v) > MAX_TEXT_CHARS:
            raise ValueError(f"Texte trop long ({len(v)} caractères, max {MAX_TEXT_CHARS}).")
        return v


@router.post("/structure-text")
async def structure_text(
    payload: StructureTextRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C7 — Haiku structure le texte libre vers les champs du profil.

    Retourne une PROPOSITION (preview) : rien n'est écrit en base — c'est
    le PUT /memoire-config existant qui persiste après validation."""
    from services.ai.profile_structurer import structure_profile_text

    try:
        proposed, usage = await structure_profile_text(payload.text)
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).error(f"structure-text échoué: {e}", exc_info=True)
        raise HTTPException(
            status_code=502,
            detail="Structuration indisponible — réessayez dans un instant.",
        )
    return {"proposed": proposed, "usage": usage}


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


_PROFILE_FIELDS = [
    "nom_entreprise", "date_creation", "gerant_nom", "gerant_titre",
    "zone_intervention", "historique", "activites", "chiffre_affaires",
    "organigramme_description", "postes_cles", "moyens_informatiques",
    "vehicules", "materiel", "demarche_qualite", "procedure_demarrage",
    "gestion_securite", "traitement_dechets", "mesures_environnementales",
]


@router.get("/stats")
def get_memoire_config_stats(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Lightweight profile completion stats for StepMemoire display."""
    config = db.query(MemoireConfig).filter(
        MemoireConfig.organization_id == user.organization_id
    ).first()
    if not config:
        return {"filled": 0, "total": 18, "nom_entreprise": None}

    filled = 0
    for f in _PROFILE_FIELDS:
        val = getattr(config, f, None)
        if val is None or val == "" or val == []:
            continue
        # For JSON arrays, check if any entry has actual content
        if isinstance(val, list):
            if any(
                any(v for v in item.values() if v) if isinstance(item, dict) else item
                for item in val
            ):
                filled += 1
        else:
            filled += 1

    return {
        "filled": filled,
        "total": 18,
        "nom_entreprise": config.nom_entreprise or None,
    }


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
    # R8 — extraction docx/pdf (PyMuPDF/python-docx) hors event-loop (WSL2).
    text, _ = await asyncio.to_thread(processor.extract, content, filename)

    if not text or len(text.strip()) < 100:
        raise HTTPException(status_code=422, detail="Impossible d'extraire le texte du document")

    try:
        importer = MemoireImporter()
        extracted = await importer.extract(text)
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).error(f"Erreur extraction mémoire import: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de l'extraction du mémoire. Veuillez réessayer.")

    # Count non-null fields
    fields_count = sum(1 for v in extracted.values() if v is not None and v != "" and v != [])

    return {"extracted": extracted, "fields_count": fields_count}
