"""T1 — durcissement audit #1 : les 3 bombes + event loop.

Chaque test prouve un bug MORT :
- R1  boot ne wipe plus les checklist_items (états utilisateur C12)
- R2  /auth/sync ne permet pas le self-upgrade de plan
- R10 sanitation du filename dans FileStorage (anti path-traversal)
- R7  upload mono-fichier déporté hors de l'event loop (to_thread)
"""
import asyncio
import io
import threading

from services.file_storage import FileStorage, UPLOADS_ROOT


# ── R10 : sanitation filename ─────────────────────────────────────────────
def test_safe_filename_strips_path_traversal():
    from services.file_storage import _safe_filename
    assert _safe_filename("../../evil.pdf") == "evil.pdf"
    assert _safe_filename("/etc/passwd") == "passwd"
    assert _safe_filename("..\\..\\evil.pdf") == "evil.pdf"
    assert _safe_filename("normal.pdf") == "normal.pdf"
    assert _safe_filename("") == "file"
    assert _safe_filename("..") == "file"


def test_upload_traversal_filename_stays_in_prefix():
    st = FileStorage()
    url = asyncio.run(st.upload(b"x", "../../../evil.pdf", "projects/ttest-r10/dce"))
    assert url.startswith("/uploads/projects/ttest-r10/dce/")
    assert ".." not in url
    written = UPLOADS_ROOT / url.removeprefix("/uploads/")
    base = (UPLOADS_ROOT / "projects/ttest-r10/dce").resolve()
    assert written.resolve().is_relative_to(base)
    written.unlink(missing_ok=True)


# ── R7 : copie disque hors event loop ─────────────────────────────────────
def test_upload_offloads_blocking_io_to_thread():
    st = FileStorage()
    main_thread = threading.current_thread()
    seen = {}
    orig = st._upload_local

    def spy(content, key):
        seen["thread"] = threading.current_thread()
        return orig(content, key)

    st._upload_local = spy
    url = asyncio.run(st.upload(b"hello", "hb.txt", "projects/ttest-r7/tmp"))
    assert seen["thread"] is not main_thread, "la copie disque doit tourner hors du thread de l'event loop"
    (UPLOADS_ROOT / url.removeprefix("/uploads/")).unlink(missing_ok=True)


def test_upload_stream_offloads_blocking_io_to_thread():
    st = FileStorage()
    main_thread = threading.current_thread()
    seen = {}
    orig = st._upload_local_stream

    def spy(fileobj, key):
        seen["thread"] = threading.current_thread()
        return orig(fileobj, key)

    st._upload_local_stream = spy
    url = asyncio.run(st.upload_stream(io.BytesIO(b"hello"), "hb.txt", "projects/ttest-r7b/tmp"))
    assert seen["thread"] is not main_thread
    (UPLOADS_ROOT / url.removeprefix("/uploads/")).unlink(missing_ok=True)


# ── R1 : boot ne wipe plus les checklist_items ────────────────────────────
def test_boot_migration_preserves_checklist_items(db_session):
    import main
    from models.checklist_item import ChecklistItem

    ci = ChecklistItem(
        project_id="proj-r1",
        document_type_required="Kbis",
        signature_confirmed=True,
    )
    db_session.add(ci)
    db_session.commit()
    cid = ci.id

    # (re)démarrage simulé : la routine schema ne doit RIEN effacer.
    main._ensure_schema_columns()

    assert db_session.query(ChecklistItem).filter_by(id=cid).first() is not None, (
        "un redémarrage ne doit jamais effacer les checklist_items "
        "(signature_confirmed C12, statuts, liens coffre-fort)"
    )


# ── R2 : pas de self-upgrade de plan via /auth/sync ───────────────────────
def test_auth_sync_never_changes_plan(client, test_org, db_session):
    from models.organization import Organization

    assert test_org.plan == "free"
    resp = client.post("/api/auth/sync", json={"plan": "business"})
    assert resp.status_code in (200, 422), resp.text

    db_session.expire_all()
    org = db_session.query(Organization).filter_by(id=test_org.id).first()
    assert org.plan == "free", "POST /auth/sync ne doit JAMAIS modifier le plan"
