from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OrganizationResponse(BaseModel):
    id: str
    name: str
    siret: str
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
