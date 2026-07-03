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

# « valid » = document reconnu ET daté — jamais « fichier reçu ».
#   unverified   → type reconnu mais date de validité inconnue (à saisir)
#   unclassified → type non reconnu (jamais de badge de validité)
DOCUMENT_STATUSES = ["valid", "expiring_soon", "expired", "unverified", "unclassified"]

VAULT_CATEGORIES = [
    "attestations_sociales_fiscales",  # URSSAF, fiscale, PRO BTP, CIBTP
    "documents_legaux",                # KBIS, RIB, pouvoirs...
    "assurances",                      # décennale, RC pro...
    "qualifications",                  # Qualibat/RGE, CACES, SS4
    "references_moyens",               # CA, effectifs, organigramme...
    "autres",                          # classé manuellement, hors cases ci-dessus
    "unclassified",                    # non reconnu — en attente de classement
]


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "type IN ('" + "', '".join(DOCUMENT_TYPES) + "')",
            name="documents_type_check",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    type = Column(String(64), nullable=False, default="autre", index=True)
    file_url = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    issued_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True, index=True)
    status = Column(SAEnum(*DOCUMENT_STATUSES, name="document_status"), nullable=False, default="unclassified")
    category = Column(
        String(40), nullable=False, default="unclassified", server_default="unclassified",
        index=True,
    )
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # soft-delete

    # Relationships
    organization = relationship("Organization", back_populates="documents")
    checklist_items = relationship("ChecklistItem", back_populates="linked_document")
