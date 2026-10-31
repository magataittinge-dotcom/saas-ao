"""Schémas Pydantic de la veille — contrat `/api/veille` (strict : champs inconnus refusés)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from services.veille.departements import departement_valide
from services.veille.metiers import LIBELLES

Metier = Literal[
    "gros_oeuvre", "cvc", "cfo_cfa", "menuiseries", "facade_ite", "peinture", "plomberie", "electricite",
    "couverture", "vrd", "demolition", "etancheite", "carrelage", "platrerie", "serrurerie", "ascenseurs",
    "espaces_verts", "autre",
]
Procedure = Literal["adaptee", "ouvert", "restreint", "negociee", "dialogue", "autre"]
Tri = Literal["date_limite", "date_parution"]
MAX_DEPARTEMENTS = 30
MAX_MOTS_CLES = 120
assert set(Metier.__args__) == set(LIBELLES)       # une seule liste de métiers, deux déclarations à garder alignées

_STRICT = ConfigDict(extra="forbid")


def valider_departements(valeurs: list[str]) -> list[str]:
    vus: list[str] = []
    for code in valeurs:
        if not departement_valide(code):
            raise ValueError(f"code de département inconnu : {code!r}")
        if code not in vus:
            vus.append(code)
    return vus


class VillePreferences(BaseModel):
    model_config = _STRICT
    libelle: str = Field(max_length=120)
    code_insee: str = Field(max_length=5)
    code_postal: str = Field(max_length=5)
    departement: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    rayon_km: Optional[float] = Field(default=None, gt=0, le=500)

    @field_validator("departement")
    @classmethod
    def _departement(cls, valeur: str) -> str:
        if not departement_valide(valeur):
            raise ValueError(f"code de département inconnu : {valeur!r}")
        return valeur


class FiltresPreferences(BaseModel):
    model_config = _STRICT
    metiers: list[Metier] = Field(default_factory=list, max_length=len(LIBELLES))
    delai_jours: Optional[Literal[7, 15, 30]] = None
    procedures: list[Procedure] = Field(default_factory=list, max_length=6)
    mots_cles: str = Field(default="", max_length=MAX_MOTS_CLES)


class PreferencesIn(BaseModel):
    """`Partial<Preferences>` : seuls les champs présents sont modifiés ; `ville: null` efface la ville.
    `derniere_visite` est accepté et ignoré (seule la route `/visite` la pose)."""
    model_config = _STRICT
    departements: Optional[list[str]] = Field(default=None, max_length=MAX_DEPARTEMENTS)
    ville: Optional[VillePreferences] = None
    filtres: Optional[FiltresPreferences] = None
    tri: Optional[Tri] = None
    derniere_visite: Optional[str] = None

    @field_validator("departements")
    @classmethod
    def _departements(cls, valeurs):
        return None if valeurs is None else valider_departements(valeurs)


class PreferencesOut(BaseModel):
    departements: list[str]
    ville: Optional[VillePreferences]
    filtres: FiltresPreferences
    tri: Tri
    derniere_visite: Optional[str]
