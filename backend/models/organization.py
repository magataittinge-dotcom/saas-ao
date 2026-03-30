import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    siret = Column(String(14), nullable=False, unique=True)
    address = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)

    # Company profile (used in mémoire technique)
    presentation = Column(Text, nullable=True)
    historique = Column(Text, nullable=True)
    activites = Column(Text, nullable=True)
    organigramme = Column(Text, nullable=True)
    moyens_informatiques = Column(Text, nullable=True)
    vehicules = Column(Text, nullable=True)
    materiel = Column(Text, nullable=True)
    fournisseurs = Column(Text, nullable=True)

    # Billing
    plan = Column(SAEnum("free", "pro", "business", name="plan_type"), nullable=False, default="free")
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="organization", cascade="all, delete-orphan")
    team_members = relationship("TeamMember", back_populates="organization", cascade="all, delete-orphan")
    references = relationship("Reference", back_populates="organization", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")
    memoire_templates = relationship("MemoireTemplate", back_populates="organization", cascade="all, delete-orphan")
