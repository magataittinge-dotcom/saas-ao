"""Soft-delete behaviour for project, document, reference."""
from datetime import datetime

from models.document import Document
from models.project import Project
from models.reference import Reference


# ─── Project ─────────────────────────────────────────────────────────────────

def test_delete_project_sets_deleted_at(client, db_session, test_org):
    p = Project(id="proj-soft", organization_id=test_org.id, name="X")
    db_session.add(p)
    db_session.commit()

    resp = client.delete(f"/api/projects/{p.id}")
    assert resp.status_code == 204
    db_session.refresh(p)
    assert p.deleted_at is not None


def test_list_projects_hides_soft_deleted_by_default(client, db_session, test_org):
    db_session.add_all([
        Project(id="p1", organization_id=test_org.id, name="alive"),
        Project(id="p2", organization_id=test_org.id, name="dead",
                deleted_at=datetime.utcnow()),
    ])
    db_session.commit()

    resp = client.get("/api/projects")
    names = [p["name"] for p in resp.json()]
    assert "alive" in names
    assert "dead" not in names


def test_list_projects_include_deleted_returns_them(client, db_session, test_org):
    db_session.add_all([
        Project(id="p1", organization_id=test_org.id, name="alive"),
        Project(id="p2", organization_id=test_org.id, name="dead",
                deleted_at=datetime.utcnow()),
    ])
    db_session.commit()

    resp = client.get("/api/projects?include_deleted=true")
    names = [p["name"] for p in resp.json()]
    assert "alive" in names
    assert "dead" in names


def test_get_soft_deleted_project_returns_404(client, db_session, test_org):
    p = Project(id="zombie", organization_id=test_org.id, name="ghost",
                deleted_at=datetime.utcnow())
    db_session.add(p)
    db_session.commit()

    resp = client.get(f"/api/projects/{p.id}")
    assert resp.status_code == 404


def test_restore_project(client, db_session, test_org):
    p = Project(id="resu", organization_id=test_org.id, name="back",
                deleted_at=datetime.utcnow())
    db_session.add(p)
    db_session.commit()

    resp = client.post(f"/api/projects/{p.id}/restore")
    assert resp.status_code == 200
    db_session.refresh(p)
    assert p.deleted_at is None


def test_restore_non_deleted_project_returns_400(client, db_session, test_org):
    p = Project(id="ok", organization_id=test_org.id, name="alive")
    db_session.add(p)
    db_session.commit()

    resp = client.post(f"/api/projects/{p.id}/restore")
    assert resp.status_code == 400


# ─── Vault Documents ─────────────────────────────────────────────────────────

def test_delete_document_sets_deleted_at(client, db_session, test_org):
    d = Document(
        id="d-soft", organization_id=test_org.id, type="urssaf",
        file_url="x", file_name="x.pdf", status="valid",
    )
    db_session.add(d)
    db_session.commit()

    resp = client.delete(f"/api/documents/{d.id}")
    assert resp.status_code == 204
    db_session.refresh(d)
    assert d.deleted_at is not None


def test_list_documents_hides_soft_deleted(client, db_session, test_org):
    db_session.add_all([
        Document(id="dA", organization_id=test_org.id, type="urssaf",
                 file_url="a", file_name="a.pdf", status="valid"),
        Document(id="dB", organization_id=test_org.id, type="urssaf",
                 file_url="b", file_name="b.pdf", status="valid",
                 deleted_at=datetime.utcnow()),
    ])
    db_session.commit()

    resp = client.get("/api/documents")
    ids = [d["id"] for d in resp.json()]
    assert "dA" in ids
    assert "dB" not in ids


# ─── References ──────────────────────────────────────────────────────────────

def test_delete_reference_sets_deleted_at(client, db_session, test_org):
    r = Reference(id="ref-soft", organization_id=test_org.id, intitule="x")
    db_session.add(r)
    db_session.commit()

    resp = client.delete(f"/api/references/{r.id}")
    assert resp.status_code == 204
    db_session.refresh(r)
    assert r.deleted_at is not None
