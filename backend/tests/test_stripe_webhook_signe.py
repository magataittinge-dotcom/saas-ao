"""Recette finale, parcours 1 : le webhook de Stripe rejoué en local sans la CLI (non installée sur le banc) — une
requête SIGNÉE fabriquée ici (en-tête « Stripe-Signature » t=…,v1=HMAC-SHA256), vérifiée par le vrai
StripeProvider (stripe.Webhook.construct_event). Une résiliation arrivée par le portail remet l'offre gratuite ; une
signature fausse est refusée sans rien changer. Secret et identifiants inventés."""
import hashlib
import hmac
import json
import time

import stripe

import routers.stripe_billing as sb
from models.organization import Organization
from services.billing.stripe_provider import StripeProvider

SECRET = "whsec_essai_invente"


def _signer(corps: bytes, secret: str = SECRET) -> str:
    t = int(time.time())
    v1 = hmac.new(secret.encode(), f"{t}.".encode() + corps, hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def _preparer(db, org, monkeypatch):
    monkeypatch.setattr(stripe, "api_key", stripe.api_key)          # rendu tel quel après le test
    fournisseur = StripeProvider("sk_test_invente", SECRET)
    # PAIEMENT-2 (12/11, constat 3) : à la fin de son abonnement, le webhook demande au fournisseur si un autre
    # abonnement du client vit encore. Après une résiliation, aucun ; la réponse est donnée ici, jamais par Stripe.
    monkeypatch.setattr(fournisseur, "list_subscriptions", lambda customer_id: [])
    monkeypatch.setattr(sb, "get_billing_provider", lambda: fournisseur)
    monkeypatch.setattr(sb.settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    o = db.get(Organization, org.id)
    o.plan, o.stripe_customer_id, o.stripe_subscription_id = "pro", "cus_invente", "sub_invente"
    db.commit()


def _evenement() -> bytes:
    return json.dumps({"id": "evt_invente", "object": "event", "type": "customer.subscription.deleted",
                       "data": {"object": {"id": "sub_invente", "object": "subscription",
                                           "customer": "cus_invente", "status": "canceled"}}}).encode()


def test_webhook_signe_resiliation_remet_l_offre_gratuite(client, db_session, test_org, monkeypatch):
    _preparer(db_session, test_org, monkeypatch)
    corps = _evenement()
    r = client.post("/api/stripe/webhook", content=corps,
                    headers={"stripe-signature": _signer(corps), "content-type": "application/json"})
    assert r.status_code == 200, r.text
    db_session.expire_all()
    o = db_session.get(Organization, test_org.id)
    assert o.plan == "free" and o.stripe_subscription_id is None


def test_webhook_signature_fausse_refusee_rien_ne_change(client, db_session, test_org, monkeypatch):
    _preparer(db_session, test_org, monkeypatch)
    corps = _evenement()
    r = client.post("/api/stripe/webhook", content=corps,
                    headers={"stripe-signature": _signer(corps, "whsec_autre"), "content-type": "application/json"})
    assert r.status_code == 400
    db_session.expire_all()
    assert db_session.get(Organization, test_org.id).plan == "pro"
