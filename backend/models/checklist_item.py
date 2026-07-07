import uuid
from sqlalchemy import (
    Boolean, Column, Integer, String, Text, ForeignKey,
    CheckConstraint, Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from database import Base

# "warning" (C10) = pièce présente mais problème : doc du coffre expiré,
# non vérifié (unverified) ou non classé — distinct de présent/manquant.
CHECKLIST_STATUSES = ["present", "manquant", "expire", "expiration_proche", "warning", "non_applicable"]

# Origine de la pièce attendue pour cet item de checklist :
#  - "vault"        → l'entreprise doit la fournir depuis son coffre-fort
#  - "dce_template" → l'utilisateur doit compléter un template fourni dans le DCE
CHECKLIST_SOURCE_KINDS = ["vault", "dce_template"]


class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    __table_args__ = (
        CheckConstraint(
            "source_kind IN ('" + "', '".join(CHECKLIST_SOURCE_KINDS) + "')",
            name="checklist_items_source_kind_check",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    document_type_required = Column(String(255), nullable=False)
    source_kind = Column(String(20), nullable=False, default="vault", server_default="vault")
    linked_document_id = Column(String, ForeignKey("documents.id"), nullable=True, index=True)
    template_project_doc_id = Column(String, ForeignKey("project_documents.id"), nullable=True, index=True)
    completed_project_doc_id = Column(String, ForeignKey("project_documents.id"), nullable=True, index=True)
    status = Column(
        SAEnum(*CHECKLIST_STATUSES, name="checklist_status"),
        nullable=False,
        default="manquant",
    )
    details = Column(Text, nullable=True)
    source_in_rc = Column(String(500), nullable=True)
    # C12 — confirmation explicite « Je confirme avoir signé » (AE, DC1, DC2).
    # Sans confirmation, la pièce ne compte pas conforme dans le score.
    signature_confirmed = Column(Boolean, nullable=False, default=False, server_default="false")
    # C13b — position de l'exigence dans le RC (ordre de l'analyse) :
    # la numérotation des pièces du ZIP d'export suit cet ordre.
    rc_position = Column(Integer, nullable=True)
    # Pièce commune (NULL) ou spécifique d'un lot ('lotN') — multi-lots
    lot = Column(Text, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="checklist_items")
    linked_document = relationship("Document", back_populates="checklist_items")
    template_project_doc = relationship(
        "ProjectDocument", foreign_keys=[template_project_doc_id]
    )
    completed_project_doc = relationship(
        "ProjectDocument", foreign_keys=[completed_project_doc_id]
    )
