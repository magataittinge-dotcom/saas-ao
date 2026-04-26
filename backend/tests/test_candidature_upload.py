"""
Tests for the candidature checklist endpoints:
- POST /projects/{project_id}/checklist/{item_id}/upload-completed
- PUT  /projects/{project_id}/checklist/{item_id}/link
"""
import io
from pathlib import Path

import pytest

from models.checklist_item import ChecklistItem
from models.document import Document
from models.project import Project, ProjectDocument


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_project(db_session, test_org, pid="proj-cand-1"):
    p = Project(id=pid, organization_id=test_org.id, name="Test AO Candidature")
    db_session.add(p)
    db_session.commit()
    return p


def _make_template(db_session, project, doc_type="dc1_template"):
    pd = ProjectDocument(
        id=f"pd-{doc_type}",
        project_id=project.id,
        type=doc_type,
        file_url=f"/uploads/{doc_type}.pdf",
        file_name=f"{doc_type}.pdf",
    )
    db_session.add(pd)
    db_session.commit()
    return pd


def _make_dce_item(db_session, project, template, item_id="cli-dc1"):
    item = ChecklistItem(
        id=item_id,
        project_id=project.id,
        document_type_required=template.type,
        source_kind="dce_template",
        template_project_doc_id=template.id,
        status="manquant",
    )
    db_session.add(item)
    db_session.commit()
    return item


def _make_vault_item(db_session, project, doc_type="kbis", item_id="cli-kbis"):
    item = ChecklistItem(
        id=item_id,
        project_id=project.id,
        document_type_required=doc_type,
        source_kind="vault",
        status="manquant",
    )
    db_session.add(item)
    db_session.commit()
    return item


def _make_vault_doc(db_session, test_org, doc_type="kbis", status="valid"):
    d = Document(
        id=f"vault-{doc_type}",
        organization_id=test_org.id,
        type=doc_type,
        file_url=f"/uploads/vault/{doc_type}.pdf",
        file_name=f"{doc_type}.pdf",
        status=status,
    )
    db_session.add(d)
    db_session.commit()
    return d


# ─── upload-completed: success ───────────────────────────────────────────────

