"""Tests d'intégration des endpoints calculateurs déterministes (0 API).

Cas nominal + cas limite + rejet des entrées invalides (validation Pydantic).
Auth simulée via dependency_overrides (pattern conftest/security tests).
"""

import pytest
from fastapi.testclient import TestClient

from main import app
from models.user import User
from routers.auth import get_auth_user


@pytest.fixture
def client():
    app.dependency_overrides[get_auth_user] = lambda: User(
        id="u-calc", email="calc@test.fr", name="Calc", organization_id="org-calc"
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


# ── OAB ─────────────────────────────────────────────────────────────────────

def test_oab_nominal_low_offer_flagged(client):
    r = client.post("/api/calculators/oab", json={
        "prix_candidat": 70.0,
        "prix_offres": [70, 100, 105, 110, 300],
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["m1"] == 137.0
    assert d["m2"] == 96.25
    assert d["est_oab"] is True
    assert d["gauge"] == "rouge"
    assert "Verchéenne" in d["rappel_juridique"]


def test_oab_safe_offer_vert(client):
    r = client.post("/api/calculators/oab", json={
        "prix_candidat": 105.0, "prix_offres": [100, 105, 110],
    })
    assert r.status_code == 200
    assert r.json()["est_oab"] is False
    assert r.json()["gauge"] == "vert"


def test_oab_limit_no_competitors_warns(client):
    """Cas limite : aucune offre concurrente → avertissement, pas d'erreur."""
    r = client.post("/api/calculators/oab", json={"prix_candidat": 100.0})
    assert r.status_code == 200
    d = r.json()
    assert d["m1"] == 100.0
    assert any("À COMPLÉTER" in a for a in d["avertissements"])


def test_oab_rejects_invalid(client):
    # prix_candidat <= 0
    assert client.post("/api/calculators/oab", json={"prix_candidat": 0}).status_code == 422
    assert client.post("/api/calculators/oab", json={"prix_candidat": -5}).status_code == 422
    # offre négative dans la liste
    assert client.post("/api/calculators/oab", json={
        "prix_candidat": 100, "prix_offres": [100, -1]
    }).status_code == 422
    # seuil hors [0,1]
    assert client.post("/api/calculators/oab", json={
        "prix_candidat": 100, "seuil_oab": 1.5
    }).status_code == 422


# ── Retenue de garantie ───────────────────────────────────────────────────────

def test_retenue_nominal(client):
    r = client.post("/api/calculators/retenue-garantie", json={"montant_ht": 100000.0})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["montant_ttc"] == pytest.approx(120000.0)
    rg = [p for p in d["postes"] if "garantie" in p["poste"].lower()]
    assert rg and rg[0]["montant"] == pytest.approx(6000.0)  # 5% du TTC


def test_retenue_penalites_retard(client):
    r = client.post("/api/calculators/retenue-garantie", json={
        "montant_ht": 300000.0, "jours_retard_execution": 10,
    })
    assert r.status_code == 200
    postes = r.json()["postes"]
    assert any("retard" in p["poste"].lower() or "pénal" in p["poste"].lower() for p in postes)


def test_retenue_rejects_invalid(client):
    # montant_ht <= 0
    assert client.post("/api/calculators/retenue-garantie", json={"montant_ht": 0}).status_code == 422
    # taux_rg > 5% (max légal)
    assert client.post("/api/calculators/retenue-garantie", json={
        "montant_ht": 100000, "taux_rg": 0.10
    }).status_code == 422
    # jours négatifs
    assert client.post("/api/calculators/retenue-garantie", json={
        "montant_ht": 100000, "jours_retard_execution": -3
    }).status_code == 422


def test_calculators_require_auth():
    """Sans auth, l'endpoint ne doit pas être ouvertement accessible."""
    app.dependency_overrides.clear()
    c = TestClient(app)
    r = c.post("/api/calculators/oab", json={"prix_candidat": 100.0})
    assert r.status_code in (401, 403), f"attendu 401/403, reçu {r.status_code}"
