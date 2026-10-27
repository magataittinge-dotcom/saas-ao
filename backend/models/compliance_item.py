import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, JSON, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base

COMPLIANCE_STATUSES = ["couvert", "non_couvert", "partiel", "a_generer", "expire"]
COMPLIANCE_CATEGORIES = ["candidature", "offre", "technique", "planning", "criteres_notation"]

# Décision du 25/10 (export « 0/N ») : « couvert » signifie CONFIRMÉE PAR
# L'UTILISATEUR. Seul geste qui pose ce statut : routers/compliance.py
# (confirmer une exigence ou tout un groupe). Jamais posé tout seul, ni par
# l'analyse, ni par mots-clés (garde-fou : test_export_exigences_confirmees).
STATUT_CONFIRMEE = "couvert"
STATUT_A_CONFIRMER = "non_couvert"


class ComplianceItem(Base):
    __tablename__ = "compliance_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    exigence_text = Column(Text, nullable=False)
    source_document = Column(Text, nullable=True)
    source_page = Column(Integer, nullable=True)
    source_excerpt = Column(Text, nullable=True)
    # Ancrage de la source (bloc 2) : extrait d'origine de l'IA, niveau atteint
    # (exact | normalise | segment | recupere | aucun ; NULL = ligne antérieure)
    # et score (1.0 si le texte est retrouvé tel quel). Mesure en production.
    source_excerpt_ia = Column(Text, nullable=True)
    ancrage_niveau = Column(String(16), nullable=True)
    ancrage_score = Column(Float, nullable=True)
    # Ancre de la source DANS le PDF (sujet A, « Voir dans le DCE ») : page, rotation,
    # rectangles du passage (fractions), niveau passage|page, citation. Calculée à la fin
    # de l'analyse, ou au premier clic pour un ancien AO (services/pdf_ancre.py).
    # NULL = pas encore calculée / pièce sans PDF lisible : repli sur la page citée.
    ancre = Column(JSON, nullable=True)
    # Mutualisation multi-lots : '_commun' (RC/CCAP/AE, partagé) | 'lotN'
    # (spécifique) | NULL (lignes legacy = lot courant)
    lot = Column(Text, nullable=True, index=True)
    status = Column(
        SAEnum(*COMPLIANCE_STATUSES, name="compliance_status"),
        nullable=False,
        default="non_couvert",
    )
    category = Column(
        SAEnum(*COMPLIANCE_CATEGORIES, name="compliance_category"),
        nullable=False,
        default="offre",
    )
    priority = Column(
        SAEnum("obligatoire", "souhaitée", name="compliance_priority"),
        nullable=False,
        default="obligatoire",
    )
    suggestion_ia = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="compliance_items")
