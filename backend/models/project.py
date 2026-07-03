import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, String, Integer, Date, DateTime, Text,
    ForeignKey, CheckConstraint, Enum as SAEnum, JSON,
)
from sqlalchemy.orm import relationship
from database import Base

# Templates fournis vierges dans le DCE — l'utilisateur doit les compléter.
DCE_TEMPLATE_TYPES = [
    "dc1_template",
    "dc2_template",
    "acte_engagement_template",
    "dpgf_template",
    "bpu_template",
    "dqe_template",
    "cadre_reponse",
    "attestation_visite_template",
]

# Documents de référence du DCE — fournis par l'acheteur, jamais re-exportés.
DCE_REFERENCE_TYPES = [
    "rc", "cctp", "ccap", "plan",
    "diagnostic",   # DAT, CREP, G2PRO, contrôles techniques (APAVE, SOCOTEC…)
    "notice",       # notices accessibilité / sécurité / acoustique / PC / EP
    "dt",           # DT concessionnaires (ENEDIS, GRDF, ORANGE, SIEM, CUGR…)
    "pgc_sps",      # Plan Général de Coordination SPS
    "planning",     # planning prévisionnel / travaux / DCE / chantier
    "autre",
]

PROJECT_DOC_TYPES = DCE_REFERENCE_TYPES + DCE_TEMPLATE_TYPES


# Pipeline of project.status values. Two distinct semantics share this column:
#   - business outcomes: "soumis", "gagné", "perdu" (set explicitly by the user)
#   - workflow markers: "brouillon" (initial), "en_cours" (analysis launched),
#     "analyzed" (compliance items extracted, ready for candidature)
# The frontend maps each value to a label/colour in STATUS_MAP.
class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(500), nullable=False)
    status = Column(
        SAEnum(
            "brouillon", "en_cours", "analyzed", "soumis", "gagné", "perdu",
            name="project_status",
        ),
        nullable=False,
        default="brouillon",
        index=True,
    )
    deadline = Column(Date, nullable=True)
    maitre_ouvrage = Column(String(255), nullable=True)
    current_step = Column(Integer, default=1)
    completed_steps = Column(JSON, nullable=True, default=dict)  # {"1": true, "2": true, ...}
    criteres_jugement = Column(JSON, nullable=True)   # [{nom, poids, sous_criteres}]
    infos_marche = Column(JSON, nullable=True)         # {objet, maitre_ouvrage, ...}
    lots_detectes = Column(JSON, nullable=True)        # [{id, nom, confidence, sources, ...}] cached lot list
    lots_announced = Column(Integer, nullable=True)    # nb de lots annoncé dans le RC (C3)
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
    deleted_at = Column(DateTime, nullable=True, index=True)  # soft-delete

    # Relationships
    organization = relationship("Organization", back_populates="projects")
    documents = relationship("ProjectDocument", back_populates="project", cascade="all, delete-orphan")
    compliance_items = relationship("ComplianceItem", back_populates="project", cascade="all, delete-orphan")
    checklist_items = relationship("ChecklistItem", back_populates="project", cascade="all, delete-orphan")
    memoire = relationship("MemoireTechnique", back_populates="project", cascade="all, delete-orphan", uselist=False)


class ProjectDocument(Base):
    __tablename__ = "project_documents"
    __table_args__ = (
        CheckConstraint(
            "type IN ('" + "', '".join(PROJECT_DOC_TYPES) + "')",
            name="project_documents_type_check",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    type = Column(String(64), nullable=False, default="autre", index=True)
    file_url = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    extracted_text = Column(Text, nullable=True)
    file_size = Column(Integer, nullable=True)
    page_count = Column(Integer, nullable=True)
    pdf_preview_url = Column(String(500), nullable=True)  # URL du PDF converti pour prévisualisation
    related_lots = Column(JSON, nullable=True)             # ["all"] | ["info"] | ["5"] | ["5","13"]
    is_user_completed = Column(Boolean, nullable=False, default=False, server_default="false")
    # C16 — coffre-fort progressif : l'utilisateur a refusé (ou déjà accepté)
    # l'enregistrement de CE document au coffre → plus jamais re-proposé.
    vault_prompt_dismissed = Column(Boolean, nullable=False, default=False, server_default="false")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="documents")
