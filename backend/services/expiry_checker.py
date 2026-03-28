from datetime import date
from typing import Optional


def compute_status(expiry_date: Optional[date]) -> str:
    """Compute document status based on expiry date."""
    if expiry_date is None:
        return "valid"

    today = date.today()
    days_left = (expiry_date - today).days

    if days_left < 0:
        return "expired"
    elif days_left <= 30:
        return "expiring_soon"
    else:
        return "valid"


def refresh_organization_statuses(organization_id: str, db) -> None:
    """Refresh all document statuses for an organization (called daily by Celery)."""
    from models.document import Document

    docs = db.query(Document).filter(Document.organization_id == organization_id).all()
    for doc in docs:
        new_status = compute_status(doc.expiry_date)
        if new_status != doc.status:
            doc.status = new_status
    db.commit()
