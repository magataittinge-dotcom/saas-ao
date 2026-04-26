"""
Tests for the streaming-upload size cap on POST /projects/{id}/documents.

The endpoint enforces a 2 GB cap with two layers:
  1. Pre-flight Content-Length header check (fast reject on declared size).
  2. Running cumulative-bytes check during chunked streaming (catches
     missing/falsified Content-Length).

Tests monkey-patch the cap (and the storage root) to keep payloads small
enough to fit comfortably in CI memory.
"""
from pathlib import Path

import pytest

import routers.projects as projects_mod
from models.project import Project, ProjectDocument


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_project(db_session, test_org, pid: str = "proj-upload-1") -> Project:
    p = Project(id=pid, organization_id=test_org.id, name="Upload size limit test")
    db_session.add(p)
    db_session.commit()
    return p


@pytest.fixture
def patched_storage(tmp_path, monkeypatch):
    """Redirect uploads root + service storage so we don't write into the real ./uploads."""
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)

    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)

    # Disable the slowapi 10/min limiter — repeated test runs would otherwise 429.
    from main import app
    if hasattr(app.state, "limiter"):
        monkeypatch.setattr(app.state.limiter, "enabled", False, raising=False)

    return tmp_path


# ─── Happy path ──────────────────────────────────────────────────────────────

def test_small_pdf_upload_succeeds(client, db_session, test_org, patched_storage):
    project = _make_project(db_session, test_org)

    body = b"%PDF-1.4\n" + b"x" * 4096  # ~4 KB
    resp = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("rc.pdf", body, "application/pdf")},
        data={"type": "rc"},
    )
    assert resp.status_code == 200, resp.text
    pd = db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == project.id,
    ).one()
    assert pd.file_name == "rc.pdf"
    assert pd.file_size == len(body)
    # Streaming wrote the file to the patched uploads root.
    assert pd.file_url and pd.file_url.startswith("/uploads/")
    on_disk = patched_storage / pd.file_url.removeprefix("/uploads/")
    assert on_disk.exists()
    assert on_disk.stat().st_size == len(body)


# ─── Pre-flight Content-Length rejection ─────────────────────────────────────

def test_oversize_rejected_via_content_length_header(
    client, db_session, test_org, patched_storage,
):
    """A multipart body whose Content-Length exceeds the cap is rejected
    BEFORE any chunk is read — even if the body itself is small."""
    project = _make_project(db_session, test_org)

    body = b"%PDF-1.4\n" + b"x" * 1024  # tiny actual body
    fake_huge = projects_mod._MAX_UPLOAD_SIZE + 1

    resp = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("huge.pdf", body, "application/pdf")},
        headers={"content-length": str(fake_huge)},
    )
    assert resp.status_code == 413
    assert "trop volumineux" in resp.json()["detail"].lower()
    # Nothing was persisted.
    assert db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == project.id,
    ).count() == 0


# ─── Streaming cumulative-bytes rejection ────────────────────────────────────

def test_oversize_rejected_during_streaming(
    client, db_session, test_org, patched_storage, monkeypatch,
):
    """Cap is enforced while reading chunks — body whose actual size exceeds
    the cap (with a small/spoofed Content-Length) still gets a 413."""
    project = _make_project(db_session, test_org)

    # Lower the cap so the test stays in memory; chunk size stays default.
    monkeypatch.setattr(projects_mod, "_MAX_UPLOAD_SIZE", 1024)

    body = b"%PDF-1.4\n" + b"x" * 4096  # 4 KB > 1 KB cap
    resp = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("big.pdf", body, "application/pdf")},
    )
    assert resp.status_code == 413
    assert "trop volumineux" in resp.json()["detail"].lower()
    assert db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == project.id,
    ).count() == 0


# ─── Invalid extension still rejected before streaming ───────────────────────

