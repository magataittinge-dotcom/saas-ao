"""T2c — dette Stripe du cycle de vie abonnement.

- checkout refuse une org DÉJÀ abonnée (sinon double souscription Stripe).
- un changement de plan (ex. downgrade business→pro) RÉ-ANCRE la fenêtre
  quota : les consommations illimitées de la période business ne bloquent
  pas immédiatement le nouveau plan Pro (402 au premier lot).
"""
import json
from datetime import datetime

from models.organization import Organization


def test_checkout_refused_when_already_subscribed(client, db_session, test_org):
    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.commit()

    resp = client.post("/api/stripe/create-checkout-session", json={"plan": "business"})
    assert resp.status_code == 409, resp.text


def test_subscription_updated_reanchors_on_plan_change(client, db_session, test_org, monkeypatch):
    class _FakeBilling:
        def verify_webhook(self, payload, sig):
            return json.loads(payload)
    monkeypatch.setattr("routers.stripe_billing.get_billing_provider", lambda: _FakeBilling())

    org = db_session.get(Organization, test_org.id)
    org.plan = "business"
    org.stripe_customer_id = "cus_test123"
    org.subscription_started_at = datetime(2020, 1, 1)
    db_session.commit()

    body = {
        "type": "customer.subscription.updated",
        "data": {"object": {
            "id": "sub_test",
            "customer": "cus_test123",
            "status": "active",
            "items": {"data": [{"price": {"product": "prod_UFuTbjsjJG2tlq"}}]},  # pro
        }},
    }
    resp = client.post("/api/stripe/webhook", json=body)
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    org = db_session.get(Organization, test_org.id)
    assert org.plan == "pro", "le downgrade business→pro doit être appliqué"
    assert org.subscription_started_at > datetime(2020, 1, 1), \
        "un changement de plan doit RÉ-ANCRER la fenêtre quota"


def test_subscription_updated_same_plan_keeps_anchor(client, db_session, test_org, monkeypatch):
    class _FakeBilling:
        def verify_webhook(self, payload, sig):
            return json.loads(payload)
    monkeypatch.setattr("routers.stripe_billing.get_billing_provider", lambda: _FakeBilling())

    org = db_session.get(Organization, test_org.id)
    org.plan = "pro"
    org.stripe_customer_id = "cus_same"
    anchor = datetime(2026, 3, 1)
    org.subscription_started_at = anchor
    db_session.commit()

    body = {
        "type": "customer.subscription.updated",
        "data": {"object": {
            "id": "sub_same", "customer": "cus_same", "status": "active",
            "items": {"data": [{"price": {"product": "prod_UFuTbjsjJG2tlq"}}]},  # pro (inchangé)
        }},
    }
    assert client.post("/api/stripe/webhook", json=body).status_code == 200

    db_session.expire_all()
    org = db_session.get(Organization, test_org.id)
    assert org.subscription_started_at == anchor, \
        "sans changement de plan, l'ancre ne doit PAS bouger (pas de fenêtre offerte)"
