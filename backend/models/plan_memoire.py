"""Le plan du mémoire (B1, migration 0034) : une ligne par dossier et par lot.

``parties`` : liste ordonnée de ``{cle, titre, retiree, attendue, fiche}`` (voir services/plan_memoire.py). Le plan
n'est utilisé par le générateur que s'il est VALIDÉ (``valide_le`` renseigné) ; toute modification le remet à valider.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint

from database import Base


class PlanMemoire(Base):
    __tablename__ = "plans_memoire"
    __table_args__ = (UniqueConstraint("project_id", "lot", name="uq_plans_memoire_projet_lot"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    lot = Column(String(64), nullable=False, default="", server_default="")
    parties = Column(JSON, nullable=False)
    valide_le = Column(DateTime, nullable=True)
    version = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
