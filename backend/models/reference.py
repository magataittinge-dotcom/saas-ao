import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base


class Reference(Base):
    __tablename__ = "references"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    intitule = Column(String(500), nullable=False)
    adresse = Column(String(500), nullable=True)
    maitre_ouvrage = Column(String(255), nullable=True)
    maitre_oeuvre = Column(String(255), nullable=True)
    lot = Column(String(255), nullable=True)
    montant_ht = Column(Float, nullable=True)
    annee = Column(Integer, nullable=True)
    statut = Column(
        SAEnum("gagné", "perdu", "en_cours", name="reference_status"),
        nullable=False,
        default="en_cours",
    )
    is_reference = Column(Boolean, default=True)
    attestation_document_id = Column(String, ForeignKey("documents.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="references")
    attestation_document = relationship("Document", foreign_keys=[attestation_document_id])
