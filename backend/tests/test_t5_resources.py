"""T5 — ressources & robustesse :
  • SSE : ne tient plus une connexion DB pendant tout le flux ;
  • export ZIP : assemblé sur disque (fichier temp), pas en RAM ;
  • webhooks Stripe : tests d'endpoint (upgrade / downgrade / signature invalide).
"""
import io
import os
import zipfile
from datetime import date

import pytest

from main import app
from models.organization import Organization
from models.project import Project


# ─── SSE : la connexion DB est relâchée avant le stream ───────────────────────

def test_sse_stream_has_no_request_scoped_db_dependency():
    """FastAPI garde la session yield-ée par Depends(get_db) ouverte pendant
    TOUTE la requête. Sur un flux SSE long, c'est une connexion bloquée par
    client → pool épuisé. progress-stream doit vérifier l'accès via une session
    COURTE (ouverte/fermée), sans dépendre de get_db."""
    from database import get_db

    route = next(
        r for r in app.routes
        if getattr(r, "path", "") == "/api/projects/{project_id}/progress-stream"
    )

    def _uses_get_db(dep) -> bool:
        return dep.call is get_db or any(_uses_get_db(s) for s in dep.dependencies)

    assert not any(_uses_get_db(d) for d in route.dependant.dependencies), (
        "progress-stream tient une connexion via Depends(get_db) tout le flux"
    )


def test_sse_stream_still_authorizes_cross_org(client, db_session):
    """La vérif d'accès (session courte) marche toujours : un projet d'une autre
    org renvoie 404 avant tout streaming."""
    other = Organization(id="org-other-sse", name="Autre")
    db_session.add(other)
    db_session.add(Project(id="proj-sse-other", organization_id="org-other-sse",
                           name="X", deadline=date.today()))
    db_session.commit()

    resp = client.get("/api/projects/proj-sse-other/progress-stream")
    assert resp.status_code == 404, resp.status_code


# ─── Export ZIP : assemblé sur disque, pas en RAM ─────────────────────────────

def test_zip_export_streams_from_disk_and_cleans_up(client, db_session, test_org, monkeypatch):
    """L'export ZIP ne doit plus construire toute l'archive en RAM (io.BytesIO) :
    il l'écrit dans un fichier temporaire, le streame, puis le supprime."""
    import routers.export as export_mod

    db_session.add(Project(id="proj-zip", organization_id=test_org.id,
                           name="ZIP", deadline=date.today()))
    db_session.commit()

    created = []
    real_named_tmp = export_mod.tempfile.NamedTemporaryFile

    def _spy_named_tmp(*a, **k):
        f = real_named_tmp(*a, **k)
        created.append(f.name)
        return f
    monkeypatch.setattr(export_mod.tempfile, "NamedTemporaryFile", _spy_named_tmp)

    resp = client.get("/api/projects/proj-zip/export/zip")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert zf.namelist(), "ZIP vide"

    assert created, "aucun NamedTemporaryFile — l'archive est montée en RAM (io.BytesIO)"
    for name in created:
        assert not os.path.exists(name), f"fichier temp non nettoyé: {name}"


# ─── Webhooks Stripe : tests d'endpoint ───────────────────────────────────────

class _FakeProvider:
    """Provider factice : verify_webhook renvoie l'event (payload JSON) ou lève."""
    def __init__(self, raises=False):
        self._raises = raises

    def verify_webhook(self, payload, sig):
        from services.billing import BillingError
        if self._raises:
            raise BillingError("Invalid webhook signature")
        import json
        return json.loads(payload)


def _patch_provider(monkeypatch, provider):
    import routers.stripe_billing as sb
    monkeypatch.setattr(sb, "get_billing_provider", lambda: provider)
    monkeypatch.setattr(sb.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test", raising=False)


def test_webhook_invalid_signature_returns_400(client, monkeypatch):
    _patch_provider(monkeypatch, _FakeProvider(raises=True))
    resp = client.post("/api/stripe/webhook",
                       json={"type": "customer.subscription.updated"},
                       headers={"stripe-signature": "t=1,v1=bogus"})
    assert resp.status_code == 400, resp.text


def test_webhook_checkout_completed_upgrades_plan(client, db_session, test_org, monkeypatch):
    _patch_provider(monkeypatch, _FakeProvider())
    assert test_org.plan == "free"
    body = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "metadata": {"organization_id": test_org.id, "plan": "pro"},
            "customer": "cus_up", "subscription": "sub_up",
        }},
    }
    resp = client.post("/api/stripe/webhook", json=body,
                       headers={"stripe-signature": "t=1,v1=ok"})
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    org = db_session.query(Organization).filter_by(id=test_org.id).first()
    assert org.plan == "pro"
    assert org.stripe_customer_id == "cus_up"
    assert org.subscription_started_at is not None  # ancre de quotas posée


def test_webhook_subscription_deleted_downgrades_to_free(client, db_session, test_org, monkeypatch):
    _patch_provider(monkeypatch, _FakeProvider())
    test_org.plan = "pro"
    test_org.stripe_customer_id = "cus_down"
    test_org.stripe_subscription_id = "sub_down"
    db_session.commit()

    body = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_down"}},
    }
    resp = client.post("/api/stripe/webhook", json=body,
                       headers={"stripe-signature": "t=1,v1=ok"})
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    org = db_session.query(Organization).filter_by(id=test_org.id).first()
    assert org.plan == "free"
    assert org.stripe_subscription_id is None
    assert org.subscription_started_at is None
