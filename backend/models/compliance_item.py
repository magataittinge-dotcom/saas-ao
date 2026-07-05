import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base

COMPLIANCE_STATUSES = ["couvert", "non_couvert", "partiel", "a_generer", "expire"]
COMPLIANCE_CATEGORIES = ["candidature", "offre", "technique", "planning", "criteres_notation"]


class ComplianceItem(Base):
    __tablename__ = "compliance_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    exigence_text = Column(Text, nullable=False)
    source_document = Column(Text, nullable=True)
    source_page = Column(Integer, nullable=True)
    source_excerpt = Column(Text, nullable=True)
    # Mutualisation multi-lots : '_commun' (RC/CCAP/AE, partagé) | 'lotN'
    # (spécifique) | NULL (lignes legacy = lot courant)
    lot = Column(Text, nullable=True, index=True)
    status = Column(
        SAEnum(*COMPLIANCE_STATUSES, name="compliance_status"),
        nullable=False,
        default="non_couvert",
    )
    category = Column(
        SAEnum(*COMPLIANCE_CATEGORIES, name="compliance_category"),
        nullable=False,
        default="offre",
    )
    priority = Column(
        SAEnum("obligatoire", "souhaitée", name="compliance_priority"),
        nullable=False,
        default="obligatoire",
    )
    suggestion_ia = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="compliance_items")
