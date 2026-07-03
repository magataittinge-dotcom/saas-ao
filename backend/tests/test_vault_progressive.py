"""
Tests C16 — coffre-fort progressif.

À l'upload projet d'un document perso (URSSAF, KBIS… reconnu par le
classement auto), la réponse porte une `vault_suggestion` que le front
affiche en bandeau discret. 1 tap → copie dans le coffre (classée, statut
honnête). Refus → flag vault_prompt_dismissed : plus jamais re-proposé
pour CE document.
"""
import pytest

import routers.projects as projects_mod
from models.document import Document
from models.project import Project, ProjectDocument


@pytest.fixture
def patched_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)

    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)

    from main import app
    if hasattr(app.state, "limiter"):
        monkeypatch.setattr(app.state.limiter, "enabled", False, raising=False)
    return tmp_path


def _make_project(db, org_id: str, pid: str = "proj-c16") -> Project:
    p = Project(id=pid, organization_id=org_id, name="AO C16")
    db.add(p)
    db.commit()
    return p


def _upload(client, project_id: str, filename: str):
    return client.post(
        f"/api/projects/{project_id}/documents",
        files={"file": (filename, b"%PDF-1.4 doc perso", "application/pdf")},
    )


# ─── Suggestion à l'upload ───────────────────────────────────────────────────

def test_personal_doc_upload_suggests_vault(client, db_session, test_org, patched_storage):
    project = _make_project(db_session, test_org.id)

    resp = _upload(client, project.id, "Attestation_URSSAF_2026.pdf")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["vault_suggestion"] is not None
    assert body["vault_suggestion"]["type"] == "urssaf"
    assert body["vault_suggestion"]["category"] == "attestations_sociales_fiscales"


def test_dce_doc_upload_has_no_suggestion(client, db_session, test_org, patched_storage):
    """Un document DCE (RC, CCTP…) n'est jamais proposé au coffre-fort."""
    project = _make_project(db_session, test_org.id)

    resp = _upload(client, project.id, "RC_consultation_2026.pdf")
    assert resp.status_code == 200, resp.text
    assert resp.json().get("vault_suggestion") is None


# ─── 1 tap → enregistré + classé ─────────────────────────────────────────────

def test_save_to_vault_copies_and_classifies(client, db_session, test_org, patched_storage):
    project = _make_project(db_session, test_org.id)
    doc_id = _upload(client, project.id, "Extrait_KBIS_2026.pdf").json()["id"]

    resp = client.post("/api/documents/from-project-doc", json={"project_doc_id": doc_id})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["type"] == "kbis"
    assert body["category"] == "documents_legaux"
    assert body["status"] == "unverified"  # honnête : pas de date fournie

    vault_doc = db_session.query(Document).filter(Document.id == body["id"]).first()
    assert vault_doc.organization_id == test_org.id
    # Fichier copié dans le coffre (hors arborescence projet)
    assert "organizations/" in vault_doc.file_url
    on_disk = patched_storage / vault_doc.file_url.removeprefix("/uploads/")
    assert on_disk.exists()
    assert on_disk.read_bytes() == b"%PDF-1.4 doc perso"

    # Une fois enregistré, plus de re-proposition pour ce document.
    pd = db_session.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
    assert pd.vault_prompt_dismissed is True


def test_save_to_vault_with_expiry_date_is_valid(client, db_session, test_org, patched_storage):
    from datetime import date, timedelta

    project = _make_project(db_session, test_org.id)
    doc_id = _upload(client, project.id, "attestation_urssaf.pdf").json()["id"]

    expiry = (date.today() + timedelta(days=120)).isoformat()
    resp = client.post("/api/documents/from-project-doc", json={
        "project_doc_id": doc_id, "expiry_date": expiry,
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "valid"
    assert resp.json()["expiry_date"] == expiry


def test_save_to_vault_cross_org_404(client, db_session, test_org, patched_storage):
    from models.organization import Organization

    other = Organization(id="org-c16-other", name="Autre")
    db_session.add(other)
    db_session.flush()
    other_project = Project(id="proj-c16-other", organization_id="org-c16-other", name="X")
    db_session.add(other_project)
    pd = ProjectDocument(
        project_id="proj-c16-other", type="autre",
        file_url="/uploads/projects/proj-c16-other/dce/kbis.pdf", file_name="kbis.pdf",
    )
    db_session.add(pd)
    db_session.commit()

    resp = client.post("/api/documents/from-project-doc", json={"project_doc_id": pd.id})
    assert resp.status_code == 404


# ─── Refus → flag no-repropose ───────────────────────────────────────────────

def test_dismiss_sets_flag_no_repropose(client, db_session, test_org, patched_storage):
    project = _make_project(db_session, test_org.id)
    doc_id = _upload(client, project.id, "Attestation_URSSAF.pdf").json()["id"]

    resp = client.post("/api/documents/vault-prompt/dismiss", json={"project_doc_id": doc_id})
    assert resp.status_code == 200

    pd = db_session.query(ProjectDocument).filter(ProjectDocument.id == doc_id).first()
    assert pd.vault_prompt_dismissed is True


def test_dismiss_cross_org_404(client, db_session, test_org, patched_storage):
    from models.organization import Organization

    other = Organization(id="org-c16-o2", name="Autre")
    db_session.add(other)
    db_session.flush()
    op = Project(id="proj-c16-o2", organization_id="org-c16-o2", name="X")
    db_session.add(op)
    pd = ProjectDocument(
        project_id="proj-c16-o2", type="autre",
        file_url="/uploads/x.pdf", file_name="urssaf.pdf",
    )
    db_session.add(pd)
    db_session.commit()

    resp = client.post("/api/documents/vault-prompt/dismiss", json={"project_doc_id": pd.id})
    assert resp.status_code == 404
    db_session.refresh(pd)
    assert pd.vault_prompt_dismissed is False
