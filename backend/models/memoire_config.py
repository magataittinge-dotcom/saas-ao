import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, UniqueConstraint
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

    # Migration 0029 — informations demandées par les pièces et critères courants (listes typées en JSON).
    metiers = Column(JSON, nullable=True)                     # codes de services/veille/metiers.py
    departements_intervention = Column(JSON, nullable=True)   # codes de départements
    effectifs_par_categorie = Column(JSON, nullable=True)     # [{categorie, specialite, effectif}] — des nombres, jamais de nom
    habilitations = Column(JSON, nullable=True)               # [{type, libelle, nombre, valide_jusqu}] — par type, pas par personne
    materiel_liste = Column(JSON, nullable=True)              # [{quantite, designation, unite, famille}]
    vehicules_liste = Column(JSON, nullable=True)
    sous_traitance_partenaires = Column(String, nullable=True)
    sous_traitance_part_pct = Column(Integer, nullable=True)
    sav_garantie = Column(String, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
