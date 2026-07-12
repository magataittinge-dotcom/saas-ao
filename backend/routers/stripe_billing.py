"""Billing endpoints — Stripe today, but written against the
:class:`BillingProvider` abstraction so the same routes work the day we
swap to a UAE Stripe account or a different provider.

Only the webhook keeps a Stripe-specific concept (signature header), and
even there the verification is delegated to the provider.
"""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from config import get_settings
from models.user import User
from models.organization import Organization
from routers.auth import get_auth_user
from services.billing import BillingError, get_billing_provider

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
settings = get_settings()

# ── Product IDs (Stripe test mode) — provider-agnostic mapping in DB later ─
PRODUCTS = {
    "pro": "prod_UFuTbjsjJG2tlq",
    "business": "prod_UFuVeLpu3fDVQp",
}


def _get_or_create_customer(org: Organization, user: User) -> str:
    """Return the customer id, creating one on the active provider if needed."""
    billing = get_billing_provider()
    if org.stripe_customer_id:
        try:
            billing.get_customer(org.stripe_customer_id)
            return org.stripe_customer_id
        except BillingError:
            # The cached customer id no longer resolves — fall through and
            # create a fresh customer below.
            pass

    return billing.create_customer(
        email=user.email,
        name=org.name,
        metadata={"organization_id": org.id, "user_id": user.id},
    )


