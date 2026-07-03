import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, String
from database import Base


class QuotaConsumption(Base):
    """Journal de consommation des quotas (C1) — 1 ligne = 1 unité.

    Unité produit : 1 analyse = 1 unité ; 1 mémoire (par lot) = 1 unité.
    Le décompte mensuel est un simple filtre sur la fenêtre courante ancrée
    sur la date d'abonnement — aucune remise à zéro à orchestrer, et le
    journal reste auditable (quel projet / quel lot a consommé quoi).
    """

    __tablename__ = "quota_consumptions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(
        String, ForeignKey("organizations.id"), nullable=False, index=True,
    )
    kind = Column(
        SAEnum("analysis", "memoire", name="quota_kind"), nullable=False,
    )
    project_id = Column(String, nullable=True)
    lot = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
