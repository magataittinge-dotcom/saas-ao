"""Plan du mémoire : formes acceptées en entrée (Pydantic strict, longueurs bornées).

Les sources, les sous-critères, les exigences et les propositions ne sont JAMAIS acceptés du client : le serveur les
recalcule à chaque lecture."""
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from services.plan_memoire import MAX_PARTIES, MAX_TEXTE_LIBRE, MAX_TITRE

_Identifiant = Annotated[str, StringConstraints(min_length=1, max_length=64)]
_Designation = Annotated[str, StringConstraints(min_length=1, max_length=160)]


class FichePartieIn(BaseModel):
    """La fiche d'une partie. ``None`` = pas touchée (la proposition préremplie s'applique à l'écran, rien ne part au
    modèle) ; une liste, même vide, est le choix du patron."""
    model_config = ConfigDict(extra="forbid")
    references: Optional[list[_Identifiant]] = Field(default=None, max_length=50)
    personnes: Optional[list[_Identifiant]] = Field(default=None, max_length=50)
    materiel: Optional[list[_Designation]] = Field(default=None, max_length=50)
    voulu: str = Field(default="", max_length=MAX_TEXTE_LIBRE)


class PartiePlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cle: str = Field(min_length=1, max_length=40)
    titre: str = Field(default="", max_length=MAX_TITRE)
    retiree: bool = False
    attendue: Optional[str] = Field(default=None, pattern=r"^att_[0-9a-f]{10}$")
    fiche: FichePartieIn = Field(default_factory=FichePartieIn)


class PlanMemoireIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parties: list[PartiePlanIn] = Field(min_length=1, max_length=MAX_PARTIES)
