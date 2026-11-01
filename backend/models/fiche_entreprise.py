import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, UniqueConstraint
from database import Base


class FicheEntreprise(Base):
    """Bordereau d'une fiche « Mon entreprise » à télécharger (PDF ou Word).

    Une ligne par entreprise et par rubrique (identité, moyens, certifications) : titre, sous-titre,
    contact, couleur d'accent, lignes libres et logo propres à la fiche. Les données de la fiche
    (effectifs, matériel, références…) ne sont JAMAIS copiées ici : elles sont relues à chaque
    aperçu et à chaque génération. Un champ vide (NULL) = la valeur par défaut de la rubrique."""
    __tablename__ = "fiches_entreprise"
    __table_args__ = (
        UniqueConstraint("organization_id", "rubrique", name="uq_fiches_entreprise_org_rubrique"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(
        String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    rubrique = Column(String(24), nullable=False)
    titre = Column(String(120), nullable=True)
    sous_titre = Column(String(200), nullable=True)
    contact = Column(String(200), nullable=True)
    couleur = Column(String(7), nullable=True)        # « #RRGGBB » validé
    # [{"section": "01", "libelle": "…", "valeur": "…"}], validé par schemas/fiches_entreprise.py
    lignes_libres = Column(JSON, nullable=True)
    # Chemin relatif sous uploads/ du logo réencodé (WebP), nom aléatoire, hors webroot.
    logo_path = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
