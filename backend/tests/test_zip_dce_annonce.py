"""Dépôt d'un ZIP du DCE : entrées et tailles annoncées comptées AVANT d'ouvrir l'archive.

Avant : _extract_zip_members ouvrait l'archive, puis comptait. Or zipfile charge
tout le répertoire de l'archive à l'ouverture : quelques dizaines de Mo
d'entrées vides font des centaines de Mo en mémoire, sur un serveur de 4 Go. Et
une archive imbriquée était lue en entier en mémoire.

Maintenant, la fin de l'archive et son répertoire sont lus directement
(garde_archives.annonce_archive), et les plafonds sont appliqués avant zipfile.
"""
import io
import zipfile

import pytest

import routers.projects as projects_mod
from models.project import Project, ProjectDocument


def _zip(entrees: dict) -> bytes:
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w", zipfile.ZIP_DEFLATED) as z:
        for nom, contenu in entrees.items():
            z.writestr(nom, contenu)
    return flux.getvalue()


@pytest.fixture
def projet(db_session, test_org, tmp_path, monkeypatch):
    import services.file_storage as fs
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    db_session.add(Project(id="proj-zip-annonce", organization_id=test_org.id, name="DCE"))
    db_session.commit()
    return "proj-zip-annonce"


@pytest.fixture
def ouvertures(monkeypatch):
    """Archives ouvertes en lecture par zipfile pendant le dépôt."""
    appels = []
    vraie = zipfile.ZipFile

    class _Espion(vraie):
        def __init__(self, fichier, mode="r", *a, **kw):
            if mode == "r":
                appels.append(fichier)
            super().__init__(fichier, mode, *a, **kw)

    monkeypatch.setattr(zipfile, "ZipFile", _Espion)
    return appels


def _deposer(client, pid, contenu):
    return client.post(f"/api/projects/{pid}/documents",
                       files={"file": ("DCE.zip", contenu, "application/zip")})


def _refus_propre(resp, db, pid, racine):
    assert resp.status_code == 413, resp.text
    assert "rchive" in resp.json()["detail"]
    assert db.query(ProjectDocument).filter(ProjectDocument.project_id == pid).count() == 0
    assert not [p for p in racine.rglob("*") if p.is_file()]


def test_trop_d_entrees_refuse_avant_ouverture(client, db_session, projet, tmp_path, ouvertures):
    contenu = _zip({f"pieces/{i}.pdf": b"%PDF-1.4" for i in range(projects_mod._ZIP_MAX_FILES + 1)})
    resp = _deposer(client, projet, contenu)
    _refus_propre(resp, db_session, projet, tmp_path)
    assert ouvertures == []                   # répertoire jamais chargé par zipfile                       # répertoire jamais chargé par zipfile


def test_taille_decompressee_annoncee_refusee_avant_ouverture(
        client, db_session, projet, tmp_path, monkeypatch, ouvertures):
    monkeypatch.setattr(projects_mod, "_ZIP_MAX_TOTAL_UNCOMPRESSED", 1024 * 1024)
    contenu = _zip({"plans/plan.pdf": b"%PDF-1.4" + b"\x00" * (2 * 1024 * 1024)})
    resp = _deposer(client, projet, contenu)
    _refus_propre(resp, db_session, projet, tmp_path)
    assert ouvertures == []


def test_zip64_de_65536_entrees_refuse_avant_ouverture(client, db_session, projet, tmp_path,
                                                       ouvertures):
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:      # au-delà de 65 535 : fin d'archive ZIP64
        for i in range(65_536):
            z.writestr(f"x/{i}", b"")
    resp = _deposer(client, projet, flux.getvalue())
    _refus_propre(resp, db_session, projet, tmp_path)
    assert ouvertures == []                   # répertoire jamais chargé par zipfile


def test_annonce_lue_comme_zipfile():
    from services.garde_archives import annonce_archive
    contenu = _zip({"a.pdf": b"%PDF-1.4" + b"a" * 5000, "b/c.docx": b"PK" + b"b" * 300})
    infos = zipfile.ZipFile(io.BytesIO(contenu)).infolist()
    assert annonce_archive(io.BytesIO(contenu)) == (
        len(infos), sum(i.file_size for i in infos), sum(i.compress_size for i in infos))


def test_zip_normal_et_archive_imbriquee_acceptes(client, db_session, projet):
    interne = _zip({"lot 05/CCTP lot 05.pdf": b"%PDF-1.4 cctp"})
    contenu = _zip({"RC.pdf": b"%PDF-1.4 rc", "lots.zip": interne})
    resp = _deposer(client, projet, contenu)
    assert resp.status_code == 200, resp.text
    noms = {d.file_name for d in db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == projet)}
    assert {"RC.pdf", "CCTP lot 05.pdf"} <= noms
