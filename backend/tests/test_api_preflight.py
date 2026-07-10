"""
Garde pré-vol du service IA (audit risque #4) — un run condamné d'avance
(API down / crédit épuisé) ne démarre JAMAIS : 503 explicite AVANT toute
consommation de quota, pour l'analyse comme pour le mémoire.
"""
import pytest

from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    from main import app
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)
    if hasattr(app.state, "limiter"):
        monkeypatch.setattr(app.state.limiter, "enabled", False, raising=False)


def _ai_down(monkeypatch):
    from services.ai import api_preflight
    def _boom():
        raise RuntimeError("Error code: 400 - credit balance is too low")
    monkeypatch.setattr(api_preflight, "_ping", _boom)
    api_preflight._cache.update(ts=0.0, ok=False)


def _make_project(db, org_id, pid):
    from models.organization import Organization
    db.get(Organization, org_id).plan = "pro"
    db.add(Project(id=pid, organization_id=org_id, name="X",
                   selected_lot="lot1", selected_lot_name="Lot 1"))
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
        extracted_text="Règlement de consultation. " * 30,
    ))
    db.commit()


def _consumed(db, org_id, kind):
    return db.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == org_id,
        QuotaConsumption.kind == kind,
    ).count()


def test_analysis_blocked_503_when_ai_down_zero_consumed(
    client, db_session, test_org, monkeypatch,
):
    _make_project(db_session, test_org.id, "proj-pf1")
    _ai_down(monkeypatch)

    resp = client.post("/api/projects/proj-pf1/analyze")
    assert resp.status_code == 503
    assert "indisponible" in resp.json()["detail"].lower()
    assert _consumed(db_session, test_org.id, "analysis") == 0
    # Le run n'a PAS démarré : pas de statut « analyzing » posé.
    db_session.expire_all()
    assert db_session.get(Project, "proj-pf1").processing_status != "analyzing"


def test_memoire_blocked_503_when_ai_down_zero_consumed(
    client, db_session, test_org, monkeypatch,
):
    from models.memoire import MemoireTechnique

    _make_project(db_session, test_org.id, "proj-pf2")
    _ai_down(monkeypatch)

    resp = client.post("/api/projects/proj-pf2/memoire/generate", json={})
    assert resp.status_code == 503
    assert "indisponible" in resp.json()["detail"].lower()
    assert _consumed(db_session, test_org.id, "memoire") == 0
    assert db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-pf2").first() is None


def test_ping_ok_is_cached(monkeypatch):
    """Un ping OK vaut pour la fenêtre de cache : pas de latence/coût par run."""
    from services.ai import api_preflight

    calls = {"n": 0}
    def _ok():
        calls["n"] += 1
    monkeypatch.setattr(api_preflight, "_ping", _ok)
    api_preflight._cache.update(ts=0.0, ok=False)

    api_preflight.ensure_ai_service_available()
    api_preflight.ensure_ai_service_available()
    assert calls["n"] == 1


def test_failure_is_not_cached(monkeypatch):
    """Après un KO, le prochain run re-vérifie (pas de panne « collante »)."""
    from services.ai import api_preflight

    calls = {"n": 0}
    def _flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("down")
    monkeypatch.setattr(api_preflight, "_ping", _flaky)
    api_preflight._cache.update(ts=0.0, ok=False)

    with pytest.raises(api_preflight.AIServiceUnavailable):
        api_preflight.ensure_ai_service_available()
    api_preflight.ensure_ai_service_available()   # se rétablit aussitôt
    assert calls["n"] == 2


def test_analysis_starts_when_ai_ok(client, db_session, test_org, monkeypatch):
    """API OK → le run démarre normalement (la garde est transparente)."""
    from services.ai import dce_analyzer, checklist_matcher

    _make_project(db_session, test_org.id, "proj-pf3")

    def _ok_pass(self, *a, **kw):
        return {"requirements": [{"exigence": "Kbis", "source_document": "RC",
                                  "source_page": 1, "source_excerpt": "x",
                                  "category": "candidature", "priority": "obligatoire"}],
                "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _ok_pass)

    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)

    resp = client.post("/api/projects/proj-pf3/analyze")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "started"
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)