def test_upload_completed_success(client, db_session, test_org, tmp_path, monkeypatch):
    # Redirect uploads to a tmp dir so we don't write into the real ./uploads.
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)

    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "dc1_template")
    item = _make_dce_item(db_session, project, tpl)

    resp = client.post(
        f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
        files={"file": ("DC1_signe.pdf", b"%PDF-1.4 fake content", "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "present"
    assert body["completed_project_doc_id"] is not None
    assert body["template_project_doc_id"] == tpl.id

    # ProjectDocument was created with is_user_completed=True and the right type.
    pd = db_session.query(ProjectDocument).filter(
        ProjectDocument.id == body["completed_project_doc_id"]
    ).one()
    assert pd.is_user_completed is True
    assert pd.type == "dc1_template"
    assert pd.file_name == "DC1_signe.pdf"

    # File landed under tmp_path/{project_id}/completed/.
    saved = list((tmp_path / project.id / "completed").iterdir())
    assert len(saved) == 1
    assert saved[0].name.endswith("_DC1_signe.pdf")


# ─── upload-completed: validation errors ─────────────────────────────────────

def test_upload_completed_rejects_bad_extension(client, db_session, test_org, tmp_path, monkeypatch):
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)

    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "dc1_template")
    item = _make_dce_item(db_session, project, tpl)

    resp = client.post(
        f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
        files={"file": ("evil.exe", b"MZ...", "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert "Type de fichier non autorisé" in resp.json()["detail"]


def test_upload_completed_rejects_oversize(client, db_session, test_org, tmp_path, monkeypatch):
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)
    # Lower the cap so the test runs fast and stays in memory.
    monkeypatch.setattr(candidature_mod, "_COMPLETED_MAX_SIZE", 1024)

    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "acte_engagement_template")
    item = _make_dce_item(db_session, project, tpl, item_id="cli-ae")

    big = b"x" * 2048
    resp = client.post(
        f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
        files={"file": ("AE.pdf", big, "application/pdf")},
    )
    assert resp.status_code == 413


def test_upload_completed_rejects_vault_item(client, db_session, test_org):
    project = _make_project(db_session, test_org)
    item = _make_vault_item(db_session, project)

    resp = client.post(
        f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
        files={"file": ("kbis.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 400
    assert "template DCE" in resp.json()["detail"]


def test_upload_completed_404_when_item_missing(client, db_session, test_org):
    project = _make_project(db_session, test_org)
    resp = client.post(
        f"/api/projects/{project.id}/checklist/does-not-exist/upload-completed",
        files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 404


def test_upload_completed_404_when_project_belongs_to_other_org(
    client, db_session, test_org, tmp_path, monkeypatch,
):
    """Item exists in another org → must be invisible (404 on project)."""
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)

    from models.organization import Organization
    other_org = Organization(id="org-other", name="Autre Org")
    db_session.add(other_org)
    db_session.commit()
    other_proj = Project(id="proj-other", organization_id=other_org.id, name="Autre AO")
    db_session.add(other_proj)
    db_session.commit()
    tpl = _make_template(db_session, other_proj, "dc1_template")
    item = _make_dce_item(db_session, other_proj, tpl, item_id="cli-other")

    resp = client.post(
        f"/api/projects/{other_proj.id}/checklist/{item.id}/upload-completed",
        files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 404


def test_upload_completed_falls_back_to_autre_when_no_template(
    client, db_session, test_org, tmp_path, monkeypatch,
):
    """source_kind=dce_template but template_project_doc_id is null → fallback type 'autre'."""
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)

    project = _make_project(db_session, test_org)
    item = ChecklistItem(
        id="cli-orphan",
        project_id=project.id,
        document_type_required="autre",
        source_kind="dce_template",
        template_project_doc_id=None,
        status="manquant",
    )
    db_session.add(item)
    db_session.commit()

    resp = client.post(
        f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
        files={"file": ("mystere.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 200
    pd = db_session.query(ProjectDocument).filter(
        ProjectDocument.id == resp.json()["completed_project_doc_id"]
    ).one()
    assert pd.type == "autre"


# ─── PUT /link ───────────────────────────────────────────────────────────────

def test_link_vault_doc_success(client, db_session, test_org):
    project = _make_project(db_session, test_org)
    item = _make_vault_item(db_session, project, "kbis")
    doc = _make_vault_doc(db_session, test_org, "kbis", status="valid")

    resp = client.put(
        f"/api/projects/{project.id}/checklist/{item.id}/link",
        json={"document_id": doc.id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["linked_document_id"] == doc.id
    assert body["status"] == "present"


def test_link_vault_doc_expired_propagates_status(client, db_session, test_org):
    project = _make_project(db_session, test_org)
    item = _make_vault_item(db_session, project, "decennale", item_id="cli-dec")
    doc = _make_vault_doc(db_session, test_org, "decennale", status="expired")

    resp = client.put(
        f"/api/projects/{project.id}/checklist/{item.id}/link",
        json={"document_id": doc.id},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "expire"


def test_link_vault_doc_rejects_dce_template_item(client, db_session, test_org):
    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "dc1_template")
    item = _make_dce_item(db_session, project, tpl)
    doc = _make_vault_doc(db_session, test_org, "kbis")

    resp = client.put(
        f"/api/projects/{project.id}/checklist/{item.id}/link",
        json={"document_id": doc.id},
    )
    assert resp.status_code == 400


def test_link_vault_doc_404_for_foreign_doc(client, db_session, test_org):
    """A doc from another org cannot be linked."""
    from models.organization import Organization
    other_org = Organization(id="org-other-2", name="Autre")
    db_session.add(other_org)
    db_session.commit()
    foreign_doc = Document(
        id="vault-foreign", organization_id=other_org.id, type="kbis",
        file_url="/uploads/vault/x.pdf", file_name="x.pdf", status="valid",
    )
    db_session.add(foreign_doc)
    db_session.commit()

    project = _make_project(db_session, test_org)
    item = _make_vault_item(db_session, project, "kbis")

    resp = client.put(
        f"/api/projects/{project.id}/checklist/{item.id}/link",
        json={"document_id": foreign_doc.id},
    )
    assert resp.status_code == 404
