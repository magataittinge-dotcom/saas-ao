"""Schémas des fiches « Mon entreprise » : le bordereau modifiable d'une rubrique.

Tout est borné (longueurs, nombre de lignes, couleur en « #RRGGBB »). Les textes sont nettoyés des
caractères de contrôle : un Word (XML) ne peut pas les porter, et ils n'ont rien à faire dans un titre."""
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Rubrique = Literal["identite", "moyens", "certifications"]
RUBRIQUES: tuple[str, ...] = ("identite", "moyens", "certifications")

# Sections qui reçoivent des lignes libres, par rubrique (numéros imprimés sur la fiche).
SECTIONS: dict[str, tuple[str, ...]] = {
    "identite": ("01", "02", "03", "04"),
    "moyens": ("01", "02", "03", "04", "05", "06", "07"),
    "certifications": ("01", "02", "03"),
}

COULEUR_PAR_DEFAUT = "#008cf8"   # accent du thème Synorix (palier 500, SYSTEME-DESIGN)
MAX_LIGNES_LIBRES = 30

_COULEUR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_CONTROLE_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f￾￿]")


def nettoyer(texte: Optional[str]) -> Optional[str]:
    """Retire les caractères de contrôle (jamais valides en XML) et rogne les blancs."""
    if texte is None:
        return None
    return _CONTROLE_RE.sub("", texte).strip()


class LigneLibre(BaseModel):
    section: str = Field(min_length=1, max_length=12)
    libelle: str = Field(min_length=1, max_length=80)
    valeur: str = Field(default="", max_length=300)

    @field_validator("section", "libelle", "valeur", mode="before")
    @classmethod
    def _nettoyer(cls, v):
        return nettoyer(v) if isinstance(v, str) else v


class BordereauIn(BaseModel):
    """Corps du PUT. Un champ vide ou absent revient à la valeur par défaut de la rubrique."""
    titre: Optional[str] = Field(default=None, max_length=120)
    sous_titre: Optional[str] = Field(default=None, max_length=200)
    contact: Optional[str] = Field(default=None, max_length=200)
    couleur: Optional[str] = Field(default=None, max_length=7)
    lignes_libres: list[LigneLibre] = Field(default_factory=list, max_length=MAX_LIGNES_LIBRES)

    @field_validator("titre", "sous_titre", "contact", mode="before")
    @classmethod
    def _nettoyer(cls, v):
        v = nettoyer(v) if isinstance(v, str) else v
        return v or None

    @field_validator("couleur", mode="before")
    @classmethod
    def _couleur(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        if not isinstance(v, str) or not _COULEUR_RE.match(v.strip()):
            raise ValueError("Couleur attendue au format #RRGGBB.")
        return v.strip().lower()
