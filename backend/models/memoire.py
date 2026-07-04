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
    # C9a — overrides de profil LOCAUX à ce mémoire (ARCH §3.7) : modifiés au
    # pre-flight, ils ne touchent pas le profil org sauf « mettre à jour mon profil ».
    profile_overrides = Column(JSON, nullable=True)
    is_reference_template = Column(Boolean, default=False)
    docx_export_url = Column(String(500), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="memoire")
