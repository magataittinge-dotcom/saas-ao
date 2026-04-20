import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, String, Integer, Date, DateTime, Text, ForeignKey, Enum as SAEnum, JSON
from sqlalchemy.orm import relationship
from database import Base

PROJECT_DOC_TYPES = ["rc", "cctp", "ccap", "dpgf", "acte_engagement", "plan", "autre"]


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(500), nullable=False)
    status = Column(
        SAEnum("brouillon", "en_cours", "soumis", "gagné", "perdu", name="project_status"),
        nullable=False,
        default="brouillon",
    )
    deadline = Column(Date, nullable=True)
    maitre_ouvrage = Column(String(255), nullable=True)
    current_step = Column(Integer, default=1)
    completed_steps = Column(JSON, nullable=True, default=dict)  # {"1": true, "2": true, ...}
    criteres_jugement = Column(JSON, nullable=True)   # [{nom, poids, sous_criteres}]
    infos_marche = Column(JSON, nullable=True)         # {objet, maitre_ouvrage, ...}
    lots_detectes = Column(JSON, nullable=True)        # [{id, nom}] cached lot list
    selected_lot = Column(String(50), nullable=True)   # "lot1"
    selected_lot_name = Column(String(255), nullable=True)  # "Lot 1 — Gros œuvre"
    processing_status = Column(Text, nullable=True)   # uploading|extracting_text|detecting_lots|ready|error
    processing_progress = Column(Integer, default=0)
    processing_detail = Column(Text, nullable=True)   # "45/93 documents traités"
    dpgf_remplie_url = Column(String(500), nullable=True)       # file URL of filled DPGF
    dpgf_remplie_name = Column(String(255), nullable=True)      # original filename
    dpgf_remplie_check = Column(JSON, nullable=True)            # verification result JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="projects")
    documents = relationship("ProjectDocument", back_populates="project", cascade="all, delete-orphan")
    compliance_items = relationship("ComplianceItem", back_populates="project", cascade="all, delete-orphan")
    checklist_items = relationship("ChecklistItem", back_populates="project", cascade="all, delete-orphan")
    memoire = relationship("MemoireTechnique", back_populates="project", cascade="all, delete-orphan", uselist=False)


class ProjectDocument(Base):
    __tablename__ = "project_documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    type = Column(SAEnum(*PROJECT_DOC_TYPES, name="project_doc_type"), nullable=False, default="autre")
    file_url = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    extracted_text = Column(Text, nullable=True)
    file_size = Column(Integer, nullable=True)
    page_count = Column(Integer, nullable=True)
    pdf_preview_url = Column(String(500), nullable=True)  # URL du PDF converti pour prévisualisation
    related_lots = Column(JSON, nullable=True)             # ["all"] | ["info"] | ["5"] | ["5","13"]
    is_user_completed = Column(Boolean, nullable=False, default=False, server_default="false")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="documents")
