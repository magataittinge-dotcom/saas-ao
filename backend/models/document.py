import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Date,
    CheckConstraint, Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from database import Base

DOCUMENT_TYPES = [
    # Pièces administratives
    "urssaf", "kbis", "fiscal", "pro_btp", "cibtp",
    "declaration_honneur", "pouvoir", "rib",
    # Assurances
    "decennale", "rc_civile", "trc", "dommages_ouvrage",
    # Qualifications / habilitations
    "qualibat", "rge", "caces", "amiante_ss4",
    # Capacités économiques / techniques
    "chiffre_affaires", "effectifs", "organigramme_doc",
    "attestation_travaux",
    # Alternative globale aux DC1/DC2
    "dume",
    # Fallback
    "autre",
]

DOCUMENT_STATUSES = ["valid", "expiring_soon", "expired"]


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "type IN ('" + "', '".join(DOCUMENT_TYPES) + "')",
            name="documents_type_check",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    type = Column(String(64), nullable=False, default="autre")
    file_url = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    issued_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(SAEnum(*DOCUMENT_STATUSES, name="document_status"), nullable=False, default="valid")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="documents")
    checklist_items = relationship("ChecklistItem", back_populates="linked_document")
