import logging
import stripe
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

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY

# ── Product IDs (Stripe test mode) ───────────────────────────────────────────
PRODUCTS = {
    "pro": "prod_UFuTbjsjJG2tlq",
    "business": "prod_UFuVeLpu3fDVQp",
}


def _get_price_for_product(product_id: str) -> str:
    """Fetch the default (first active recurring) price for a Stripe product."""
    prices = stripe.Price.list(product=product_id, active=True, type="recurring", limit=1)
    if not prices.data:
        raise HTTPException(status_code=500, detail=f"Aucun prix trouvé pour le produit {product_id}")
    return prices.data[0].id


def _get_or_create_customer(org: Organization, user: User) -> str:
    """Get or create a Stripe customer linked to the organization."""
    if org.stripe_customer_id:
        try:
            stripe.Customer.retrieve(org.stripe_customer_id)
            return org.stripe_customer_id
        except stripe.error.InvalidRequestError:
            pass

    customer = stripe.Customer.create(
        email=user.email,
        name=org.name,
        metadata={"organization_id": org.id, "user_id": user.id},
    )
    return customer.id


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

    # Get or create Stripe customer
    customer_id = _get_or_create_customer(org, user)
    if customer_id != org.stripe_customer_id:
        org.stripe_customer_id = customer_id
        db.commit()

    # Resolve the price_id from the product
    price_id = _get_price_for_product(PRODUCTS[payload.plan])

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.FRONTEND_URL}/billing?success=true&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/billing?canceled=true",
        client_reference_id=org.id,
        metadata={"organization_id": org.id, "plan": payload.plan},
    )

    return {"url": session.url}


@router.get("/portal")
def create_portal_session(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org or not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Aucun abonnement actif")

    session = stripe.billing_portal.Session.create(
        customer=org.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/billing",
    )
    return {"url": session.url}


@router.get("/verify-session")
def verify_session(
    session_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """
    Verify a Stripe Checkout session and update the org plan if paid.
    Used as a fallback when webhooks can't reach the server (local dev).
    """
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.InvalidRequestError:
        raise HTTPException(status_code=404, detail="Session Stripe introuvable")

    if session.payment_status != "paid":
        return {"plan": "free", "updated": False}

    # Determine plan from session metadata or by matching product
    plan = session.metadata.get("plan") if session.metadata else None

    if not plan and session.subscription:
        try:
            sub = stripe.Subscription.retrieve(session.subscription)
            if sub.get("items") and sub["items"]["data"]:
                product_id = sub["items"]["data"][0]["price"]["product"]
                for plan_name, pid in PRODUCTS.items():
                    if pid == product_id:
                        plan = plan_name
                        break
        except Exception:
            pass

    if not plan:
        return {"plan": "free", "updated": False}

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # Update org
    org.plan = plan
    if session.customer:
        org.stripe_customer_id = session.customer
    if session.subscription:
        org.stripe_subscription_id = session.subscription
    db.commit()

    return {"plan": plan, "updated": True}


@router.post("/webhook")
@limiter.limit("100/minute")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if settings.STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            logger.warning(f"Webhook signature invalide depuis {request.client.host}")
            raise HTTPException(status_code=400, detail="Signature webhook invalide")
    elif settings.DEBUG:
        # Dev mode only — parse without signature verification
        import json
        logger.warning("Webhook sans vérification de signature (mode DEBUG)")
        event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
    else:
        # Prod without webhook secret → reject
        logger.error("STRIPE_WEBHOOK_SECRET non configuré en production")
        raise HTTPException(status_code=500, detail="Configuration webhook manquante")

    event_type = event["type"]

    # ── checkout.session.completed → upgrade plan ─────────────────────────────
    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        org_id = session.get("metadata", {}).get("organization_id")
        plan = session.get("metadata", {}).get("plan")
        customer_id = session.get("customer")
        subscription_id = session.get("subscription")

        if org_id and plan:
            org = db.query(Organization).filter(Organization.id == org_id).first()
            if org:
                org.plan = plan
                if customer_id:
                    org.stripe_customer_id = customer_id
                if subscription_id:
                    org.stripe_subscription_id = subscription_id
                db.commit()

    # ── customer.subscription.deleted → downgrade to free ─────────────────────
    elif event_type == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        customer_id = subscription.get("customer")
        if customer_id:
            org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
            if org:
                org.plan = "free"
                org.stripe_subscription_id = None
                db.commit()

    # ── customer.subscription.updated → handle plan changes ───────────────────
    elif event_type == "customer.subscription.updated":
        subscription = event["data"]["object"]
        customer_id = subscription.get("customer")
        if customer_id and subscription.get("status") == "active":
            org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
            if org:
                # Determine plan from the product
                items = subscription.get("items", {}).get("data", [])
                if items:
                    product_id = items[0].get("price", {}).get("product")
                    for plan_name, pid in PRODUCTS.items():
                        if pid == product_id:
                            org.plan = plan_name
                            break
                org.stripe_subscription_id = subscription.get("id")
                db.commit()

    return {"received": True}
