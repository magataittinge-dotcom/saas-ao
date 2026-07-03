from datetime import date
from typing import Optional

from services.vault_classifier import EXPIRING_SOON_DAYS, compute_document_status


def compute_status(expiry_date: Optional[date]) -> str:
    """Statut d'après la seule date d'expiration.

    ⚠️ Sans date, le statut est "unverified" — JAMAIS "valid" (« valide »
    signifie reconnu ET daté, pas « fichier reçu »). Pour un statut complet
    tenant compte du type, utiliser vault_classifier.compute_document_status.
    """
    if expiry_date is None:
        return "unverified"

    days_left = (expiry_date - date.today()).days
    if days_left < 0:
        return "expired"
    elif days_left <= EXPIRING_SOON_DAYS:
        return "expiring_soon"
    else:
        return "valid"


def refresh_organization_statuses(organization_id: str, db) -> None:
    """Refresh all document statuses for an organization (called daily by Celery).

    États honnêtes : un document non reconnu reste "unclassified", un document
    sans date reste "unverified" — le job ne re-valide jamais tout seul."""
    from models.document import Document

    docs = db.query(Document).filter(Document.organization_id == organization_id).all()
    for doc in docs:
        new_status = compute_document_status(doc.type, doc.expiry_date)
        if new_status != doc.status:
            doc.status = new_status
    db.commit()
