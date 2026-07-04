"""
Tests C7 — reformulation texte libre du profil (Haiku 4.5).

  • POST /memoire-config/structure-text : texte libre → champs de profil
    PROPOSÉS (preview) — JAMAIS d'écriture directe (l'utilisateur valide
    puis le PUT existant persiste).
  • Anti-invention STRICT : toute valeur dont les termes significatifs ne
    sont pas dans le texte saisi est écartée (garde déterministe post-Haiku,
    en plus du prompt).
  • Coût loggé (tokens + estimation).
"""
import pytest

from models.memoire_config import MemoireConfig


TEXTE = (
    "On est une boîte de ravalement à Caen, 8 compagnons dont 2 chefs "
    "d'équipe. On a 3 camions benne, 2 échafaudages MDS et un chariot "
    "télescopique. On travaille sur toute la Normandie."
)


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire_config as mc_mod
    if hasattr(mc_mod, "limiter"):
        monkeypatch.setattr(mc_mod.limiter, "enabled", False, raising=False)


def _mock_haiku(monkeypatch, result: dict, usage=(350, 120)):
    import services.ai.profile_structurer as ps

    def fake(text):
        return result, {"input_tokens": usage[0], "output_tokens": usage[1]}
    monkeypatch.setattr(ps, "_call_haiku", fake)


# ─── Structuration correcte ──────────────────────────────────────────────────

def test_structure_text_proposes_fields(client, db_session, test_org, monkeypatch):
    _mock_haiku(monkeypatch, {
        "materiel": "3 camions benne, 2 échafaudages MDS, 1 chariot télescopique",
        "organigramme_description": "8 compagnons dont 2 chefs d'équipe",
        "zone_intervention": "Normandie",
        "activites": "Ravalement",
    })

    resp = client.post("/api/memoire-config/structure-text", json={"text": TEXTE})
    assert resp.status_code == 200, resp.text
    proposed = resp.json()["proposed"]
    assert "camions benne" in proposed["materiel"]
    assert "chefs d'équipe" in proposed["organigramme_description"]
    assert proposed["zone_intervention"] == "Normandie"

    # PREVIEW SEULEMENT : rien n'est écrit en base sans validation.
    assert db_session.query(MemoireConfig).filter(
        MemoireConfig.organization_id == test_org.id,
    ).first() is None


# ─── Anti-invention strict ───────────────────────────────────────────────────

def test_invented_content_is_dropped(client, db_session, test_org, monkeypatch, caplog):
    """Haiku hallucine une certification absente du texte → écartée."""
    _mock_haiku(monkeypatch, {
        "materiel": "3 camions benne",
        "demarche_qualite": "Certifiée Qualibat 2812 et ISO 9001",  # INVENTÉ
    })

    with caplog.at_level("WARNING"):
        resp = client.post("/api/memoire-config/structure-text", json={"text": TEXTE})
    proposed = resp.json()["proposed"]
    assert "materiel" in proposed
    assert "demarche_qualite" not in proposed          # invention filtrée
    assert any("invent" in r.message.lower() or "écart" in r.message.lower()
               for r in caplog.records)


def test_unknown_fields_are_dropped(client, db_session, test_org, monkeypatch):
    """Haiku retourne un champ hors whitelist → ignoré."""
    _mock_haiku(monkeypatch, {
        "materiel": "3 camions benne",
        "plan": "business",           # hors whitelist profil
    })

    resp = client.post("/api/memoire-config/structure-text", json={"text": TEXTE})
    assert "plan" not in resp.json()["proposed"]


# ─── Garde-fous entrée + coût ────────────────────────────────────────────────

def test_empty_or_oversize_text_rejected(client, db_session, test_org, monkeypatch):
    _mock_haiku(monkeypatch, {})
    assert client.post("/api/memoire-config/structure-text", json={"text": "  "}).status_code == 422
    assert client.post("/api/memoire-config/structure-text", json={"text": "x" * 8001}).status_code == 422


def test_cost_logged_and_returned(client, db_session, test_org, monkeypatch, caplog):
    _mock_haiku(monkeypatch, {"materiel": "3 camions benne"}, usage=(400, 150))

    with caplog.at_level("INFO"):
        resp = client.post("/api/memoire-config/structure-text", json={"text": TEXTE})
    body = resp.json()
    assert body["usage"]["input_tokens"] == 400
    assert body["usage"]["output_tokens"] == 150
    assert body["usage"]["cost_usd"] < 0.01   # fraction de centime
    assert any("structure-text" in r.message for r in caplog.records)
