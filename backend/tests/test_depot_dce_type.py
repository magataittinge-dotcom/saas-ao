"""Dépôt du DCE (POST /api/projects/{id}/documents) : même contrôle de type que
les autres dépôts (B8).

Avant : une extension hors liste répondait 400, et le contenu réel n'était pas
contrôlé (un exécutable renommé .pdf ou .zip entrait dans le DCE).
Maintenant : 415 pour une extension hors liste ou un contenu qui ne correspond
pas à l'extension (octets magiques). Plafond inchangé : 2 Go.
"""
import pytest

import routers.projects as projects_mod
from models.project import Project, ProjectDocument

EXECUTABLE = b"MZ\x90\x00" + b"\x00" * 60 + b"PE\x00\x00"


@pytest.fixture
def projet(db_session, test_org, tmp_path, monkeypatch):
    import services.file_storage as fs
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    db_session.add(Project(id="proj-dce-type", organization_id=test_org.id, name="DCE"))
    db_session.commit()
    return "proj-dce-type"


def _deposer(client, pid, nom, contenu):
    return client.post(f"/api/projects/{pid}/documents",
                       files={"file": (nom, contenu, "application/octet-stream")})


def _rien_depose(db, racine, pid):
    assert db.query(ProjectDocument).filter(ProjectDocument.project_id == pid).count() == 0
    assert not [p for p in racine.rglob("*") if p.is_file()]


def test_extension_hors_liste_refusee_415(client, db_session, projet, tmp_path):
    resp = _deposer(client, projet, "outil.exe", EXECUTABLE)
    assert resp.status_code == 415, resp.text
    assert resp.json()["detail"].startswith("Type de fichier non autorisé : .exe.")
    assert "Formats acceptés" in resp.json()["detail"]
    _rien_depose(db_session, tmp_path, projet)


@pytest.mark.parametrize("nom", ["CCTP.pdf", "DPGF.xlsx", "AE.doc", "DCE complet.zip", "plan.png"])
def test_contenu_qui_ne_correspond_pas_refuse_415(client, db_session, projet, tmp_path, nom):
    resp = _deposer(client, projet, nom, EXECUTABLE)
    assert resp.status_code == 415, resp.text
    assert "ne correspond pas à son extension" in resp.json()["detail"]
    _rien_depose(db_session, tmp_path, projet)


def test_pdf_valide_accepte(client, db_session, projet):
    resp = _deposer(client, projet, "RC.pdf", b"%PDF-1.4\n" + b"x" * 2048)
    assert resp.status_code == 200, resp.text


def test_plafond_inchange():
    assert projects_mod._MAX_UPLOAD_SIZE == 2 * 1024 ** 3
