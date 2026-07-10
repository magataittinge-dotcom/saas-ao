"""
Tests Lot 7 T3 (bonus) — flag RAG_ENRICHMENT (défaut FALSE).

  • Flag OFF (défaut) : chemin de génération STRICTEMENT inchangé —
    build_reglementaire_block jamais appelé, aucun bloc passé au
    générateur, append(x, None) == x à l'octet.
  • Flag ON : retrieve top-3 sur les exigences du lot → bloc injecté au
    prompt avec la consigne « citer uniquement ces articles, référence
    exacte, jamais inventer ». Coût loggé. Échec du retrieve → génération
    JAMAIS bloquée (bloc None).
"""
import pytest

from models.project import Project, ProjectDocument


CHUNKS = [
    {"article_ref": "R2191-32", "contenu": "La retenue de garantie a pour seul objet...",
     "contexte": "Objet de la retenue de garantie.", "score": 0.9},
    {"article_ref": "R2192-10", "contenu": "Le délai de paiement est fixé à trente jours...",
     "contexte": "Délai de paiement.", "score": 0.8},
]


# ─── Bloc réglementaire (unit) ───────────────────────────────────────────────

def test_block_contains_articles_and_anti_invention_rule(monkeypatch, caplog):
    import services.rag.enrichment as enr

    monkeypatch.setattr(enr, "retrieve", lambda db, q, top_k: CHUNKS)

    class _Item:
        exigence_text = "Une retenue de garantie de 5 % sera appliquée"
        category = "candidature"

    with caplog.at_level("INFO"):
        block = enr.build_reglementaire_block(None, [_Item()])

    assert "R2191-32" in block and "R2192-10" in block
    assert "trente jours" in block
    assert "N'invente JAMAIS" in block
    assert "référence exacte" in block
    assert any("enrichment" in r.message.lower() for r in caplog.records)


def test_block_none_when_no_results_or_failure(monkeypatch):
    import services.rag.enrichment as enr

    class _Item:
        exigence_text = "exigence"
        category = "technique"

    monkeypatch.setattr(enr, "retrieve", lambda db, q, top_k: [])
    assert enr.build_reglementaire_block(None, [_Item()]) is None

    def boom(*a, **k):
        raise RuntimeError("Voyage down")
    monkeypatch.setattr(enr, "retrieve", boom)
    assert enr.build_reglementaire_block(None, [_Item()]) is None  # jamais bloquant

    assert enr.build_reglementaire_block(None, []) is None


# ─── Append : octet-identique quand OFF ──────────────────────────────────────

def test_append_is_byte_identical_when_none():
    from services.ai.memoire_generator import _append_reglementaire

    base = "MARCHÉ : X\n━━━ DOCUMENTS DCE ━━━\ntexte"
    assert _append_reglementaire(base, None) == base           # à l'octet
    assert _append_reglementaire(base, "") == base
    enriched = _append_reglementaire(base, "[R2191-32] ...")
    assert enriched.startswith(base)
    assert "RÉFÉRENCES RÉGLEMENTAIRES" in enriched


# ─── Câblage endpoint : les deux chemins ─────────────────────────────────────

@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def _setup(db, org_id, pid):
    p = Project(id=pid, organization_id=org_id, name="Gueux", selected_lot="lot1")
    db.add(p)
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
        file_name="rc.pdf", extracted_text="RC " * 30,
    ))
    db.commit()


def _mock_generator(monkeypatch, captured):
    import routers.memoire as memoire_mod

    async def _fake(self, **kwargs):
        captured.update(kwargs)
        return {"preambule": "P.", "partie_a": {}, "partie_b": {}, "partie_c": {}}
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _fake)


def _join():
    """Génération détachée : attendre la fin du job avant les asserts."""
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)


def test_flag_off_path_unchanged(client, db_session, test_org, monkeypatch):
    """Défaut : build_reglementaire_block N'EST PAS appelé, aucun bloc passé."""
    import routers.memoire as memoire_mod

    test_org.plan = "pro"
    _setup(db_session, test_org.id, "proj-ragoff")

    def forbidden(*a, **k):
        raise AssertionError("build_reglementaire_block appelé avec flag OFF")
    monkeypatch.setattr(
        "services.rag.enrichment.build_reglementaire_block", forbidden)

    captured = {}
    _mock_generator(monkeypatch, captured)

    resp = client.post("/api/projects/proj-ragoff/memoire/generate", json={})
    assert resp.status_code == 200, resp.text
    _join()
    assert captured.get("reglementaire_block") is None


def test_flag_on_injects_block(client, db_session, test_org, monkeypatch):
    from config import get_settings

    test_org.plan = "pro"
    _setup(db_session, test_org.id, "proj-ragon")

    monkeypatch.setattr(get_settings(), "RAG_ENRICHMENT", True)
    monkeypatch.setattr(
        "services.rag.enrichment.build_reglementaire_block",
        lambda db, items, top_k=3: "━━━ RÉFÉRENCES RÉGLEMENTAIRES ━━━\n[R2191-32] ...")

    captured = {}
    _mock_generator(monkeypatch, captured)

    resp = client.post("/api/projects/proj-ragon/memoire/generate", json={})
    assert resp.status_code == 200, resp.text
    _join()
    assert "R2191-32" in (captured.get("reglementaire_block") or "")
