import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class MemoireTemplate(Base):
    __tablename__ = "memoire_templates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    corps_metier = Column(String(255), nullable=False)  # facade, ite, carrelage, peinture...
    content_json = Column(JSON, nullable=False)
    is_default = Column(Boolean, default=False)
    created_from_project_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="memoire_templates")
