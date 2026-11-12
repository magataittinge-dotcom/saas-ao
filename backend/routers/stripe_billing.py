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
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from config import PRODUITS_STRIPE_MODE_TEST, cle_stripe_de_production, get_settings
from models.user import User
from models.organization import Organization
from routers.auth import get_auth_user
from services.billing import BillingError, get_billing_provider
from services.raison_sociale import raison_sociale_de

logger = logging.getLogger(__name__)
router = APIRouter()
from services.rate_limit import limiter  # S1.2 — limiter partagé (org-keyed)
settings = get_settings()

def produits_stripe(s) -> dict[str, str]:
    """Offre → produit Stripe, lus dans l'environnement (STRIPE_PRODUCT_ESSENTIEL, _PRO, _BUSINESS).

    Vide = offre pas encore payable (503 explicite au paiement), sauf Pro et Business avec une clé de test :
    produits du mode test du compte de développement. Jamais ceux-ci avec une clé de production.
    """
    repli = {} if cle_stripe_de_production(s.STRIPE_SECRET_KEY) else PRODUITS_STRIPE_MODE_TEST
    produits = {
        "essentiel": s.STRIPE_PRODUCT_ESSENTIEL,
        "pro": s.STRIPE_PRODUCT_PRO or repli.get("pro", ""),
        "business": s.STRIPE_PRODUCT_BUSINESS or repli.get("business", ""),
    }
    return {offre: produit for offre, produit in produits.items() if produit}


PRODUCTS = produits_stripe(settings)

OFFRES_PAYANTES = ("essentiel", "pro", "business")

# Abonnement qui ouvre une offre au retour du paiement (verify-session) : payé ou à l'essai. `past_due`, `incomplete`,
# `unpaid`, `canceled`… : rien n'est rendu (le webhook tient l'offre d'un abonnement déjà appliqué).
STATUTS_OFFRE_OUVERTE = ("active", "trialing")


def offre_de_l_abonnement(sub: dict) -> str | None:
    """L'offre (essentiel, pro, business) du produit du prix de la première ligne de l'abonnement ; None si inconnu."""
    items = sub.get("items") if isinstance(sub.get("items"), dict) else {}
    lignes = (items or {}).get("data") or []
    if not lignes or not isinstance(lignes[0], dict):
        return None
    product_id = (lignes[0].get("price") or {}).get("product")
    if isinstance(product_id, dict):                       # prix « expand » : le produit est un objet
        product_id = product_id.get("id")
    return next((offre for offre, pid in PRODUCTS.items() if product_id and pid == product_id), None)


def _fin_qui_concerne_l_organisation(org: Organization, sub_id: str | None) -> bool:
    """`customer.subscription.deleted` : vrai si l'abonnement terminé est celui de l'organisation (ou si elle n'en connaît
    aucun), ou s'il ne lui reste plus aucun abonnement payé vivant chez le fournisseur. Fournisseur injoignable : faux
    (rien ne change ; l'événement de l'abonnement de l'organisation, lui, agira)."""
    if not org.stripe_subscription_id or sub_id == org.stripe_subscription_id:
        return True
    from services import resiliation_compte
    try:
        return not resiliation_compte.abonnement_payant_vivant(org)
    except Exception as exc:
        logger.warning("Fin d'abonnement : fournisseur injoignable (org=%s, %s)", org.id, type(exc).__name__)
        return False


def _abonnement_lu(billing, sub_id: str) -> dict | None:
    """L'abonnement chez le fournisseur ; None s'il est illisible (rien n'est alors appliqué : le webhook rattrapera)."""
    try:
        sub = billing.retrieve_subscription(sub_id)
    except BillingError:
        return None
    return sub if isinstance(sub, dict) else None


def _offre_ouverte_du_client(org: Organization, sub: dict, client_annonce: str | None) -> str | None:
    """L'offre d'un abonnement relu chez le fournisseur, s'il vit (`active`, `trialing`) et appartient au client annoncé
    (session, événement) comme à celui de l'organisation ; None sinon. L'offre se lit dans le prix, jamais ailleurs."""
    if not isinstance(sub, dict) or sub.get("status") not in STATUTS_OFFRE_OUVERTE:
        return None
    client_sub = sub.get("customer") or client_annonce
    if (client_annonce and client_sub != client_annonce) or (
            org.stripe_customer_id and client_sub and client_sub != org.stripe_customer_id):
        return None
    return offre_de_l_abonnement(sub)