# ── Schemas ───────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str  # "pro" or "business"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create-checkout-session")
def create_checkout_session(
    payload: CheckoutRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    if payload.plan not in PRODUCTS:
        raise HTTPException(status_code=400, detail="Plan invalide. Choisissez 'pro' ou 'business'.")

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # Une org déjà abonnée ne repasse pas par un checkout (double
    # souscription Stripe = double facturation) : elle gère son plan via le
    # portail. Changement de plan = portail, pas nouvelle session.
    if (org.plan or "free") in ("pro", "business"):
        raise HTTPException(
            status_code=409,
            detail="Vous avez déjà un abonnement actif. Gérez-le depuis le portail de facturation.",
        )

    billing = get_billing_provider()

    # Get or create a billing-provider customer
    try:
        customer_id = _get_or_create_customer(org, user)
    except BillingError as exc:
        logger.error("Billing customer error for org %s: %s", org.id, exc)
        raise HTTPException(status_code=502, detail="Erreur du provider de facturation") from exc

    if customer_id != org.stripe_customer_id:
        org.stripe_customer_id = customer_id
        db.commit()

    # Resolve the price_id from the product
    try:
        price_id = billing.get_default_price_for_product(PRODUCTS[payload.plan])
    except BillingError as exc:
        logger.error("Pricing error for plan %s: %s", payload.plan, exc)
        raise HTTPException(status_code=500, detail="Tarif indisponible pour ce plan") from exc

    try:
        url = billing.create_checkout_session(
            customer_id=customer_id,
            price_id=price_id,
            success_url=f"{settings.FRONTEND_URL}/billing?success=true&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/billing?canceled=true",
            metadata={"organization_id": org.id, "plan": payload.plan},
            client_reference_id=org.id,
        )
    except BillingError as exc:
        logger.error("Checkout session error: %s", exc)
        raise HTTPException(status_code=502, detail="Erreur de création de la session") from exc

    return {"url": url}


@router.get("/portal")
def create_portal_session(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org or not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Aucun abonnement actif")

    try:
        url = get_billing_provider().create_portal_session(
            customer_id=org.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/billing",
        )
    except BillingError as exc:
        logger.error("Portal session error: %s", exc)
        raise HTTPException(status_code=502, detail="Erreur d'ouverture du portail") from exc
    return {"url": url}


@router.get("/verify-session")
def verify_session(
    session_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """
    Verify a checkout session and update the org plan if paid.
    Used as a fallback when webhooks can't reach the server (local dev).
    """
    billing = get_billing_provider()
    try:
        session = billing.retrieve_session(session_id)
    except BillingError:
        raise HTTPException(status_code=404, detail="Session introuvable")

    if session.get("payment_status") != "paid":
        return {"plan": "free", "updated": False}

    metadata = session.get("metadata") or {}
    plan = metadata.get("plan")

    if not plan and session.get("subscription"):
        try:
            sub = billing.retrieve_subscription(session["subscription"])
            items = sub.get("items", {}).get("data", []) if isinstance(sub.get("items"), dict) else []
            if items:
                product_id = items[0].get("price", {}).get("product")
                for plan_name, pid in PRODUCTS.items():
                    if pid == product_id:
                        plan = plan_name
                        break
        except BillingError:
            pass

    if not plan:
        return {"plan": "free", "updated": False}

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    org.plan = plan
    if session.get("customer"):
        org.stripe_customer_id = session["customer"]
    if session.get("subscription"):
        org.stripe_subscription_id = session["subscription"]
    # Ancre du reset mensuel des quotas (C1) : date de souscription.
    if org.subscription_started_at is None:
        org.subscription_started_at = datetime.utcnow()
    db.commit()

    return {"plan": plan, "updated": True}


@router.post("/webhook")
@limiter.limit("100/minute")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    billing = get_billing_provider()

    if settings.STRIPE_WEBHOOK_SECRET:
        try:
            event = billing.verify_webhook(payload, sig_header)
        except BillingError:
            client_host = request.client.host if request.client else "?"
            logger.warning(f"Webhook signature invalide depuis {client_host}")
            raise HTTPException(status_code=400, detail="Signature webhook invalide")
    elif settings.DEBUG:
        # Dev mode only — parse without signature verification
        logger.warning("Webhook sans vérification de signature (mode DEBUG)")
        try:
            # Provider's verify_webhook falls back to unsigned parsing when
            # the secret is empty (StripeProvider implements this contract).
            event = billing.verify_webhook(payload, sig_header)
        except BillingError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    else:
        # Prod without webhook secret → reject
        logger.error("STRIPE_WEBHOOK_SECRET non configuré en production")
        raise HTTPException(status_code=500, detail="Configuration webhook manquante")

    # The event from billing.verify_webhook is a plain dict.
    if not isinstance(event, dict):
        # Defensive — should not happen with StripeProvider implementation.
        try:
            event = json.loads(json.dumps(event, default=str))
        except Exception:
            raise HTTPException(status_code=500, detail="Webhook event illisible")

    event_type = event.get("type")
    data_object = (event.get("data") or {}).get("object") or {}

    # ── checkout.session.completed → upgrade plan ─────────────────────────────
    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata") or {}
        org_id = metadata.get("organization_id")
        plan = metadata.get("plan")
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")

        if org_id and plan:
            org = db.query(Organization).filter(Organization.id == org_id).first()
            if org:
                org.plan = plan
                if customer_id:
                    org.stripe_customer_id = customer_id
                if subscription_id:
                    org.stripe_subscription_id = subscription_id
                # Nouvel abonnement → nouvelle ancre de quotas (C1).
                org.subscription_started_at = datetime.utcnow()
                db.commit()

    # ── customer.subscription.deleted → downgrade to free ─────────────────────
    elif event_type == "customer.subscription.deleted":
        customer_id = data_object.get("customer")
        if customer_id:
            org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
            if org:
                org.plan = "free"
                org.stripe_subscription_id = None
                org.subscription_started_at = None
                db.commit()

    # ── customer.subscription.updated → handle plan changes ───────────────────
    elif event_type == "customer.subscription.updated":
        customer_id = data_object.get("customer")
        if customer_id and data_object.get("status") == "active":
            org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
            if org:
                old_plan = org.plan
                items = (data_object.get("items") or {}).get("data") or []
                if items:
                    product_id = (items[0].get("price") or {}).get("product")
                    for plan_name, pid in PRODUCTS.items():
                        if pid == product_id:
                            org.plan = plan_name
                            break
                org.stripe_subscription_id = data_object.get("id")
                # Changement de plan → nouvelle ancre de quotas : les
                # consommations de la période précédente (illimité business)
                # ne bloquent pas le nouveau plan (downgrade business→pro
                # sinon = 402 immédiat). Même plan → ancre inchangée (pas de
                # fenêtre offerte à chaque événement Stripe).
                if org.plan != old_plan:
                    org.subscription_started_at = datetime.utcnow()
                db.commit()

    return {"received": True}
