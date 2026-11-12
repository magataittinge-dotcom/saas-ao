"""« Le style de mon entreprise » (C4, migration 0036) : une ligne par organisation, lue dans un ancien mémoire.

LECTURE SEULE (décision D5 du fondateur) : le style est enregistré et montré dans Mon entreprise, il n'est JAMAIS
envoyé au générateur du mémoire. Fonction éteinte par défaut (STYLE_ENTREPRISE=0, services/fonctions_ia.py).
``style`` : {ton, personne, longueur_phrases, structure, vocabulaire[], exemples[]} validé par
services/ai/fonctions_c.valider_style. Le fichier lu n'est pas gardé : seulement son nom.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String

from database import Base


class StyleEntreprise(Base):
    __tablename__ = "styles_entreprise"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, unique=True, index=True)
    style = Column(JSON, nullable=False)
    source_fichier = Column(String(255), nullable=False)
    modele = Column(String(64), nullable=False)
    lu_le = Column(DateTime, nullable=False, default=datetime.utcnow)
