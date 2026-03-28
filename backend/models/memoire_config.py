import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, UniqueConstraint
from database import Base


class MemoireConfig(Base):
    __tablename__ = "memoire_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Section Entreprise
    nom_entreprise = Column(String(255), nullable=True)  # Override organization.name
    date_creation = Column(String(20), nullable=True)
    gerant_nom = Column(String(255), nullable=True)
    gerant_titre = Column(String(255), nullable=True)
    zone_intervention = Column(String(500), nullable=True)
    historique = Column(String, nullable=True)
    activites = Column(String, nullable=True)
    # [{"annee": "2023", "montant": "1 200 000"}, ...]
    chiffre_affaires = Column(JSON, nullable=True)

    # Section Équipe
    organigramme_description = Column(String, nullable=True)
    # [{"poste": "Directeur Travaux", "nom": "Jean Dupont", "role": "..."}]
    postes_cles = Column(JSON, nullable=True)

    # Section Moyens
    moyens_informatiques = Column(String, nullable=True)
    vehicules = Column(String, nullable=True)
    materiel = Column(String, nullable=True)

    # Section Méthodologie standard
    demarche_qualite = Column(String, nullable=True)
    procedure_demarrage = Column(String, nullable=True)
    gestion_securite = Column(String, nullable=True)
    traitement_dechets = Column(String, nullable=True)
    mesures_environnementales = Column(String, nullable=True)

    # Section Fournisseurs
    fournisseurs_principaux = Column(String, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
