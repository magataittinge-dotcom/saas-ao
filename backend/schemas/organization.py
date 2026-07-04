from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OrganizationResponse(BaseModel):
    id: str
    name: str
    siret: Optional[str]
    siret_verified: bool = False
    trial_granted: bool = True  # C15 — pilote l'écran « premier DCE offert »
    naf_code: Optional[str] = None
    effectif_tranche: Optional[str] = None
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


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    presentation: Optional[str] = None
    historique: Optional[str] = None
    activites: Optional[str] = None
    organigramme: Optional[str] = None
    moyens_informatiques: Optional[str] = None
    vehicules: Optional[str] = None
    materiel: Optional[str] = None
    fournisseurs: Optional[str] = None
