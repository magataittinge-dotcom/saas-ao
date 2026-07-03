"""Billing provider-agnostique (C17) — statut des quotas.

Les opérations Stripe (checkout, portal, webhook) vivent dans
routers/stripe_billing.py ; ici uniquement ce qui ne dépend d'aucun provider.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.organization import Organization
from models.user import User
from routers.auth import get_auth_user
from services import quota

router = APIRouter()


@router.get("/quota")
def get_quota(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Compteurs du mois courant (jauge sidebar + page Facturation)."""
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    return quota.get_quota_status(db, org)
