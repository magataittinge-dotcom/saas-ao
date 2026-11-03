"""Répétition du 3/11 — l'API en dit moins quand on ne sait pas qui demande.

1. `/openapi.json` rend le schéma complet de l'API : fermé hors DEBUG comme
   `/docs` et `/redoc`, ouvert en DEBUG.
2. `/api/health` public = `status` et `db` seulement ; le reste (disque libre,
   clés configurées, version, durée de fonctionnement) exige le jeton ops
   (`METRICS_TOKEN`, même mécanisme que `/api/metrics`).
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import get_settings

PUBLIC = {"status", "db"}
DETAIL = {"version", "uptime_seconds", "disk_free_gb", "ai_api_configured", "stripe_configured"}


@pytest.fixture
def settings():
    return get_settings()


# ── 1. /openapi.json ─────────────────────────────────────────────────────────

def test_urls_de_documentation_fermees_hors_debug():
    from main import urls_documentation

    assert urls_documentation(False) == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    ouvertes = urls_documentation(True)
    assert ouvertes == {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}


def test_openapi_json_404_hors_debug_et_200_en_debug():
    from main import urls_documentation

    ferme = TestClient(FastAPI(**urls_documentation(False)))
    assert ferme.get("/openapi.json").status_code == 404
    assert ferme.get("/docs").status_code == 404
    assert ferme.get("/redoc").status_code == 404
    ouvert = TestClient(FastAPI(**urls_documentation(True)))
    assert ouvert.get("/openapi.json").status_code == 200


def test_l_appli_utilise_la_regle_des_urls_de_documentation(settings):
    """En test (DEBUG=true), l'appli réelle sert son schéma ; hors DEBUG elle
    appliquerait la même règle (`urls_documentation(settings.DEBUG)`)."""
    from main import app, urls_documentation

    assert settings.DEBUG is True
    assert app.openapi_url == urls_documentation(True)["openapi_url"]


# ── 2. /api/health ───────────────────────────────────────────────────────────

def test_health_sans_jeton_ne_donne_que_status_et_db(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "METRICS_TOKEN", "s3cr3t-ops")
    r = client.get("/api/health")
    assert r.status_code == 200
    assert set(r.json()) == PUBLIC
    assert r.json() == {"status": "ok", "db": "up"}


def test_health_avec_mauvais_jeton_ne_donne_que_status_et_db(client, settings, monkeypatch):
    """Pas de 403 : une sonde mal configurée ne doit pas voir « en panne »."""
    monkeypatch.setattr(settings, "METRICS_TOKEN", "s3cr3t-ops")
    r = client.get("/api/health", headers={"Authorization": "Bearer mauvais"})
    assert r.status_code == 200
    assert set(r.json()) == PUBLIC


def test_health_avec_bon_jeton_donne_le_detail(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "METRICS_TOKEN", "s3cr3t-ops")
    r = client.get("/api/health", headers={"Authorization": "Bearer s3cr3t-ops"})
    assert r.status_code == 200
    assert set(r.json()) == PUBLIC | DETAIL
    assert r.json()["status"] == "ok" and r.json()["db"] == "up"


@pytest.mark.parametrize("entete", ["Bearer ", "Bearer", "", "s3cr3t-ops"])
def test_health_sans_jeton_configure_ne_donne_jamais_le_detail(client, settings, monkeypatch, entete):
    """Aucun `METRICS_TOKEN` configuré : un bearer vide ne vaut pas jeton
    valide (deux chaînes vides seraient égales)."""
    monkeypatch.setattr(settings, "METRICS_TOKEN", "")
    r = client.get("/api/health", headers={"Authorization": entete})
    assert r.status_code == 200
    assert set(r.json()) == PUBLIC


def test_health_degrade_reste_en_200_sans_detail(client, settings, monkeypatch):
    """Base injoignable : `status=degraded`, `db=down`, toujours sans 5xx."""
    import main

    class _Moteur:
        def connect(self):
            raise RuntimeError("base injoignable")

    monkeypatch.setattr(main, "engine", _Moteur())
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "degraded", "db": "down"}
