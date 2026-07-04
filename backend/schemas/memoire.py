from pydantic import BaseModel, field_validator
from typing import List, Optional, Any
from datetime import datetime

# Champs de profil éditables au pre-flight (C9a) — alignés sur les clés du
# company_block du générateur. Toute autre clé est rejetée (422).
PROFILE_OVERRIDE_FIELDS = {
    "nom", "gerant_nom", "gerant_titre", "zone_intervention",
    "historique", "activites", "organigramme_description",
    "moyens_informatiques", "vehicules", "materiel",
}


class MemoireGenerateRequest(BaseModel):
    nb_ouvriers: Optional[int] = None
    delai: Optional[str] = None
    interlocuteur_id: Optional[str] = None
    particularites: Optional[str] = None
    chef_chantier_nom: Optional[str] = None
    chef_chantier_qualification: Optional[str] = None
    conducteur_travaux_nom: Optional[str] = None
    conducteur_travaux_qualification: Optional[str] = None
    materiel_specifique: Optional[str] = None
    # C9a — pre-flight : overrides locaux + sélection de références + propagation
    profile_overrides: Optional[dict] = None
    reference_ids: Optional[List[str]] = None
    update_profile: bool = False

    @field_validator("profile_overrides")
    @classmethod
    def _validate_override_keys(cls, v):
        if v is None:
            return v
        unknown = set(v) - PROFILE_OVERRIDE_FIELDS
        if unknown:
            raise ValueError(
                f"Champs de profil inconnus : {', '.join(sorted(unknown))}. "
                f"Autorisés : {', '.join(sorted(PROFILE_OVERRIDE_FIELDS))}"
            )
        return v


class MemoireUpdateRequest(BaseModel):
    content_json: Any


class MemoireResponse(BaseModel):
    id: str
    project_id: str
    content_json: Any
    version: int
    generated_at: datetime
    variables: Optional[Any]
    is_reference_template: bool
    docx_export_url: Optional[str]

    model_config = {"from_attributes": True}
