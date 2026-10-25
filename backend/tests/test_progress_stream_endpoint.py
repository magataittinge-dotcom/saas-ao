"""Smoke tests for the SSE /progress-stream endpoint.

The endpoint streams indefinitely — TestClient.stream() consumes the
response synchronously and would hang. We test what we can without
actually consuming the stream:
  * the route authenticates and authorises by org
  * the SSE wire-format helper produces correct bytes
  * cleanup happens when the underlying generator exits
End-to-end real-time behaviour is exercised in the runtime check
(curl) and by the pub/sub tests in test_progress_bus.py.
"""
import json

import pytest

from fastapi.testclient import TestClient
from fastapi import HTTPException

from database import SessionLocal, get_db
from main import app
from models.organization import Organization
from models.user import User
from models.project import Project
from routers.auth import get_auth_user
from routers.progress import _format_event, _get_project_or_404
from services import pipeline_tracker, progress_bus


@pytest.fixture(autouse=True)
def _reset():
    pipeline_tracker._store.clear()
    progress_bus._subscribers.clear()
    progress_bus._last_event.clear()
    yield
    pipeline_tracker._store.clear()
    progress_bus._subscribers.clear()
    progress_bus._last_event.clear()


def _client_as(user):
    def _override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _override_auth():
        return user

    from routers.auth import get_auth_user_short
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_auth_user] = _override_auth
    app.dependency_overrides[get_auth_user_short] = _override_auth
    return TestClient(app)


# ── Wire format ──────────────────────────────────────────────────────────────

def test_format_event_basic():
    block = _format_event("progress", {"progress": 42, "status": "running"})
    text = block.decode("utf-8")
    assert text.startswith("event: progress\n")
    assert text.endswith("\n\n")
    # Each event is one event line + one data line, terminated by blank line.
    lines = text.rstrip("\n").split("\n")
    assert lines[0] == "event: progress"
    assert lines[1].startswith("data: ")
    payload = json.loads(lines[1].removeprefix("data: "))
    assert payload == {"progress": 42, "status": "running"}


def test_format_event_unicode_kept():
    block = _format_event("progress", {"detail": "Détection des lots…"})
    text = block.decode("utf-8")
    assert "Détection des lots" in text


def test_format_event_handles_complete_type():
    block = _format_event("complete", {"progress": 100})
    text = block.decode("utf-8")
    assert text.startswith("event: complete\n")


# ── Authorisation ────────────────────────────────────────────────────────────

def test_get_project_or_404_blocks_other_org(db_session):
    org_a = Organization(id="org-A-sse", name="A")
    org_b = Organization(id="org-B-sse", name="B")
    db_session.add_all([org_a, org_b])
    db_session.add(Project(id="proj-A-sse", organization_id="org-A-sse", name="X"))
    db_session.commit()

    # User from org B trying to read org A's project — must 404.
    with pytest.raises(HTTPException) as exc:
        _get_project_or_404("proj-A-sse", "org-B-sse", db_session)
    assert exc.value.status_code == 404


def test_get_project_or_404_returns_owned_project(db_session):
    org = Organization(id="org-OK", name="Owner")
    db_session.add(org)
    db_session.add(Project(id="proj-ok", organization_id="org-OK", name="X"))
    db_session.commit()

    p = _get_project_or_404("proj-ok", "org-OK", db_session)
    assert p.id == "proj-ok"


def test_get_project_or_404_hides_soft_deleted(db_session):
    from datetime import datetime
    org = Organization(id="org-soft", name="X")
    db_session.add(org)
    db_session.add(Project(
        id="proj-deleted", organization_id="org-soft", name="dead",
        deleted_at=datetime.utcnow(),
    ))
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        _get_project_or_404("proj-deleted", "org-soft", db_session)
    assert exc.value.status_code == 404


# ── Endpoint integration (no-stream-consumption variant) ─────────────────────

