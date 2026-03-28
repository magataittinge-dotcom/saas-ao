import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Date, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base

DOCUMENT_TYPES = [
    "urssaf", "kbis", "decennale", "rc_civile", "qualibat",
    "pro_btp", "cibtp", "fiscal", "dc1", "dc2", "rib",
    "caces", "amiante_ss4", "declaration_honneur", "pouvoir",
    "organigramme_doc", "chiffre_affaires", "effectifs", "autre",
]

DOCUMENT_STATUSES = ["valid", "expiring_soon", "expired"]


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    type = Column(SAEnum(*DOCUMENT_TYPES, name="document_type"), nullable=False, default="autre")
    file_url = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    issued_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    status = Column(SAEnum(*DOCUMENT_STATUSES, name="document_status"), nullable=False, default="valid")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="documents")
    checklist_items = relationship("ChecklistItem", back_populates="linked_document")
