"""S3.5 — /api/metrics ne doit jamais être public (audit passe 2, 🟡).

L'endpoint expose des agrégats PLATEFORME (nombre d'orgs, de projets, de
documents, activité d'audit, stats de cache) — de la BI cross-org. Il doit être
réservé à l'ops via un jeton dédié (METRICS_TOKEN), et fail-closed en prod
lorsqu'aucun jeton n'est configuré.
"""
import pytest

from config import get_settings


@pytest.fixture
def settings():
    return get_settings()


def test_metrics_requires_token_when_configured(client, settings, monkeypatch):
    """Jeton configuré → un bearer valide est exigé."""
    monkeypatch.setattr(settings, "METRICS_TOKEN", "s3cr3t-ops")

    # Sans bearer → 403.
    assert client.get("/api/metrics").status_code == 403
    # Mauvais bearer → 403.
    assert client.get(
        "/api/metrics", headers={"Authorization": "Bearer mauvais"},
    ).status_code == 403
    # Bon bearer → 200.
    resp = client.get("/api/metrics", headers={"Authorization": "Bearer s3cr3t-ops"})
    assert resp.status_code == 200, resp.text
    assert "orgs_total" in resp.json()


def test_metrics_fail_closed_in_prod_without_token(client, settings, monkeypatch):
    """Prod (DEBUG off) + aucun jeton → on n'expose rien (404)."""
    monkeypatch.setattr(settings, "METRICS_TOKEN", "")
    monkeypatch.setattr(settings, "DEBUG", False)
    assert client.get("/api/metrics").status_code == 404


def test_metrics_open_in_debug_without_token(client, settings, monkeypatch):
    """En dev (DEBUG on) sans jeton → toléré (confort local/ops)."""
    monkeypatch.setattr(settings, "METRICS_TOKEN", "")
    monkeypatch.setattr(settings, "DEBUG", True)
    assert client.get("/api/metrics").status_code == 200
