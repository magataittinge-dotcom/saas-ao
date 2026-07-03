"""
Tests GET /api/billing/quota (C17) — statut des compteurs pour la jauge sidebar.
"""
from datetime import datetime

from models.quota_consumption import QuotaConsumption


def _consume(db, org_id: str, kind: str, n: int):
    for _ in range(n):
        db.add(QuotaConsumption(organization_id=org_id, kind=kind))
    db.commit()


def test_quota_endpoint_pro(client, db_session, test_org):
    test_org.plan = "pro"
    test_org.subscription_started_at = datetime.utcnow()
    db_session.commit()
    _consume(db_session, test_org.id, "analysis", 3)
    _consume(db_session, test_org.id, "memoire", 7)

    resp = client.get("/api/billing/quota")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["plan"] == "pro"
    assert body["analyses"] == {"used": 3, "limit": 40}
    assert body["memoires"] == {"used": 7, "limit": 40}
    assert body["period_start"] is not None
    assert body["period_end"] is not None


def test_quota_endpoint_business_unlimited(client, db_session, test_org):
    test_org.plan = "business"
    db_session.commit()
    _consume(db_session, test_org.id, "memoire", 55)

    resp = client.get("/api/billing/quota")
    assert resp.status_code == 200
    body = resp.json()
    assert body["memoires"]["limit"] is None
    assert body["memoires"]["used"] == 55


def test_quota_endpoint_free_trial(client, db_session, test_org):
    assert test_org.plan == "free"
    resp = client.get("/api/billing/quota")
    assert resp.status_code == 200
    body = resp.json()
    assert body["analyses"] == {"used": 0, "limit": 1}
    assert body["memoires"] == {"used": 0, "limit": 1}
    # Pas de fenêtre mensuelle en free (essai à vie).
    assert body["period_start"] is None
