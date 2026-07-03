import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, String, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    siret = Column(String(14), nullable=True, unique=True)
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
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    # Pluggable provider — today always 'stripe'. Tomorrow could be a
    # different Stripe account (UAE) or another provider entirely.
    billing_provider = Column(
        String(32), nullable=False, default="stripe", server_default="stripe", index=True,
    )
    # ISO country code of the billing entity for this org. Defaults to the
    # COUNTRY_CODE env var at row creation time so a future provider migration
    # can target a specific cohort by country.
    billing_country = Column(
        String(2), nullable=False, default="FR", server_default="FR",
    )
    # Ancre du reset mensuel des quotas (C1) : date de souscription au plan
    # payant. NULL tant que l'org est en free — fallback sur created_at.
    subscription_started_at = Column(DateTime, nullable=True)

    # Vérification Sirene (C2). trial_granted passe à False si le SIRET a déjà
    # servi à un essai gratuit (1 SIRET = 1 essai — le compte, lui, vit).
    siret_verified = Column(Boolean, nullable=False, default=False, server_default="0")
    trial_granted = Column(Boolean, nullable=False, default=True, server_default="1")
    naf_code = Column(String(10), nullable=True)
    effectif_tranche = Column(String(80), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="organization", cascade="all, delete-orphan")
    team_members = relationship("TeamMember", back_populates="organization", cascade="all, delete-orphan")
    references = relationship("Reference", back_populates="organization", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")
    memoire_templates = relationship("MemoireTemplate", back_populates="organization", cascade="all, delete-orphan")