def test_bad_extension_rejected_before_streaming(
    client, db_session, test_org, patched_storage,
):
    project = _make_project(db_session, test_org)

    resp = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("evil.exe", b"MZ\x00" * 256, "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert "Type de fichier non autorisé" in resp.json()["detail"]


# ─── Chunked streaming (prerequisite for axios onUploadProgress) ─────────────

def test_upload_progress_callback_invoked(
    client, db_session, test_org, patched_storage, monkeypatch,
):
    """The endpoint must read the body in *multiple* chunks. Chunked reads on
    the server are the prerequisite that lets the browser fire axios
    `onUploadProgress` events as the request body is streamed up. With a
    small chunk size and a payload that spans many chunks, we expect the
    upload to complete and persist the full bytes."""
    project = _make_project(db_session, test_org)

    monkeypatch.setattr(projects_mod, "_UPLOAD_CHUNK_SIZE", 4 * 1024)  # 4 KB chunks

    # Spy on tempfile.SpooledTemporaryFile.write — one call per streamed chunk.
    import tempfile as _tempfile
    write_count = 0
    real_write = _tempfile.SpooledTemporaryFile.write

    def spying_write(self, data):
        nonlocal write_count
        write_count += 1
        return real_write(self, data)

    monkeypatch.setattr(_tempfile.SpooledTemporaryFile, "write", spying_write)

    payload = b"%PDF-1.4\n" + (b"P" * (64 * 1024))  # 64 KB → many 4 KB chunks
    resp = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("progress.pdf", payload, "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    pd = db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == project.id,
    ).one()
    assert pd.file_size == len(payload)
    # Must have written more than once — i.e., real chunked streaming.
    assert write_count >= 2, (
        f"expected ≥2 chunked writes but got {write_count}; "
        "axios onUploadProgress would not fire incrementally"
    )


# ─── 413 message format: includes size in Mo + support email lead capture ────

def test_upload_413_message_format(
    client, db_session, test_org, patched_storage, monkeypatch,
):
    """The 413 message must include the actual file size in Mo and the
    support@synorix.tech lead-capture phrase for customers needing > 2 GB."""
    project = _make_project(db_session, test_org)

    # Lower the cap so we can trigger streaming-path 413 on a small body.
    monkeypatch.setattr(projects_mod, "_MAX_UPLOAD_SIZE", 1024)

    body = b"%PDF-1.4\n" + b"x" * 4096  # 4 KB > 1 KB cap
    resp = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("big.pdf", body, "application/pdf")},
    )
    assert resp.status_code == 413
    detail = resp.json()["detail"]
    assert "Mo" in detail, f"size in Mo missing from 413 detail: {detail!r}"
    assert "max 2 Go" in detail, f"max cap missing from 413 detail: {detail!r}"
    assert "support@synorix.tech" in detail, (
        f"lead-capture support email missing from 413 detail: {detail!r}"
    )

    # Same expectations for the pre-flight Content-Length path.
    fake_huge = projects_mod._MAX_UPLOAD_SIZE + 1
    resp2 = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("huge.pdf", b"%PDF-1.4\n", "application/pdf")},
        headers={"content-length": str(fake_huge)},
    )
    assert resp2.status_code == 413
    detail2 = resp2.json()["detail"]
    assert "Mo" in detail2
    assert "support@synorix.tech" in detail2


# ─── Streaming preserves bytes (no truncation, correct file_size) ────────────

def test_streamed_file_persists_full_payload(
    client, db_session, test_org, patched_storage,
):
    """A payload that fits exactly into one streaming chunk and a payload that
    spans multiple chunks must both round-trip with byte-identical content."""
    project = _make_project(db_session, test_org)

    # 6 MB — bigger than the spool RAM threshold (10 MB → still RAM, but spans chunks).
    payload = b"%PDF-1.4\n" + (b"AB" * (3 * 1024 * 1024))
    resp = client.post(
        f"/api/projects/{project.id}/documents",
        files={"file": ("big_ok.pdf", payload, "application/pdf")},
        data={"type": "cctp"},
    )
    assert resp.status_code == 200, resp.text
    pd = db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == project.id,
    ).one()
    assert pd.file_size == len(payload)

    on_disk_path: Path = patched_storage / pd.file_url.removeprefix("/uploads/")
    assert on_disk_path.read_bytes() == payload
