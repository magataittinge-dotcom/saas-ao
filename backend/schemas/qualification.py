"""Schémas des qualifications, labels, certifications de management et assurances (migration 0029)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

Famille = Literal["qualification", "rge", "systeme_management", "assurance"]


class _Champs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QualificationCreate(_Champs):
    """`organization_id` n'est jamais lu du corps : il vient de l'utilisateur authentifié."""
    famille: Famille
    intitule: str = Field(min_length=1, max_length=200)
    organisme: Optional[str] = Field(default=None, max_length=120)
    numero: Optional[str] = Field(default=None, max_length=80)
    perimetre: Optional[str] = Field(default=None, max_length=500)
    date_obtention: Optional[date] = None
    date_fin: Optional[date] = None
    document_id: Optional[str] = None

    @model_validator(mode="after")
    def _dates_dans_l_ordre(self):
        if self.date_obtention and self.date_fin and self.date_fin < self.date_obtention:
            raise ValueError("la date de fin ne peut pas précéder la date d'obtention")
        return self


class QualificationUpdate(_Champs):
    famille: Optional[Famille] = None
    intitule: Optional[str] = Field(default=None, min_length=1, max_length=200)
    organisme: Optional[str] = Field(default=None, max_length=120)
    numero: Optional[str] = Field(default=None, max_length=80)
    perimetre: Optional[str] = Field(default=None, max_length=500)
    date_obtention: Optional[date] = None
    date_fin: Optional[date] = None
    document_id: Optional[str] = None


class QualificationResponse(BaseModel):
    id: str
    organization_id: str
    famille: str
    intitule: str
    organisme: Optional[str] = None
    numero: Optional[str] = None
    perimetre: Optional[str] = None
    date_obtention: Optional[date] = None
    date_fin: Optional[date] = None
    document_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
