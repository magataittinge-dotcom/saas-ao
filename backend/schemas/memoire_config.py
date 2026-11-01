from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime

from schemas.profil_entreprise import (
    LigneChiffreAffaires, LigneEffectif, LigneHabilitation, LigneMoyen, Metier,
    valider_chiffre_affaires, valider_departements_intervention, valider_effectifs, valider_habilitations,
    valider_metiers, valider_moyens,
)


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
    metiers: Optional[List[Any]] = None
    departements_intervention: Optional[List[Any]] = None
    effectifs_par_categorie: Optional[List[Any]] = None
    habilitations: Optional[List[Any]] = None
    materiel_liste: Optional[List[Any]] = None
    vehicules_liste: Optional[List[Any]] = None
    sous_traitance_partenaires: Optional[str] = None
    sous_traitance_part_pct: Optional[int] = None
    sav_garantie: Optional[str] = None
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
    chiffre_affaires: Optional[List[LigneChiffreAffaires]] = None
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

    # Migration 0029 — listes typées et bornes (INFORMATIONS-ENTREPRISE.md § 2.3).
    metiers: Optional[List[Metier]] = None
    departements_intervention: Optional[List[str]] = None
    effectifs_par_categorie: Optional[List[LigneEffectif]] = None
    habilitations: Optional[List[LigneHabilitation]] = None
    materiel_liste: Optional[List[LigneMoyen]] = None
    vehicules_liste: Optional[List[LigneMoyen]] = None
    sous_traitance_partenaires: Optional[str] = Field(default=None, max_length=2000)
    sous_traitance_part_pct: Optional[int] = Field(default=None, ge=0, le=100)
    sav_garantie: Optional[str] = Field(default=None, max_length=3000)

    @field_validator("chiffre_affaires")
    @classmethod
    def _ca(cls, v):
        return valider_chiffre_affaires(v)

    @field_validator("metiers")
    @classmethod
    def _metiers(cls, v):
        return valider_metiers(v)

    @field_validator("departements_intervention")
    @classmethod
    def _departements(cls, v):
        return valider_departements_intervention(v)

    @field_validator("effectifs_par_categorie")
    @classmethod
    def _effectifs(cls, v):
        return valider_effectifs(v)

    @field_validator("habilitations")
    @classmethod
    def _habilitations(cls, v):
        return valider_habilitations(v)

    @field_validator("materiel_liste")
    @classmethod
    def _materiel(cls, v):
        return valider_moyens(v, 60)

    @field_validator("vehicules_liste")
    @classmethod
    def _vehicules(cls, v):
        return valider_moyens(v, 20)
