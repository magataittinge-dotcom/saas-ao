"""Préférences de veille, par utilisateur (rattachées à son organisation)."""
import uuid
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String

from database import Base


class PreferencesVeille(Base):
    __tablename__ = "preferences_veille"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    departements = Column(JSON, nullable=False, default=list)
    ville = Column(JSON, nullable=True)
    filtres = Column(JSON, nullable=False, default=dict)
    tri = Column(String(20), nullable=False, default="date_limite")
    derniere_visite = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