def _abonnement_connu_vit(billing, sub_id: str) -> bool:
    """L'abonnement que l'organisation connaît vit-il encore (payé, à l'essai, impayé en cours) ? Illisible : oui (on ne
    le remplace pas sur un doute)."""
    from services.resiliation_compte import STATUTS_PAYANTS_VIVANTS
    try:
        sub = billing.retrieve_subscription(sub_id)
    except Exception:
        return True
    return isinstance(sub, dict) and sub.get("status") in STATUTS_PAYANTS_VIVANTS


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
        # Client de facturation : la raison sociale si elle est connue, sinon le titulaire du compte (le payeur,
        # pas une raison sociale affichée ailleurs).
        name=raison_sociale_de(org) or user.name,
        metadata={"organization_id": org.id, "user_id": user.id},
    )


# ── Schemas ───────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str  # "essentiel", "pro" ou "business"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create-checkout-session")
def create_checkout_session(
    payload: CheckoutRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    if payload.plan not in OFFRES_PAYANTES:
        raise HTTPException(status_code=400, detail="Offre inconnue. Choisissez Essentiel, Pro ou Business.")
    if payload.plan not in PRODUCTS:
        raise HTTPException(
            status_code=503,
            detail="Cette offre n'est pas encore ouverte au paiement en ligne. Écrivez-nous pour y souscrire.",
        )

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # Une org déjà abonnée ne repasse pas par un checkout (double
    # souscription Stripe = double facturation) : elle gère son plan via le
    # portail. Changement de plan = portail, pas nouvelle session.
    if (org.plan or "free") in OFFRES_PAYANTES:
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
        raise HTTPException(status_code=502, detail="Le service de paiement n’a pas répondu. Réessayez dans un instant.") from exc

    if customer_id != org.stripe_customer_id:
        org.stripe_customer_id = customer_id
        db.commit()

    # Resolve the price_id from the product
    try:
        price_id = billing.get_default_price_for_product(PRODUCTS[payload.plan])
    except BillingError as exc:
        logger.error("Pricing error for plan %s: %s", payload.plan, exc)
        raise HTTPException(status_code=500, detail="Tarif indisponible pour ce plan") from exc

    # Retour sur la page elle-même : /billing redirige vers /settings/billing SANS la requête (App.tsx), la page ne
    # voyait plus « session_id » et n'appelait pas /stripe/verify-session (recette finale, paiement en mode test).
    try:
        url = billing.create_checkout_session(
            customer_id=customer_id,
            price_id=price_id,
            success_url=f"{settings.FRONTEND_URL}/settings/billing?success=true&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/settings/billing?canceled=true",
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
            return_url=f"{settings.FRONTEND_URL}/settings/billing",
        )
    except BillingError as exc:
        logger.error("Portal session error: %s", exc)
        raise HTTPException(status_code=502, detail="Erreur d'ouverture du portail") from exc
    return {"url": url}


@router.get("/verify-session")
@limiter.limit("20/minute")
def verify_session(
    request: Request,
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

    # 🔒 Ownership : la session DOIT être liée à l'org du JWT. Sans ce contrôle,
    # un session_id payé d'une autre org (fuite via success_url ?session_id=…)
    # upgradait l'org appelante sans paiement. La liaison est posée à la création
    # du checkout (metadata.organization_id + client_reference_id = org.id).
    metadata = session.get("metadata") or {}
    session_org = metadata.get("organization_id") or session.get("client_reference_id")
    if session_org != user.organization_id:
        logger.warning(
            "verify-session refusée : session %s liée à org=%r, appelant org=%r",
            session_id, session_org, user.organization_id,
        )
        raise HTTPException(
            status_code=403,
            detail="Cette session de paiement n'appartient pas à votre organisation.",
        )

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # P0-1 (relecture du 12/11) — une session reste « paid » à vie chez Stripe : rejouée après la fin de l'abonnement
    # (portail, impayé) ou après une baisse d'offre, elle rendait l'offre de ses métadonnées sans paiement. L'offre
    # n'est donc appliquée que si l'abonnement de la session vit (`active`, `trialing`), appartient au client de
    # l'organisation, et elle se lit dans le PRIX de cet abonnement, jamais dans les métadonnées de la session.
    sub_id = session.get("subscription")
    sub = _abonnement_lu(billing, sub_id) if sub_id else None
    if not sub or sub.get("status") not in STATUTS_OFFRE_OUVERTE:
        return {"plan": "free", "updated": False}
    client_session = session.get("customer")
    client_sub = sub.get("customer") or client_session
    if (client_session and client_sub != client_session) or (
            org.stripe_customer_id and client_sub and client_sub != org.stripe_customer_id):
        logger.warning("verify-session refusée : abonnement d'un autre client (org=%s)", org.id)
        return {"plan": "free", "updated": False}
    plan = offre_de_l_abonnement(sub)
    if not plan:
        return {"plan": "free", "updated": False}

    # Session déjà appliquée (webhook arrivé d'abord, retour rechargé) : rien n'est écrit une seconde fois (pas de
    # fenêtre de quotas neuve) ; l'écran reçoit l'offre en cours. Un AUTRE abonnement déjà connu n'est jamais remplacé
    # par une vieille session : les changements d'offre passent par le portail (webhook `updated`).
    if org.stripe_subscription_id == sub_id:
        return {"plan": org.plan, "updated": (org.plan or "free") != "free"}
    if org.stripe_subscription_id:
        return {"plan": org.plan or "free", "updated": False}

    org.plan = plan
    if client_sub:
        org.stripe_customer_id = client_sub
    org.stripe_subscription_id = sub_id
    # Ancre du reset mensuel des quotas (C1) : date de souscription.
    if org.subscription_started_at is None:
        org.subscription_started_at = datetime.utcnow()
    db.commit()

    return {"plan": plan, "updated": True}


async def _corps_brut(request: Request) -> bytes:
    """Le corps exact de la requête (la signature de Stripe porte sur ces octets), lu sur la boucle d'événements."""
    return await request.body()


@router.post("/webhook")
@limiter.limit("100/minute")
def stripe_webhook(request: Request, payload: bytes = Depends(_corps_brut), db: Session = Depends(get_db)):
    # P2-1 (relecture du 12/11) — `def`, pas `async def` : FastAPI sert la route dans un fil. Les appels bloquants
    # qu'elle fait (Stripe : jusqu'à 80 s de délai par défaut, base, effacement des fichiers, Clerk : 10 s par
    # utilisateur) ne gèlent plus la boucle d'événements de l'unique processus de l'API.
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
        raise HTTPException(status_code=500, detail="Configuration du webhook à renseigner")

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
    # PAIEMENT-2 (constat 1) — même règle que verify-session (P0-1) : Stripe réessaie un événement pendant trois jours ;
    # un réessai tardif, arrivé après la fin de l'abonnement ou après une baisse d'offre, rouvrait l'offre des
    # métadonnées. L'offre n'est appliquée que si l'abonnement de la session vit (`active`, `trialing`) et appartient
    # au client de l'organisation, et elle se lit dans le PRIX de l'abonnement relu. Session déjà appliquée : rien
    # n'est écrit (pas de fenêtre de quotas neuve). Un autre abonnement encore vivant n'est jamais remplacé.
    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata") or {}
        org_id = metadata.get("organization_id") or data_object.get("client_reference_id")
        subscription_id = data_object.get("subscription")
        org = db.query(Organization).filter(Organization.id == org_id).first() if org_id else None

        if org is not None and subscription_id and org.stripe_subscription_id != subscription_id:
            try:
                sub = billing.retrieve_subscription(subscription_id)
            except Exception as exc:
                # Pas de 2xx : Stripe réessaiera, et le client qui vient de payer aura son offre.
                logger.warning("checkout.session.completed : abonnement illisible (org=%s, %s)",
                               org.id, type(exc).__name__)
                raise HTTPException(status_code=503, detail="Fournisseur de paiement injoignable") from exc
            plan = _offre_ouverte_du_client(org, sub, data_object.get("customer"))
            if plan and not (org.stripe_subscription_id
                             and _abonnement_connu_vit(billing, org.stripe_subscription_id)):
                org.plan = plan
                org.stripe_customer_id = sub.get("customer") or data_object.get("customer") or org.stripe_customer_id
                org.stripe_subscription_id = subscription_id
                # Nouvel abonnement → nouvelle ancre de quotas (C1).
                org.subscription_started_at = datetime.utcnow()
                db.commit()

    # ── customer.subscription.deleted → downgrade to free ─────────────────────
    # D23 — si l'organisation a demandé la suppression de son compte, c'est l'échéance : tout est supprimé (si aucun
    # autre abonnement payant ne vit encore). Sans demande (impayé, portail) : jamais de suppression, offre gratuite.
    # Rejoué après la suppression : l'organisation n'existe plus, rien à faire (idempotent).
    elif event_type == "customer.subscription.deleted":
        customer_id = data_object.get("customer")
        if customer_id:
            org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
            # P1-1 (relecture du 12/11) — la fin d'un AUTRE abonnement (doublon S-13, ancien abonnement, événement livré
            # en retard) ne touche ni l'offre ni la demande D23, tant qu'un abonnement payé vit encore chez le fournisseur.
            if org and not _fin_qui_concerne_l_organisation(org, data_object.get("id")):
                logger.info("Fin d'un autre abonnement ignorée (org=%s)", org.id)
                return {"received": True}
            if org and org.suppression_prevue_le is not None:
                from services import resiliation_compte
                if resiliation_compte.supprimer_si_demande(db, org):
                    return {"received": True}
            if org:
                org.plan = "free"
                org.stripe_subscription_id = None
                org.subscription_started_at = None
                db.commit()

    # ── customer.subscription.updated → handle plan changes ───────────────────
    elif event_type == "customer.subscription.updated":
        customer_id = data_object.get("customer")
        org = (db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
               if customer_id else None)
        # D23 — abonnement remis en renouvellement depuis le portail : la demande de suppression tombe (sinon un arrêt
        # d'abonnement des mois plus tard supprimerait le compte). P1-2 (relecture du 12/11) : on ne croit pas le contenu
        # de l'événement (un événement plus ancien que la demande, réessayé par Stripe après une coupure, dit
        # `cancel_at_period_end: false` alors que l'abonnement s'arrête bien) : l'état est RELU chez le fournisseur.
        # Plus sûr que la date de l'événement (`created`, à la seconde, ordre de livraison non garanti) : l'état relu
        # est ce qui se passera à l'échéance. Vaut aussi pendant un impayé (`past_due`).
        if (org is not None and org.suppression_prevue_le is not None
                and data_object.get("cancel_at_period_end") is False):
            from services import resiliation_compte
            if resiliation_compte.abonnement_repris(org):
                org.suppression_prevue_le = None
                db.commit()
        # PAIEMENT-2 (constat 2) — on ne croit pas l'offre écrite dans l'événement (un événement ancien, réessayé, remettait
        # l'offre précédente) : l'abonnement est RELU chez le fournisseur, l'offre se lit dans son prix, seulement s'il
        # vit et appartient au client. N'agit que sur l'abonnement de l'organisation (ou, si elle n'en connaît aucun, sur
        # un abonnement vivant de son client) : l'événement d'un doublon ne remplace jamais l'abonnement enregistré.
        sub_id = data_object.get("id")
        if (org is not None and sub_id
                and (not org.stripe_subscription_id or org.stripe_subscription_id == sub_id)):
            try:
                sub = billing.retrieve_subscription(sub_id)
            except Exception as exc:
                logger.warning("subscription.updated : abonnement illisible (org=%s, %s)", org.id, type(exc).__name__)
                sub = None
            plan = _offre_ouverte_du_client(org, sub, customer_id) if sub is not None else None
        else:
            plan = None
        if org is not None and plan:
            old_plan = org.plan
            org.plan = plan
            org.stripe_subscription_id = sub_id
            # Changement de plan → nouvelle ancre de quotas : les
            # consommations de la période précédente (Business 70/mois)
            # ne bloquent pas le nouveau plan (downgrade business→pro
            # sinon = 402 immédiat). Même plan → ancre inchangée (pas de
            # fenêtre offerte à chaque événement Stripe).
            if org.plan != old_plan:
                org.subscription_started_at = datetime.utcnow()
            db.commit()

    return {"received": True}
