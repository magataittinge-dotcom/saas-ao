"""Schémas du profil de l'entreprise (migration 0029) : lignes typées des listes JSON et bornes des champs.

Les bornes viennent de INFORMATIONS-ENTREPRISE.md § 2. Les lignes d'une liste sont validées à l'écriture ;
la lecture reste tolérante (les anciennes données ne sont jamais refusées en sortie).
"""
from __future__ import annotations

import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, TypeAdapter, field_validator, model_validator

from schemas.veille import Metier, valider_departements
from services.veille.metiers import LIBELLES

# ── Organisation ──
_TELEPHONE = re.compile(r"^[0-9 +().-]{6,30}$")
_EMAIL = TypeAdapter(EmailStr)


def valider_email(valeur: Optional[str]) -> Optional[str]:
    """Adresse valide, ou vide (effacer le champ)."""
    if valeur is None or valeur.strip() == "":
        return valeur
    return str(_EMAIL.validate_python(valeur.strip()))


def valider_telephone(valeur: Optional[str]) -> Optional[str]:
    if valeur is None or valeur.strip() == "":
        return valeur
    if not _TELEPHONE.match(valeur.strip()):
        raise ValueError("numéro de téléphone invalide (chiffres, espaces et + ( ) . - seulement, 6 à 30 caractères)")
    return valeur.strip()


# ── Chiffre d'affaires : les clés actuelles (annee, montant) ne changent pas, quatre clés s'ajoutent ──
_ANNEE = re.compile(r"^(\d{4})?$")


def _date_iso(valeur: Optional[str]) -> Optional[str]:
    if valeur is None or valeur == "":
        return None
    try:
        date.fromisoformat(valeur)
    except ValueError:
        raise ValueError("date attendue au format AAAA-MM-JJ") from None
    return valeur


class LigneChiffreAffaires(BaseModel):
    model_config = ConfigDict(extra="allow")   # une clé inconnue déjà stockée n'est pas perdue
    annee: str = Field(default="", max_length=4)
    montant: str = Field(default="", max_length=40)
    montant_domaine: Optional[str] = Field(default=None, max_length=40)
    exercice_debut: Optional[str] = None
    exercice_fin: Optional[str] = None
    effectif_moyen: Optional[int] = Field(default=None, ge=0, le=999)

    @field_validator("annee")
    @classmethod
    def _annee(cls, v: str) -> str:
        if not _ANNEE.match(v):
            raise ValueError("l'année s'écrit sur quatre chiffres")
        return v

    @field_validator("exercice_debut", "exercice_fin")
    @classmethod
    def _dates(cls, v: Optional[str]) -> Optional[str]:
        return _date_iso(v)


def valider_chiffre_affaires(lignes: Optional[list[LigneChiffreAffaires]]) -> Optional[list[LigneChiffreAffaires]]:
    if lignes is not None and len(lignes) > 5:
        raise ValueError("cinq exercices au plus")
    return lignes


# ── Listes typées de memoire_configs ──
Categorie = Literal["encadrement", "chef_equipe", "ouvrier", "administratif", "apprenti"]
TypeHabilitation = Literal["sst", "caces", "habilitation_electrique", "amiante_ss3", "amiante_ss4", "travail_hauteur", "autre"]


class LigneEffectif(BaseModel):
    model_config = ConfigDict(extra="forbid")
    categorie: Categorie
    specialite: Optional[str] = Field(default=None, max_length=80)
    effectif: int = Field(ge=0, le=999)


def valider_effectifs(lignes: Optional[list[LigneEffectif]]) -> Optional[list[LigneEffectif]]:
    if lignes is None:
        return lignes
    if len(lignes) > 40:
        raise ValueError("40 lignes au plus")
    vus: set[tuple[str, str]] = set()
    for l in lignes:
        cle = (l.categorie, (l.specialite or "").strip().lower())
        if cle in vus:
            raise ValueError("une même catégorie et une même spécialité ne peuvent figurer qu'une fois")
        vus.add(cle)
    return lignes


class LigneHabilitation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: TypeHabilitation
    libelle: Optional[str] = Field(default=None, max_length=80)
    nombre: int = Field(ge=0, le=999)
    valide_jusqu: Optional[str] = None

    @field_validator("valide_jusqu")
    @classmethod
    def _fin(cls, v: Optional[str]) -> Optional[str]:
        return _date_iso(v)

    @model_validator(mode="after")
    def _libelle_si_autre(self):
        if self.type == "autre" and not (self.libelle or "").strip():
            raise ValueError("le libellé est obligatoire pour « autre »")
        return self


def valider_habilitations(lignes: Optional[list[LigneHabilitation]]) -> Optional[list[LigneHabilitation]]:
    if lignes is None:
        return lignes
    if len(lignes) > 20:
        raise ValueError("20 lignes au plus")
    vus: set[tuple[str, str]] = set()
    for l in lignes:
        cle = (l.type, (l.libelle or "").strip().lower() if l.type == "autre" else "")
        if cle in vus:
            raise ValueError("chaque type d'habilitation ne figure qu'une fois (« autre » : libellés distincts)")
        vus.add(cle)
    return lignes


class LigneMoyen(BaseModel):
    """Une ligne de matériel ou de véhicules."""
    model_config = ConfigDict(extra="forbid")
    quantite: int = Field(ge=1, le=9999)
    designation: str = Field(min_length=1, max_length=120)
    unite: Optional[str] = Field(default=None, max_length=12)
    famille: Optional[str] = Field(default=None, max_length=60)


def valider_moyens(lignes: Optional[list[LigneMoyen]], maximum: int) -> Optional[list[LigneMoyen]]:
    if lignes is not None and len(lignes) > maximum:
        raise ValueError(f"{maximum} lignes au plus")
    return lignes


def valider_metiers(codes: Optional[list[Metier]]) -> Optional[list[Metier]]:
    if codes is None:
        return codes
    if len(codes) > len(LIBELLES) or len(set(codes)) != len(codes):
        raise ValueError("métiers : sans doublon")
    return codes


def valider_departements_intervention(codes: Optional[list[str]]) -> Optional[list[str]]:
    if codes is None:
        return codes
    if len(codes) > 101:
        raise ValueError("101 départements au plus")
    return valider_departements(codes)


# ── Références ──
ClientType = Literal["public", "prive_pro", "particulier"]
ModeIntervention = Literal["direct", "sous_traitance", "cotraitance"]
