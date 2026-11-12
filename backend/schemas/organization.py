from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime

from schemas.profil_entreprise import valider_email, valider_telephone


class OrganizationResponse(BaseModel):
    id: str
    name: str
    siret: Optional[str]
    siret_verified: bool = False
    trial_granted: bool = True  # C15 — pilote l'écran « premier DCE offert »
    naf_code: Optional[str] = None
    effectif_tranche: Optional[str] = None
    forme_juridique: Optional[str] = None
    capital_social: Optional[int] = None
    greffe_rcs: Optional[str] = None
    email_contact: Optional[str] = None
    telephone: Optional[str] = None
    address: Optional[str]
    logo_url: Optional[str]
    presentation: Optional[str]
    historique: Optional[str]
    activites: Optional[str]
    organigramme: Optional[str]
    moyens_informatiques: Optional[str]
    vehicules: Optional[str]
    materiel: Optional[str]
    fournisseurs: Optional[str]
    plan: str
    created_at: datetime

    model_config = {"from_attributes": True}


# S-17 — textes du profil bornés (ils partent dans le prompt du mémoire) ; le nom suit sa colonne String(255).
MAX_TEXTE_PROFIL = 20_000


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    presentation: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    historique: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    activites: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    organigramme: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    moyens_informatiques: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    vehicules: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    materiel: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)
    fournisseurs: Optional[str] = Field(default=None, max_length=MAX_TEXTE_PROFIL)

    # Identité légale (migration 0029). Un champ vide est accepté : c'est ainsi qu'on l'efface.
    forme_juridique: Optional[str] = Field(default=None, max_length=80)
    capital_social: Optional[int] = Field(default=None, ge=0, le=10_000_000_000)  # euros
    greffe_rcs: Optional[str] = Field(default=None, max_length=80)
    email_contact: Optional[str] = Field(default=None, max_length=255)
    telephone: Optional[str] = Field(default=None, max_length=30)

    @field_validator("email_contact")
    @classmethod
    def _email(cls, v):
        return valider_email(v)

    @field_validator("telephone")
    @classmethod
    def _telephone(cls, v):
        return valider_telephone(v)
