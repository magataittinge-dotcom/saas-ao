"""La connexion à la base est rendue avant l'envoi d'un fichier ou d'un flux.

Depuis FastAPI 0.118, une dépendance `yield` de portée « request » (celle de
`get_db`) n'est fermée qu'APRÈS l'envoi complet de la réponse. En production,
nginx relaie l'API sans tampon (`proxy_buffering off`, docs/DEPLOYMENT.md) :
l'envoi suit le débit du client, et chaque téléchargement en cours (PDF ouvert
par « Voir dans le DCE », ZIP de l'export) garderait une connexion du pool
(15 au plus) jusqu'au bout. FastAPI 0.111 fermait la session avant l'envoi ;
les routes de fichiers rendent désormais la connexion elles-mêmes.

On pilote l'appli ASGI directement : au premier morceau du corps envoyé, la
route n'a pas fini d'envoyer (les middlewares relaient sans tampon), et l'on
compte les connexions sorties du pool.
"""
from urllib.parse import urlparse

import anyio
import pytest

from main import app
from models.project import Project


def _premier_envoi(chemin: str, query: str = "") -> dict:
    """Appelle l'appli ; renvoie le statut et les connexions tenues au 1er morceau du corps."""
    from database import engine

    etat: dict = {}

    async def principal():
        fini = anyio.Event()
        requete_lue = False

        async def receive():
            nonlocal requete_lue
            if not requete_lue:
                requete_lue = True
                return {"type": "http.request", "body": b"", "more_body": False}
            await fini.wait()  # le client reste connecté jusqu'à la fin de la réponse
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                etat["statut"] = message["status"]
            elif message["type"] == "http.response.body":
                etat.setdefault("tenues", engine.pool.checkedout())
                if not message.get("more_body", False):
                    fini.set()

        await app(scope, receive, send)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "GET", "scheme": "http", "path": chemin, "raw_path": chemin.encode(),
        "root_path": "", "query_string": query.encode(), "headers": [(b"host", b"testserver")],
        "client": ("127.0.0.1", 50000), "server": ("testserver", 80),
    }
    etat["avant"] = engine.pool.checkedout()
    anyio.run(principal)
    return etat


def _liberer_la_session_du_test(db_session, test_user) -> None:
    """La session du test ne garde aucune connexion : seule celle de la requête
    est comptée. L'utilisateur rendu par l'authentification simulée reste chargé."""
    db_session.refresh(test_user)
    db_session.expunge(test_user)
    db_session.close()


@pytest.fixture
def uploads(tmp_path, monkeypatch):
    from routers import file_serve
    monkeypatch.setattr(file_serve, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def test_pdf_servi_sans_tenir_de_connexion(client, db_session, test_user, uploads):
    from services.file_storage import sign_file_path

    org_id = test_user.organization_id
    db_session.add(Project(id="p-envoi", organization_id=org_id, name="Envoi"))
    db_session.commit()
    _liberer_la_session_du_test(db_session, test_user)
    rel = "projects/p-envoi/dce/plan.pdf"
    (uploads / rel).parent.mkdir(parents=True)
    (uploads / rel).write_bytes(b"%PDF-1.4\n" + b"0" * (512 * 1024))  # 8 morceaux de 64 Ko
    url = urlparse(sign_file_path(rel, org_id=org_id))

    etat = _premier_envoi(url.path, url.query)

    assert etat["statut"] == 200, etat
    assert etat["tenues"] == etat["avant"], f"connexion tenue pendant l'envoi : {etat}"


def test_zip_exporte_sans_tenir_de_connexion(client, db_session, test_user):
    db_session.add(Project(id="p-zip", organization_id=test_user.organization_id, name="Export"))
    db_session.commit()
    _liberer_la_session_du_test(db_session, test_user)

    etat = _premier_envoi("/api/projects/p-zip/export/zip")

    assert etat["statut"] == 200, etat
    assert etat["tenues"] == etat["avant"], f"connexion tenue pendant l'envoi : {etat}"
