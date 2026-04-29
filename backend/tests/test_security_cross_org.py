"""Cross-org isolation tests.

These tests catch the most dangerous class of bug: an authenticated user
of org A accessing data from org B. The infrastructure that protects us is
`_get_project_or_404` (and equivalent filters in each router) — every
endpoint must scope its query by `user.organization_id`.

If a future refactor accidentally drops the org filter, one of these
tests will fail.
"""
import io
from datetime import datetime, date

import pytest
from fastapi.testclient import TestClient

from database import SessionLocal, get_db
from main import app
from models.organization import Organization
from models.user import User
from models.project import Project
from models.document import Document
from models.reference import Reference
from routers.auth import get_auth_user


@pytest.fixture
def two_orgs(db_session):
    """Create org A (the legitimate tenant) and org B (the attacker)."""
    org_a = Organization(id="org-A", name="A — Façade Pro")
    org_b = Organization(id="org-B", name="B — Maçonnerie SARL")
    db_session.add_all([org_a, org_b])
    db_session.commit()

    user_a = User(id="user-A", email="a@a.fr", name="Alice", organization_id="org-A")
    user_b = User(id="user-B", email="b@b.fr", name="Bob", organization_id="org-B")
    db_session.add_all([user_a, user_b])
    db_session.commit()
    return user_a, user_b


def _client_as(user):
    def _override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _override_auth():
        return user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_auth_user] = _override_auth
    return TestClient(app)


# ─── Project endpoints ────────────────────────────────────────────────────────

def test_user_b_cannot_read_user_a_project(db_session, two_orgs):
    user_a, user_b = two_orgs
    project_a = Project(id="proj-A", organization_id="org-A", name="MAS Caen")
    db_session.add(project_a)
    db_session.commit()

    app.dependency_overrides.clear()
    try:
        c_b = _client_as(user_b)
        resp = c_b.get(f"/api/projects/{project_a.id}")
        assert resp.status_code == 404, "B should not see A's project"
    finally:
        app.dependency_overrides.clear()


def test_user_b_cannot_delete_user_a_project(db_session, two_orgs):
    user_a, user_b = two_orgs
    project_a = Project(id="proj-A2", organization_id="org-A", name="Gymnase Lille")
    db_session.add(project_a)
    db_session.commit()

    try:
        c_b = _client_as(user_b)
        resp = c_b.delete(f"/api/projects/{project_a.id}")
        assert resp.status_code == 404
        # Ensure the project still exists and is not soft-deleted.
        db_session.refresh(project_a)
        assert project_a.deleted_at is None
    finally:
        app.dependency_overrides.clear()


def test_user_b_list_projects_excludes_org_a(db_session, two_orgs):
    user_a, user_b = two_orgs
    db_session.add_all([
        Project(id="proj-A3", organization_id="org-A", name="A Project"),
        Project(id="proj-B1", organization_id="org-B", name="B Project"),
    ])
    db_session.commit()

    try:
        c_b = _client_as(user_b)
        resp = c_b.get("/api/projects")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "B Project" in names
        assert "A Project" not in names
    finally:
        app.dependency_overrides.clear()


# ─── Vault documents ──────────────────────────────────────────────────────────

def test_user_b_cannot_delete_user_a_vault_doc(db_session, two_orgs):
    user_a, user_b = two_orgs
    doc_a = Document(
        id="doc-A", organization_id="org-A", type="urssaf",
        file_url="/uploads/organizations/org-A/vault/x.pdf", file_name="x.pdf",
        status="valid",
    )
    db_session.add(doc_a)
    db_session.commit()

    try:
        c_b = _client_as(user_b)
        resp = c_b.delete(f"/api/documents/{doc_a.id}")
        assert resp.status_code == 404
        db_session.refresh(doc_a)
        assert doc_a.deleted_at is None
    finally:
        app.dependency_overrides.clear()


# ─── References ───────────────────────────────────────────────────────────────

def test_user_b_cannot_patch_user_a_reference(db_session, two_orgs):
    user_a, user_b = two_orgs
    ref_a = Reference(
        id="ref-A", organization_id="org-A",
        intitule="Façade école",
    )
    db_session.add(ref_a)
    db_session.commit()

    try:
        c_b = _client_as(user_b)
        resp = c_b.patch(
            f"/api/references/{ref_a.id}",
            json={"intitule": "INJECTED BY B"},
        )
        assert resp.status_code == 404
        db_session.refresh(ref_a)
        assert ref_a.intitule == "Façade école"
    finally:
        app.dependency_overrides.clear()


# ─── File serve ───────────────────────────────────────────────────────────────

def test_user_b_cannot_view_user_a_project_file(db_session, two_orgs, tmp_path, monkeypatch):
    user_a, user_b = two_orgs
    project_a = Project(id="proj-X", organization_id="org-A", name="X")
    db_session.add(project_a)
    db_session.commit()

    # Plant a file under uploads/projects/proj-X/dce/ that B will try to fetch.
    from routers import file_serve as fs
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    target_dir = tmp_path / "projects" / "proj-X" / "dce"
    target_dir.mkdir(parents=True)
    secret = target_dir / "leaked.pdf"
    secret.write_bytes(b"%PDF-1.4 secret CCTP for org A")

    try:
        c_b = _client_as(user_b)
        resp = c_b.get(f"/api/files/view/projects/proj-X/dce/leaked.pdf")
        # Either 403 or 404 are acceptable; the point is no body leak.
        assert resp.status_code in (403, 404), resp.text
        assert b"secret CCTP" not in resp.content
    finally:
        app.dependency_overrides.clear()


def test_user_a_can_view_own_project_file(db_session, two_orgs, tmp_path, monkeypatch):
    user_a, user_b = two_orgs
    project_a = Project(id="proj-Y", organization_id="org-A", name="Y")
    db_session.add(project_a)
    db_session.commit()

    from routers import file_serve as fs
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    target_dir = tmp_path / "projects" / "proj-Y" / "dce"
    target_dir.mkdir(parents=True)
    secret = target_dir / "doc.pdf"
    secret.write_bytes(b"%PDF-1.4 my own CCTP")

    try:
        c_a = _client_as(user_a)
        resp = c_a.get(f"/api/files/view/projects/proj-Y/dce/doc.pdf")
        assert resp.status_code == 200
        assert b"my own CCTP" in resp.content
    finally:
        app.dependency_overrides.clear()


def test_path_traversal_blocked(db_session, two_orgs, tmp_path, monkeypatch):
    user_a, _ = two_orgs

    from routers import file_serve as fs
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    # The classic ../../../../etc/passwd attempt
    try:
        c = _client_as(user_a)
        resp = c.get("/api/files/view/projects/proj-A/../../../etc/passwd")
        assert resp.status_code in (403, 404)
    finally:
        app.dependency_overrides.clear()


def test_unknown_prefix_blocked(db_session, two_orgs):
    user_a, _ = two_orgs
    try:
        c = _client_as(user_a)
        resp = c.get("/api/files/view/somewhere/else/random.pdf")
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
