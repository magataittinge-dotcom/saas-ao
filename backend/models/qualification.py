import uuid
from datetime import datetime
from sqlalchemy import Column, String, Date, DateTime, ForeignKey
from database import Base


class Qualification(Base):
    """Qualification, label, certification de management ou assurance déclarés par l'entreprise.

    Une ligne a sa propre vie : une date de fin à surveiller (« À renouveler »), un justificatif du coffre-fort
    à relier, un numéro et un organisme. Suppression douce, comme `references`. Migration 0029."""
    __tablename__ = "qualifications"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    famille = Column(String(24), nullable=False)       # qualification | rge | systeme_management | assurance
    intitule = Column(String(200), nullable=False)
    organisme = Column(String(120), nullable=True)     # organisme certificateur, ou assureur
    numero = Column(String(80), nullable=True)         # n° de certificat, ou n° de contrat
    perimetre = Column(String(500), nullable=True)     # codes de qualification, ou activités garanties
    date_obtention = Column(Date, nullable=True)
    date_fin = Column(Date, nullable=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)
