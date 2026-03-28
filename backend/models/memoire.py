import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class MemoireTechnique(Base):
    __tablename__ = "memoires_techniques"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, unique=True)
    content_json = Column(JSON, nullable=False)
    version = Column(Integer, default=1)
    generated_at = Column(DateTime, default=datetime.utcnow)
    variables = Column(JSON, nullable=True)  # nb_ouvriers, delai, interlocuteur_id, particularites
    is_reference_template = Column(Boolean, default=False)
    docx_export_url = Column(String(500), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="memoire")
