"""T4 — R8 : parses bloquants (openpyxl/xlrd, PyMuPDF, extraction docx/pdf)
appelés depuis un handler ``async def`` étranglaient l'event-loop (règle WSL2 :
tout appel bloquant doit passer par ``asyncio.to_thread``).

Preuve déterministe — la fonction de parse est patchée par une sonde qui
appelle ``asyncio.get_running_loop()`` :
  • si elle tourne SUR le thread de l'event-loop (BUG) → succès → 'loop'
  • si elle tourne sur un thread worker (via to_thread) → RuntimeError → 'worker'

Chaque test affirme que le parse ne s'exécute JAMAIS sur l'event-loop.
"""
import asyncio
import io
from pathlib import Path

import fitz
import httpx
from httpx import ASGITransport

from database import SessionLocal, get_db
from main import app
from models.checklist_item import ChecklistItem
from models.project import Project, ProjectDocument
from routers.auth import get_auth_user


# ─── Sonde event-loop ────────────────────────────────────────────────────────

def _loop_probe(record, retval):
    """Renvoie un spy qui note où il s'exécute puis retourne ``retval``."""
    def _spy(*args, **kwargs):
        try:
            asyncio.get_running_loop()
            record.append("loop")     # sur l'event-loop → parse bloquant
        except RuntimeError:
            record.append("worker")   # sur un thread worker → déporté
        return retval
    return _spy


def _make_async(retval):
    async def _coro(*args, **kwargs):
        return retval
    return _coro


def _run(coro):
    return asyncio.run(coro)


async def _request(method, url, **kw):
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.request(method, url, **kw)


def _override_auth(test_user):
    def _get_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_auth_user] = lambda: test_user


def _clear_overrides():
    app.dependency_overrides.clear()


# ─── 1. POST /api/memoire-config/import → DocumentProcessor.extract ───────────

def test_memoire_import_parse_runs_off_loop(db_session, test_org, test_user, monkeypatch):
    from routers import memoire_config as mc

    record = []
    monkeypatch.setattr(mc.DocumentProcessor, "extract",
                        _loop_probe(record, ("x" * 200, {})))
    monkeypatch.setattr(mc.MemoireImporter, "extract", _make_async({"champ": "v"}))

    _override_auth(test_user)
    try:
        resp = _run(_request(
            "POST", "/api/memoire-config/import",
            files={"file": ("memoire.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        ))
    finally:
        _clear_overrides()

    assert resp.status_code == 200, resp.text
    assert record == ["worker"], f"extract a tourné sur {record} (attendu ['worker'])"


# ─── 2. GET /api/files/view/... → PdfHighlighter.highlight_text_in_pdf ────────

def test_view_file_highlight_runs_off_loop(db_session, test_org, test_user, monkeypatch, tmp_path):
    from routers import file_serve as fs
    from services.file_storage import sign_file_path

    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    target = tmp_path / "projects" / "proj-r8" / "dce" / "RC.pdf"
    target.parent.mkdir(parents=True)
    doc = fitz.open()
    doc.new_page().insert_text((72, 100), "Article 1 — objet du marché")
    target.write_bytes(doc.tobytes())
    doc.close()

    db_session.add(Project(id="proj-r8", organization_id=test_org.id, name="R8"))
    db_session.commit()

    record = []
    monkeypatch.setattr(fs.PdfHighlighter, "highlight_text_in_pdf",
                        _loop_probe(record, target))

    signed = sign_file_path("projects/proj-r8/dce/RC.pdf", org_id=test_org.id)
    url = f"{signed}&page=1&highlight=Article%201"

    _override_auth(test_user)
    try:
        resp = _run(_request("GET", url))
    finally:
        _clear_overrides()

    assert resp.status_code == 200, resp.text
    assert record == ["worker"], f"highlight a tourné sur {record} (attendu ['worker'])"


# ─── 3. POST /api/projects/{id}/dpgf-upload → check_dpgf ──────────────────────

def test_upload_filled_dpgf_check_runs_off_loop(db_session, test_org, test_user, monkeypatch, tmp_path):
    from routers import export

    db_session.add(Project(id="proj-r8b", organization_id=test_org.id, name="R8b"))
    db_session.commit()

    local = tmp_path / "dpgf.xlsx"
    local.write_bytes(b"fake-xlsx")

    valid = {"valid": True, "warnings": [], "total_ht": None,
             "nb_lignes": 0, "nb_lignes_remplies": 0, "nb_lignes_vides": 0}
    record = []
    monkeypatch.setattr(export._storage, "upload", _make_async("/uploads/dpgf.xlsx"))
    monkeypatch.setattr(export, "_resolve_local_path", lambda url: local)
    monkeypatch.setattr(export, "check_dpgf", _loop_probe(record, valid))

    _override_auth(test_user)
    try:
        resp = _run(_request(
            "POST", "/api/projects/proj-r8b/dpgf-upload",
            files={"file": ("dpgf.xlsx", io.BytesIO(b"fake-xlsx"),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        ))
    finally:
        _clear_overrides()

    assert resp.status_code == 200, resp.text
    assert record == ["worker"], f"check_dpgf a tourné sur {record} (attendu ['worker'])"


# ─── 4. POST /api/projects/{id}/checklist/{item}/upload-completed → check_dpgf ─

def test_upload_completed_template_check_runs_off_loop(db_session, test_org, test_user, monkeypatch, tmp_path):
    import routers.candidature as cand
    import services.dpgf_checker as dpgf_checker

    monkeypatch.setattr(cand, "UPLOADS_ROOT", tmp_path)

    db_session.add(Project(id="proj-r8c", organization_id=test_org.id, name="R8c"))
    db_session.add(ProjectDocument(id="pd-dpgf", project_id="proj-r8c",
                                   type="dpgf_template", file_url="/x", file_name="dpgf.xlsx"))
    db_session.add(ChecklistItem(id="cli-dpgf", project_id="proj-r8c",
                                 document_type_required="dpgf_template",
                                 source_kind="dce_template",
                                 template_project_doc_id="pd-dpgf", status="manquant"))
    db_session.commit()

    valid = {"valid": True, "warnings": [], "nb_lignes_vides": 0}
    record = []
    # le handler fait `from services.dpgf_checker import check_dpgf` → patcher la source
    monkeypatch.setattr(dpgf_checker, "check_dpgf", _loop_probe(record, valid))

    _override_auth(test_user)
    try:
        resp = _run(_request(
            "POST", "/api/projects/proj-r8c/checklist/cli-dpgf/upload-completed",
            files={"file": ("dpgf.xlsx", io.BytesIO(b"fake-xlsx"),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        ))
    finally:
        _clear_overrides()

    assert resp.status_code == 200, resp.text
    assert record == ["worker"], f"check_dpgf a tourné sur {record} (attendu ['worker'])"
