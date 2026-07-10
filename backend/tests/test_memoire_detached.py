"""
Génération mémoire DÉTACHÉE (audit #1 🔴) — même architecture que l'analyse :
POST /generate → "started" immédiat, run en thread démon qui survit à la
navigation/reload/proxy ; échec → statut error + relance, jamais de
régression d'étape ; double-lancement → 409.
"""
import asyncio
import threading

import pytest

from models.memoire import MemoireTechnique
from models.notification import Notification
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption

_DUMMY_CONTENT = {"preambule": "généré", "partie_a": {"implantation": "ok"},
                  "partie_b": {}, "partie_c": {}}


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def _join_memoire_threads():
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)


def _make_project(db, org_id, pid):
    from models.organization import Organization
    db.get(Organization, org_id).plan = "pro"
    db.add(Project(
        id=pid, organization_id=org_id, name="AO détaché",
        selected_lot="lot1", selected_lot_name="Lot 1 — Gros œuvre",
        current_step=5,
    ))
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
        extracted_text="Règlement de consultation. " * 30,
    ))
    db.commit()


def test_generate_returns_started_and_runs_detached(client, db_session, test_org, monkeypatch):
    """POST → "started" immédiat pendant que la génération tourne en fond ;
    à la fin : mémoire en base, quota décompté, notification, étape avancée."""
    import routers.memoire as memoire_mod

    _make_project(db_session, test_org.id, "proj-mdet1")
    release = threading.Event()

    async def _slow(self, **kwargs):
        await asyncio.to_thread(release.wait, 20)
        return _DUMMY_CONTENT
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _slow)

    resp = client.post("/api/projects/proj-mdet1/memoire/generate", json={})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "started"

    # La génération tourne ENCORE (le POST n'a pas bloqué dessus) : pas de
    # mémoire en base, statut "generating" — c'est ce que voit un reload.
    db_session.expire_all()
    assert db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-mdet1").first() is None
    p = db_session.get(Project, "proj-mdet1")
    assert p.processing_status == "generating"

    # Reload utilisateur en plein run : l'état est lisible, le run continue.
    st = client.get("/api/projects/proj-mdet1/processing-status").json()
    assert st.get("pipeline_type") == "memoire"

    release.set()
    _join_memoire_threads()

    db_session.expire_all()
    memoire = db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-mdet1").first()
    assert memoire is not None
    assert memoire.content_json == _DUMMY_CONTENT
    p = db_session.get(Project, "proj-mdet1")
    assert p.processing_status == "ready"
    assert p.current_step == 6
    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).count()
    assert used == 1
    notifs = db_session.query(Notification).filter(
        Notification.organization_id == test_org.id,
        Notification.type == "memoire_ready",
    ).all()
    assert len(notifs) == 1


def test_double_generate_rejected_409(client, db_session, test_org, monkeypatch):
    import routers.memoire as memoire_mod

    _make_project(db_session, test_org.id, "proj-mdet2")
    release = threading.Event()

    async def _slow(self, **kwargs):
        await asyncio.to_thread(release.wait, 20)
        return _DUMMY_CONTENT
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _slow)

    assert client.post("/api/projects/proj-mdet2/memoire/generate",
                       json={}).json()["status"] == "started"
    resp2 = client.post("/api/projects/proj-mdet2/memoire/generate", json={})
    release.set()
    assert resp2.status_code == 409
    _join_memoire_threads()

    # Un seul run a consommé (le 409 n'a rien décompté).
    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).count()
    assert used == 1


def test_failure_sets_error_and_allows_relaunch(client, db_session, test_org, monkeypatch):
    """Échec du générateur → statut error + message relance, PAS de régression
    d'étape, 0 unité consommée, pas de notification ; la relance repart."""
    import routers.memoire as memoire_mod

    _make_project(db_session, test_org.id, "proj-mdet3")

    async def _boom(self, **kwargs):
        raise RuntimeError("claude down")
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _boom)

    resp = client.post("/api/projects/proj-mdet3/memoire/generate", json={})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "started"
    _join_memoire_threads()

    db_session.expire_all()
    p = db_session.get(Project, "proj-mdet3")
    assert p.processing_status == "error"
    assert "relancez" in (p.processing_detail or "").lower()
    assert p.current_step == 5          # jamais de régression NI d'avancée
    assert db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-mdet3").first() is None
    assert db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).count() == 0
    assert db_session.query(Notification).filter(
        Notification.organization_id == test_org.id,
        Notification.type == "memoire_ready",
    ).count() == 0

    # Relance : le thread précédent est mort → nouveau run accepté et réussi.
    async def _ok(self, **kwargs):
        return _DUMMY_CONTENT
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _ok)

    resp = client.post("/api/projects/proj-mdet3/memoire/generate", json={})
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"
    _join_memoire_threads()

    db_session.expire_all()
    p = db_session.get(Project, "proj-mdet3")
    assert p.processing_status == "ready"
    assert db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-mdet3").first() is not None
