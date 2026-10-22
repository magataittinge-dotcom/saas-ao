"""1.1 — Offre Essentiel (grille du 2026-10-22) : ce qui est appliqué = ce qui est affiché.

  • Essentiel : 5 analyses + 5 mémoires par mois (149 €/mois, côté Stripe).
  • Les refus (402) proposent les offres supérieures avec les quotas réels.
  • Le paiement de l'offre n'est ouvert que si son produit Stripe est
    renseigné (STRIPE_PRODUCT_ESSENTIEL) ; sinon un 503 explicite.
"""
import json
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from models.organization import Organization
from models.quota_consumption import QuotaConsumption


def _consume_n(db, org_id: str, kind: str, n: int, when: datetime = None):
    for _ in range(n):
        row = QuotaConsumption(organization_id=org_id, kind=kind)
        if when is not None:
            row.created_at = when
        db.add(row)
    db.commit()


def test_essentiel_limits_are_5_plus_5_monthly():
    from services.quota import PLAN_LIMITS
    assert PLAN_LIMITS["essentiel"] == {"analysis": 5, "memoire": 5, "monthly": True}


def test_essentiel_quota_status(db_session, test_org):
    from services.quota import get_quota_status
    test_org.plan = "essentiel"
    db_session.commit()
    _consume_n(db_session, test_org.id, "analysis", 2)

    status = get_quota_status(db_session, test_org)
    assert status["plan"] == "essentiel"
    assert status["analyses"] == {"used": 2, "limit": 5}
    assert status["memoires"] == {"used": 0, "limit": 5}
    assert status["period_end"] is not None  # fenêtre mensuelle


def test_essentiel_sixth_analysis_is_refused_with_pro_invitation(db_session, test_org):
    from services.quota import check_quota
    test_org.plan = "essentiel"
    db_session.commit()
    _consume_n(db_session, test_org.id, "analysis", 4)
    check_quota(db_session, test_org, "analysis")  # 5e : acceptée

    _consume_n(db_session, test_org.id, "analysis", 1)
    with pytest.raises(HTTPException) as exc:
        check_quota(db_session, test_org, "analysis")
    assert exc.value.status_code == 402
    detail = exc.value.detail
    assert "5/5 analyses" in detail
    assert "Pro (40 analyses + 40 mémoires/mois)" in detail
    assert "Business (illimité)" in detail


def test_essentiel_quota_is_monthly(db_session, test_org):
    """Les consommations d'une période passée ne comptent plus."""
    from services.quota import check_quota
    test_org.plan = "essentiel"
    test_org.subscription_started_at = datetime.utcnow() - timedelta(days=75)
    db_session.commit()
    _consume_n(db_session, test_org.id, "memoire", 5, when=datetime.utcnow() - timedelta(days=50))
    check_quota(db_session, test_org, "memoire")  # ne lève pas


def test_free_402_lists_the_three_offers(db_session, test_org):
    from services.quota import check_quota
    assert test_org.plan == "free"
    _consume_n(db_session, test_org.id, "analysis", 1)
    with pytest.raises(HTTPException) as exc:
        check_quota(db_session, test_org, "analysis")
    detail = exc.value.detail
    assert "essai" in detail
    for attendu in ("Essentiel (5 analyses + 5 mémoires/mois)",
                    "Pro (40 analyses + 40 mémoires/mois)",
                    "Business (illimité)"):
        assert attendu in detail


def test_checkout_essentiel_refused_calmly_when_product_not_configured(client, db_session, test_org, monkeypatch):
    import routers.stripe_billing as sb
    monkeypatch.setattr(sb, "PRODUCTS", {k: v for k, v in sb.PRODUCTS.items() if k != "essentiel"})
    resp = client.post("/api/stripe/create-checkout-session", json={"plan": "essentiel"})
    assert resp.status_code == 503, resp.text
    assert "pas encore ouverte au paiement" in resp.json()["detail"]


def test_checkout_unknown_offer_is_400(client):
    resp = client.post("/api/stripe/create-checkout-session", json={"plan": "starter"})
    assert resp.status_code == 400
    assert "Essentiel, Pro ou Business" in resp.json()["detail"]


def test_checkout_refused_when_already_on_essentiel(client, db_session, test_org):
    db_session.get(Organization, test_org.id).plan = "essentiel"
    db_session.commit()
    resp = client.post("/api/stripe/create-checkout-session", json={"plan": "pro"})
    assert resp.status_code == 409, resp.text


def test_webhook_maps_essentiel_product_to_plan(client, db_session, test_org, monkeypatch):
    import routers.stripe_billing as sb

    class _FakeBilling:
        def verify_webhook(self, payload, sig):
            return json.loads(payload)
    monkeypatch.setattr(sb, "get_billing_provider", lambda: _FakeBilling())
    monkeypatch.setitem(sb.PRODUCTS, "essentiel", "prod_essentiel_test")

    org = db_session.get(Organization, test_org.id)
    org.plan = "pro"
    org.stripe_customer_id = "cus_ess"
    db_session.commit()

    body = {
        "type": "customer.subscription.updated",
        "data": {"object": {
            "id": "sub_ess", "customer": "cus_ess", "status": "active",
            "items": {"data": [{"price": {"product": "prod_essentiel_test"}}]},
        }},
    }
    resp = client.post("/api/stripe/webhook", json=body)
    assert resp.status_code == 200, resp.text
    db_session.expire_all()
    assert db_session.get(Organization, test_org.id).plan == "essentiel"
