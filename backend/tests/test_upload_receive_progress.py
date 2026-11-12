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
    # Le client de test court-circuite l'authentification (dépendance remplacée) : le contrôle du jeton du middleware
    # (S-11, testé plus bas) est accepté ici.
    import main
    monkeypatch.setattr(main, "_appelant_possede_le_projet", lambda authorization, project_id: True)

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


# ── S-11 (audit de sécurité, P2) : la progression n'est publiée que pour l'organisation propriétaire de l'AO ─────
# Avant : le middleware publiait sur le canal de N'IMPORTE QUEL project_id pendant la réception, avant tout contrôle
# d'authentification (FastAPI lit le corps avant les dépendances) : un tiers qui connaissait l'identifiant d'un AO
# pouvait fausser sa barre de progression. Désormais le jeton est vérifié et l'AO doit appartenir à son organisation.
def _espion(monkeypatch):
    evenements = []
    monkeypatch.setattr(progress_bus, "publish", lambda pid, typ, charge: evenements.append((pid, charge)))
    return evenements


def _projet_de_a(db_session):
    from models.organization import Organization
    from models.user import User
    db_session.add_all([Organization(id="org-pa", name="A"), Organization(id="org-pb", name="B")])
    db_session.flush()
    db_session.add_all([
        User(id="u-pa", email="pa@exemple.test", name="A", organization_id="org-pa", clerk_id="clerk-a"),
        User(id="u-pb", email="pb@exemple.test", name="B", organization_id="org-pb", clerk_id="clerk-b"),
        Project(id="proj-pa", organization_id="org-pa", name="AO de A"),
    ])
    db_session.commit()


def _envoyer_sans_route(jeton=None):
    """Appelle le middleware seul (application interne qui lit le corps puis répond 401), comme un tiers."""
    import asyncio
    from main import UploadReceiveProgressMiddleware

    async def appli(scope, receive, send):
        while True:
            message = await receive()
            if not message.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 401, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    corps = [{"type": "http.request", "body": b"x" * 1000, "more_body": True},
             {"type": "http.request", "body": b"x" * 1000, "more_body": False}]

    async def recevoir():
        return corps.pop(0)

    async def envoyer(_):
        return None

    entetes = [(b"content-length", b"2000")]
    if jeton:
        entetes.append((b"authorization", f"Bearer {jeton}".encode()))
    scope = {"type": "http", "method": "POST", "path": "/api/projects/proj-pa/documents", "headers": entetes}
    asyncio.run(UploadReceiveProgressMiddleware(appli)(scope, recevoir, envoyer))


def test_sans_jeton_aucune_progression_publiee(db_session, monkeypatch):
    _projet_de_a(db_session)
    evenements = _espion(monkeypatch)
    _envoyer_sans_route()
    assert evenements == []


def test_jeton_d_une_autre_organisation_aucune_progression(db_session, monkeypatch):
    import routers.auth as auth_mod
    _projet_de_a(db_session)
    evenements = _espion(monkeypatch)
    monkeypatch.setattr(auth_mod, "_decode_clerk_token", lambda jeton: {"sub": {"jeton-b": "clerk-b"}[jeton]})
    _envoyer_sans_route("jeton-b")
    assert evenements == []


def test_jeton_invalide_aucune_progression(db_session, monkeypatch):
    import routers.auth as auth_mod
    from fastapi import HTTPException
    _projet_de_a(db_session)
    evenements = _espion(monkeypatch)

    def _refus(jeton):
        raise HTTPException(status_code=401, detail="jeton refusé")
    monkeypatch.setattr(auth_mod, "_decode_clerk_token", _refus)
    _envoyer_sans_route("faux")
    assert evenements == []


def test_jeton_du_proprietaire_progression_publiee(db_session, monkeypatch):
    import routers.auth as auth_mod
    _projet_de_a(db_session)
    evenements = _espion(monkeypatch)
    monkeypatch.setattr(auth_mod, "_decode_clerk_token", lambda jeton: {"sub": {"jeton-a": "clerk-a"}[jeton]})
    _envoyer_sans_route("jeton-a")
    assert evenements and all(pid == "proj-pa" for pid, _ in evenements)
    assert evenements[-1][1]["progress"] == 25
