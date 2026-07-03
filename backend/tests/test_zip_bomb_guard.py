"""
Tests anti-zip-bomb sur POST /projects/{id}/documents (upload ZIP).

Trois gardes (C21) :
  1. Ratio de décompression max (déclaré décompressé / compressé > 100:1
     au-delà d'un plancher de taille déclarée) → 413.
  2. Cap sur la taille cumulée décompressée (toutes profondeurs) → 413.
  3. Cap sur le nombre de fichiers contenus → 413.

Le rejet doit être propre : aucun ProjectDocument persisté, aucun fichier
laissé sur le disque, message d'erreur clair en français.
"""
import io
import os
import zipfile

import pytest

import routers.projects as projects_mod
from models.project import Project, ProjectDocument


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_project(db_session, test_org, pid: str = "proj-zipbomb-1") -> Project:
    p = Project(id=pid, organization_id=test_org.id, name="Zip bomb guard test")
    db_session.add(p)
    db_session.commit()
    return p


def _build_zip(entries: dict, compression=zipfile.ZIP_DEFLATED) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _upload_zip(client, project_id: str, payload: bytes):
    return client.post(
        f"/api/projects/{project_id}/documents",
        files={"file": ("dce.zip", payload, "application/zip")},
    )


def _assert_clean_rejection(resp, db_session, project_id: str, uploads_root):
    """Rejet propre : 413, message FR clair, ni docs en DB ni fichiers sur disque."""
    assert resp.status_code == 413, resp.text
    detail = resp.json()["detail"]
    assert "rchive" in detail  # « Archive » ou « archive » — message clair FR
    assert db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id,
    ).count() == 0
    leftover = [p for p in uploads_root.rglob("*") if p.is_file()]
    assert leftover == [], f"fichiers orphelins laissés sur disque : {leftover}"


@pytest.fixture
def patched_storage(tmp_path, monkeypatch):
    """Redirige la racine uploads + désactive le rate-limiter pour les tests."""
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)

    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)

    from main import app
    if hasattr(app.state, "limiter"):
        monkeypatch.setattr(app.state.limiter, "enabled", False, raising=False)

    return tmp_path


# ─── Garde 1 : ratio de décompression extrême ────────────────────────────────

def test_extreme_ratio_zip_rejected(client, db_session, test_org, patched_storage):
    """12 Mo de zéros → ~12 Ko compressé (ratio ~1000:1) : rejeté en 413,
    sans monkeypatch — les seuils par défaut doivent suffire."""
    project = _make_project(db_session, test_org)

    payload = _build_zip({"bomb.pdf": b"\x00" * (12 * 1024 * 1024)})
    assert len(payload) < 100 * 1024  # sanity : l'archive est bien minuscule

    resp = _upload_zip(client, project.id, payload)
    _assert_clean_rejection(resp, db_session, project.id, patched_storage)


def test_nested_zip_bomb_rejected_with_cleanup(
    client, db_session, test_org, patched_storage,
):
    """Bombe dans un ZIP imbriqué : rejet global + cleanup des fichiers déjà
    extraits de l'archive externe (rien ne doit rester en DB ni sur disque)."""
    project = _make_project(db_session, test_org)

    inner_bomb = _build_zip({"bomb.pdf": b"\x00" * (12 * 1024 * 1024)})
    outer = _build_zip({
        "RC.pdf": b"%PDF-1.4\n" + os.urandom(2048),   # extrait AVANT la bombe
        "lot1/sous_dossier.zip": inner_bomb,
    })

    resp = _upload_zip(client, project.id, outer)
    _assert_clean_rejection(resp, db_session, project.id, patched_storage)


# ─── Garde 2 : cap taille cumulée décompressée ───────────────────────────────