def test_progress_stream_route_registered():
    """Smoke-check that the route is registered and its prefix is /api/projects."""
    from fastapi.routing import iter_route_contexts

    # FastAPI ≥ 0.137 : `app.routes` est un arbre ; liste aplatie des routes.
    paths = [r.path for r in iter_route_contexts(app.routes)]
    assert any('/api/projects/{project_id}/progress-stream' == p for p in paths)


def test_progress_stream_unknown_project_returns_404(db_session, test_user):
    """A regular GET that goes through the auth+org check before opening the
    stream — when project doesn't exist, we 404 without ever streaming."""
    client = _client_as(test_user)
    try:
        # Le 404 arrive avant tout flux. Pas de `timeout=` : le TestClient
        # l'ignore (transport en mémoire) et Starlette le déprécie (0.46).
        resp = client.get("/api/projects/does-not-exist/progress-stream")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ── Flux réel (nuit du 23/10) : livraison, battement de cœur, aucun thread ───
# Le TestClient ne rend la réponse qu'une fois le flux FINI : les événements sont
# publiés par un thread décalé, après l'abonnement fait par la route.
def _publier_plus_tard(pid, evenements, delai=0.5):
    import threading
    import time as _time

    def _go():
        _time.sleep(delai)
        for type_, donnees in evenements:
            progress_bus.publish(pid, type_, donnees)

    th = threading.Thread(target=_go, daemon=True)
    th.start()
    return th


def _evenements(texte):
    return [l.split(":", 1)[1].strip() for l in texte.splitlines() if l.startswith("event:")]


def _projet(db_session, test_org, pid):
    db_session.add(Project(id=pid, organization_id=test_org.id, name="X"))
    db_session.commit()


def test_le_flux_livre_les_evenements_dans_l_ordre_puis_se_ferme(db_session, test_org, test_user):
    _projet(db_session, test_org, "p-sse-1")
    client = _client_as(test_user)
    try:
        _publier_plus_tard("p-sse-1", [("progress", {"progress": 40}), ("complete", {"progress": 100})])
        r = client.get("/api/projects/p-sse-1/progress-stream")
        assert r.status_code == 200
        assert _evenements(r.text) == ["init", "progress", "complete"]
    finally:
        app.dependency_overrides.clear()


def test_le_flux_bat_quand_rien_ne_se_passe(db_session, test_org, test_user, monkeypatch):
    import routers.progress as rp
    monkeypatch.setattr(rp, "_HEARTBEAT_INTERVAL_S", 0.2)
    _projet(db_session, test_org, "p-sse-2")
    client = _client_as(test_user)
    try:
        _publier_plus_tard("p-sse-2", [("complete", {"progress": 100})], delai=1.2)
        evenements = _evenements(client.get("/api/projects/p-sse-2/progress-stream").text)
        assert evenements[0] == "init" and evenements[-1] == "complete"
        assert "heartbeat" in evenements
    finally:
        app.dependency_overrides.clear()


def test_un_flux_ouvert_ne_retient_aucun_thread(db_session, test_org, test_user, monkeypatch):
    """Chaque fenêtre de progression ouverte retenait un thread du pool to_thread
    (6 threads sur un VPS à 2 vCPU) : au-delà, dépôts, surlignage et vérifications
    IA attendaient. La file se lit maintenant sans thread."""
    import asyncio as _asyncio

    async def interdit(*a, **k):
        raise AssertionError("le flux SSE ne doit pas prendre de thread")

    monkeypatch.setattr(_asyncio, "to_thread", interdit)
    _projet(db_session, test_org, "p-sse-3")
    client = _client_as(test_user)
    try:
        _publier_plus_tard("p-sse-3", [("progress", {"progress": 10}), ("complete", {"progress": 100})])
        evenements = _evenements(client.get("/api/projects/p-sse-3/progress-stream").text)
        assert evenements == ["init", "progress", "complete"]
    finally:
        app.dependency_overrides.clear()
