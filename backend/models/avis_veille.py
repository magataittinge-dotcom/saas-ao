"""Avis de marché publics (BOAMP – DILA, licence ouverte) servis par la veille.

Table GLOBALE : données publiques partagées entre toutes les organisations, donc sans
`organization_id`. On ne stocke que les champs du contrat d'API (pas le JSON brut de l'avis).
Colonnes lues telles que décrites dans `.claude/echange/sprint-ozcan/veille/BOAMP-API.md`.
"""
import uuid
from datetime import datetime

from sqlalchemy import JSON, Column, Date, DateTime, String, Text

from database import Base


class AvisVeille(Base):
    __tablename__ = "avis_veille"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    id_boamp = Column(String(40), nullable=False, unique=True, index=True)   # idweb BOAMP, ex. "26-105108"
    objet = Column(Text, nullable=False)
    acheteur = Column(String(500), nullable=False, default="")
    departements = Column(JSON, nullable=False, default=list)                # ["44", "49"]
    date_parution = Column(Date, nullable=False, index=True)
    date_limite = Column(Date, nullable=True, index=True)
    nature = Column(String(40), nullable=False, default="APPEL_OFFRE")
    procedure = Column(String(20), nullable=False, default="autre")          # valeur normalisée (contrat)
    procedure_libelle = Column(String(120), nullable=True)                   # texte BOAMP d'origine
    famille = Column(String(20), nullable=True)                              # JOUE / FNS / MAPA / DSP …
    descripteurs = Column(JSON, nullable=False, default=list)                # [{"code": "74", "libelle": "Couverture"}]
    codes_cpv = Column(JSON, nullable=False, default=list)                   # ["45261000", …]
    url_avis = Column(String(500), nullable=False)
    url_dossier = Column(String(1000), nullable=True)
    metiers = Column(JSON, nullable=False, default=list)                     # codes `Metier` déduits
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    synchronise_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
