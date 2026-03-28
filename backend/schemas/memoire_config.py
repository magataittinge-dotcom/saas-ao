from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class CAEntry(BaseModel):
    annee: str
    montant: str


class PosteCle(BaseModel):
    poste: str
    nom: str
    role: str


class MemoireConfigResponse(BaseModel):
    id: str
    organization_id: str
    nom_entreprise: Optional[str] = None
    date_creation: Optional[str] = None
    gerant_nom: Optional[str] = None
    gerant_titre: Optional[str] = None
    zone_intervention: Optional[str] = None
    historique: Optional[str] = None
    activites: Optional[str] = None
    chiffre_affaires: Optional[List[Any]] = None
    organigramme_description: Optional[str] = None
    postes_cles: Optional[List[Any]] = None
    moyens_informatiques: Optional[str] = None
    vehicules: Optional[str] = None
    materiel: Optional[str] = None
    demarche_qualite: Optional[str] = None
    procedure_demarrage: Optional[str] = None
    gestion_securite: Optional[str] = None
    traitement_dechets: Optional[str] = None
    mesures_environnementales: Optional[str] = None
    fournisseurs_principaux: Optional[str] = None
    updated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MemoireConfigUpdate(BaseModel):
    nom_entreprise: Optional[str] = None
    date_creation: Optional[str] = None
    gerant_nom: Optional[str] = None
    gerant_titre: Optional[str] = None
    zone_intervention: Optional[str] = None
    historique: Optional[str] = None
    activites: Optional[str] = None
    chiffre_affaires: Optional[List[Any]] = None
    organigramme_description: Optional[str] = None
    postes_cles: Optional[List[Any]] = None
    moyens_informatiques: Optional[str] = None
    vehicules: Optional[str] = None
    materiel: Optional[str] = None
    demarche_qualite: Optional[str] = None
    procedure_demarrage: Optional[str] = None
    gestion_securite: Optional[str] = None
    traitement_dechets: Optional[str] = None
    mesures_environnementales: Optional[str] = None
    fournisseurs_principaux: Optional[str] = None
