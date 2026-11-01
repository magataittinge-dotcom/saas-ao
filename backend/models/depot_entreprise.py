"""Dépôt de documents par rubrique de « Mon entreprise » (migration 0032).

Trois tables :
- `lectures_depot`      : une ligne par fichier déposé dans une case (état de la lecture, empreinte sha256) ;
- `propositions_profil` : ce que Synorix PROPOSE à partir d'un fichier — rien n'entre dans le profil avant validation ;
- `couts_ia`            : le coût réel de chaque appel au modèle (jetons, euros), par organisation et par usage.

Aucune proposition ne contient de nom de personne : seulement des nombres par rôle ou habilitation, et des données de
l'entreprise (CONCEPTION-memoire-entreprise.md § 6)."""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from database import Base

ETATS_LECTURE = ("en_lecture", "differee", "lu", "coffre_seul", "ocr_requis", "echec", "ecartee")
STATUTS_PROPOSITION = ("proposee", "validee", "ecartee")


class LectureDepot(Base):
    __tablename__ = "lectures_depot"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False, index=True)
    case_depot = Column(String(24), nullable=False)
    rubrique = Column(String(16), nullable=False)
    sha256 = Column(String(64), nullable=False, index=True)
    etat = Column(String(16), nullable=False, default="en_lecture")   # ETATS_LECTURE
    message = Column(String(300), nullable=True)                       # explication affichée sous la case
    nb_propositions = Column(Integer, nullable=False, default=0)
    pages_lues = Column(Integer, nullable=True)
    pages_total = Column(Integer, nullable=True)
    plafond_atteint = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    terminee_le = Column(DateTime, nullable=True)


class PropositionProfil(Base):
    __tablename__ = "propositions_profil"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    lecture_id = Column(String, ForeignKey("lectures_depot.id"), nullable=False, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    case_depot = Column(String(24), nullable=False)
    rubrique = Column(String(16), nullable=False, index=True)
    champ = Column(String(48), nullable=False)          # ex. organisation.forme_juridique, profil.materiel_liste, qualification
    libelle = Column(String(200), nullable=False)       # ce que le patron lit : « Forme juridique », « Matériel : 2 × nacelle »
    valeur = Column(Text, nullable=False)               # JSON : texte, nombre, ou objet validé par le schéma du champ
    affichage = Column(String(300), nullable=True)      # la valeur telle que le patron la lit : « 40 000 € », « 2 × nacelle »
    remplace = Column(Text, nullable=True)              # valeur actuelle du profil, si elle diffère : « À confirmer : remplace … »
    source_fichier = Column(String(255), nullable=False)
    source_page = Column(Integer, nullable=True)        # page du PDF
    source_lieu = Column(String(80), nullable=True)     # « Feuille Matériel », « page 3 »
    extrait = Column(String(200), nullable=True)        # extrait d'origine (masqué), 200 caractères au plus
    statut = Column(String(12), nullable=False, default="proposee", index=True)   # STATUTS_PROPOSITION
    created_at = Column(DateTime, default=datetime.utcnow)
    decidee_le = Column(DateTime, nullable=True)


class CoutIA(Base):
    __tablename__ = "couts_ia"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    usage = Column(String(40), nullable=False, index=True)      # depot_entreprise, structure_texte…
    modele = Column(String(60), nullable=False)
    jetons_entree = Column(Integer, nullable=False, default=0)
    jetons_sortie = Column(Integer, nullable=False, default=0)
    jetons_cache_lecture = Column(Integer, nullable=False, default=0)
    jetons_cache_ecriture = Column(Integer, nullable=False, default=0)
    cout_usd = Column(Float, nullable=False, default=0.0)
    cout_eur = Column(Float, nullable=False, default=0.0)
    reference = Column(String, nullable=True)                   # identifiant de la lecture
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