def test_cumulative_uncompressed_cap_rejected(
    client, db_session, test_org, patched_storage, monkeypatch,
):
    """Données incompressibles (ratio ~1:1) mais cumul décompressé > cap → 413."""
    project = _make_project(db_session, test_org)

    monkeypatch.setattr(projects_mod, "_ZIP_MAX_TOTAL_UNCOMPRESSED", 64 * 1024)
    payload = _build_zip({
        "a.pdf": b"%PDF-1.4\n" + os.urandom(48 * 1024),
        "b.pdf": b"%PDF-1.4\n" + os.urandom(48 * 1024),
    })

    resp = _upload_zip(client, project.id, payload)
    _assert_clean_rejection(resp, db_session, project.id, patched_storage)


# ─── Garde 3 : cap nombre de fichiers ────────────────────────────────────────

def test_too_many_files_rejected(
    client, db_session, test_org, patched_storage, monkeypatch,
):
    project = _make_project(db_session, test_org)

    monkeypatch.setattr(projects_mod, "_ZIP_MAX_FILES", 3)
    payload = _build_zip({
        f"doc_{i}.pdf": b"%PDF-1.4\n" + os.urandom(512) for i in range(5)
    })

    resp = _upload_zip(client, project.id, payload)
    _assert_clean_rejection(resp, db_session, project.id, patched_storage)


# ─── Enforcement streaming : en-tête qui ment sur la taille ──────────────────

def test_lying_member_size_caught_during_streaming():
    """La copie bornée doit rejeter un flux qui produit plus d'octets que la
    taille déclarée dans l'en-tête ZIP (bombe à data-descriptor falsifié)."""
    from routers.projects import ZipBombError, _copy_zip_member_bounded, _ZipBudget

    budget = _ZipBudget()
    src = io.BytesIO(b"\x00" * (100 * 1024))  # 100 Ko réels
    dst = io.BytesIO()

    with pytest.raises(ZipBombError):
        _copy_zip_member_bounded(src, dst, declared_size=10 * 1024, budget=budget)


def test_bounded_copy_passes_honest_member():
    from routers.projects import _copy_zip_member_bounded, _ZipBudget

    budget = _ZipBudget()
    data = b"%PDF-1.4\n" + os.urandom(8 * 1024)
    src, dst = io.BytesIO(data), io.BytesIO()

    _copy_zip_member_bounded(src, dst, declared_size=len(data), budget=budget)
    assert dst.getvalue() == data
    assert budget.written_bytes == len(data)


# ─── Happy path : un DCE normal passe toujours ───────────────────────────────

def test_normal_dce_zip_passes(client, db_session, test_org, patched_storage):
    """ZIP réaliste (type Gueux : RC + CCAP + plans en sous-dossier) → 200,
    tous les documents créés."""
    project = _make_project(db_session, test_org)

    payload = _build_zip({
        "RC.pdf": b"%PDF-1.4\n" + os.urandom(4096),
        "CCAP.pdf": b"%PDF-1.4\n" + os.urandom(4096),
        "plans/plan_rdc.pdf": b"%PDF-1.4\n" + os.urandom(4096),
        "DPGF_lot2.xlsx": os.urandom(2048),
    })

    resp = _upload_zip(client, project.id, payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["extracted_count"] == 4
    names = {d.file_name for d in db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == project.id,
    ).all()}
    assert names == {"RC.pdf", "CCAP.pdf", "plan_rdc.pdf", "DPGF_lot2.xlsx"}


def test_normal_nested_zip_passes(client, db_session, test_org, patched_storage):
    """ZIP imbriqué légitime (lot dans un sous-zip) → toujours accepté."""
    project = _make_project(db_session, test_org)

    inner = _build_zip({"CCTP_lot1.pdf": b"%PDF-1.4\n" + os.urandom(4096)})
    outer = _build_zip({
        "RC.pdf": b"%PDF-1.4\n" + os.urandom(4096),
        "lot1.zip": inner,
    })

    resp = _upload_zip(client, project.id, outer)
    assert resp.status_code == 200, resp.text
    assert resp.json()["extracted_count"] == 2
