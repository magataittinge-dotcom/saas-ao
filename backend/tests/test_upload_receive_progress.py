"""
Test du middleware de progression de RÉCEPTION (fix gel UI à 30 %).

FastAPI spoole tout le multipart avant l'endpoint : le middleware publie les
octets réellement reçus (échelle 0→30 du tracker « uploading ») sur le bus
SSE — la barre ne reste plus muette pendant la réception d'un gros ZIP.
"""
import io
import zipfile

from models.project import Project
from services import progress_bus


def _zip_bytes(n_files: int = 3) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(n_files):
            zf.writestr(f"doc{i}.txt", "contenu " * 2000)
    return buf.getvalue()


def test_receive_progress_published_during_upload(client, db_session, test_org, monkeypatch):
    project = Project(id="proj-recv", organization_id=test_org.id, name="X")
    db_session.add(project)
    db_session.commit()

    events = []
    orig_publish = progress_bus.publish

    def spy(project_id, event_type, payload):
        # Signature du middleware : detail « x / y Mo reçus » (le tracker
        # publie aussi status=uploading, sans ce detail).
        if payload.get("status") == "uploading" and "Mo reçus" in str(payload.get("detail", "")):
            events.append((project_id, payload))
        return orig_publish(project_id, event_type, payload)
    monkeypatch.setattr(progress_bus, "publish", spy)
    # Le middleware importe progress_bus au call — patcher le module suffit.

    resp = client.post(
        "/api/projects/proj-recv/documents",
        files={"file": ("dce.zip", _zip_bytes(), "application/zip")},
    )
    assert resp.status_code == 200, resp.text

    assert events, "aucune progression de réception publiée"
    assert all(pid == "proj-recv" for pid, _ in events)
    for _, payload in events:
        assert 0 <= payload["progress"] <= 30          # échelle tracker uploading
    # Monotone croissant
    values = [p["progress"] for _, p in events]
    assert values == sorted(values)


def test_middleware_ignores_other_routes(client, db_session, test_org, monkeypatch):
    calls = []
    monkeypatch.setattr(progress_bus, "publish",
                        lambda *a, **k: calls.append(a))
    client.get("/api/projects")
    assert calls == []
