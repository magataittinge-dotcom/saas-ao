import uuid
from sqlalchemy import Column, String, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base

CHECKLIST_STATUSES = ["present", "manquant", "expire", "expiration_proche"]


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    document_type_required = Column(String(255), nullable=False)
    linked_document_id = Column(String, ForeignKey("documents.id"), nullable=True)
    status = Column(
        SAEnum(*CHECKLIST_STATUSES, name="checklist_status"),
        nullable=False,
        default="manquant",
    )
    details = Column(Text, nullable=True)
    source_in_rc = Column(String(500), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="checklist_items")
    linked_document = relationship("Document", back_populates="checklist_items")
