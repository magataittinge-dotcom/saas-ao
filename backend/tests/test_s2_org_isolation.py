"""S2.3 — isolation multi-tenant (audit passe 2, 🟠).

Chaque test EXPLOITE la faille (rouge sur le code vulnérable) :

  1. file_serve : un chemin `projects/<mien>/../../projects/<autre>/x.pdf`
     passait `_authorize_path` (le préfixe `projects/<mien>` est possédé) tout
     en RÉSOLVANT vers le fichier d'une AUTRE org — le fichier reste sous
     uploads/, donc la garde de containment ne suffit pas. Fuite cross-org.
     Correctif : normaliser le chemin AVANT le contrôle d'accès.

  2. export /detail : lisait le `file_name` d'un Document lié SANS filtre org →
     fuite du nom de fichier d'une autre org dans la réponse.

  3. export /zip : embarquait les OCTETS d'un Document lié SANS filtre org.

  4. checklist_matcher (fallback) : matchait un Document de N'IMPORTE quelle org.
"""
import io
import zipfile

import pytest

from models.organization import Organization
from models.project import Project
from models.document import Document
from models.checklist_item import ChecklistItem


# ── Helpers ──────────────────────────────────────────────────────────────────

def _plant_file(uploads_root, rel_path, content=b"%PDF-1.4 secret"):
    full = uploads_root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(content)


def _make_project(db, org_id, pid):
    p = Project(id=pid, organization_id=org_id, name=f"Projet {pid}")
    db.add(p)
    db.commit()
    return p


def _make_org(db, oid):
    o = Organization(id=oid, name=f"Org {oid}")
    db.add(o)
    db.commit()
    return o


@pytest.fixture
def patched_uploads(tmp_path, monkeypatch):
    from routers import file_serve as fs
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    return tmp_path


# ── 1. file_serve : traversal intra-uploads vers une AUTRE org ───────────────

def test_view_intra_uploads_traversal_cross_org_blocked(
    db_session, test_org, patched_uploads,
):
    """On appelle la coroutine `view_file` DIRECTEMENT avec le chemin brut :
    un client HTTP (httpx, navigateur) normaliserait les `..` avant l'envoi,
    mais un attaquant les préserve (`curl --path-as-is`). C'est donc le
    serveur — pas le client — qui doit se défendre."""
    import asyncio
    from urllib.parse import parse_qs, urlparse
    from fastapi import HTTPException
    from routers.file_serve import view_file
    from services.file_storage import sign_file_path

    _make_project(db_session, test_org.id, "projA-trav")
    _make_org(db_session, "orgB-trav")
    _make_project(db_session, "orgB-trav", "projB-trav")
    _plant_file(patched_uploads, "projects/projB-trav/dce/secret.pdf", b"%PDF-1.4 SECRET_B")

    # Autorisé via projA (possédé) mais résout vers le secret de projB (org B).
    evil = "projects/projA-trav/../../projects/projB-trav/dce/secret.pdf"
    qs = parse_qs(urlparse(sign_file_path(evil, org_id=test_org.id)).query)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(view_file(
            file_path=evil,
            org=test_org.id, exp=qs["exp"][0], sig=qs["sig"][0],
            page=None, highlight=None, db=db_session,
        ))
    assert exc.value.status_code in (403, 404)


def test_sign_intra_uploads_traversal_cross_org_refused(
    client, db_session, test_org, patched_uploads,
):
    _make_project(db_session, test_org.id, "projA-sign")
    _make_org(db_session, "orgB-sign")
    _make_project(db_session, "orgB-sign", "projB-sign")
    _plant_file(patched_uploads, "projects/projB-sign/dce/secret.pdf")

    resp = client.get("/api/files/sign", params={
        "path": "/uploads/projects/projA-sign/../../projects/projB-sign/dce/secret.pdf",
    })
    assert resp.status_code in (403, 404)


# ── 2. export /detail : ne fuite pas le nom d'un Document d'une autre org ─────

def test_export_detail_does_not_leak_other_org_document_name(client, db_session, test_org):
    _make_project(db_session, test_org.id, "projA-exp")
    _make_org(db_session, "orgB-exp")
    db_session.add(Document(
        id="docB-exp", organization_id="orgB-exp", type="kbis",
        file_url="/uploads/organizations/orgB-exp/kbis.pdf",
        file_name="KBIS_SECRET_ORG_B.pdf",
    ))
    db_session.add(ChecklistItem(
        id="ci-exp", project_id="projA-exp",
        document_type_required="kbis", source_kind="vault",
        linked_document_id="docB-exp", status="present",
    ))
    db_session.commit()

    resp = client.get("/api/projects/projA-exp/export/detail")
    assert resp.status_code == 200, resp.text
    assert "KBIS_SECRET_ORG_B" not in resp.text


# ── 3. export /zip : n'embarque pas les octets d'un Document d'une autre org ──

def test_export_zip_does_not_embed_other_org_document(
    client, db_session, test_org, tmp_path, monkeypatch,
):
    # Le ZIP lit les octets via routers.export.UPLOADS_ROOT — on le pointe sur
    # tmp_path, sinon le fichier planté est « introuvable » et le test passerait
    # pour une mauvaise raison (fichier absent, pas filtre org).
    from routers import export as export_mod
    monkeypatch.setattr(export_mod, "UPLOADS_ROOT", tmp_path)

    _make_project(db_session, test_org.id, "projA-zip")
    _make_org(db_session, "orgB-zip")
    _plant_file(tmp_path, "organizations/orgB-zip/kbis.pdf", b"OCTETS_SECRETS_ORG_B")
    db_session.add(Document(
        id="docB-zip", organization_id="orgB-zip", type="kbis",
        file_url="/uploads/organizations/orgB-zip/kbis.pdf",
        file_name="kbis_org_b.pdf",
    ))
    db_session.add(ChecklistItem(
        id="ci-zip", project_id="projA-zip",
        document_type_required="kbis", source_kind="vault",
        linked_document_id="docB-zip", status="present",
    ))
    db_session.commit()

    resp = client.get("/api/projects/projA-zip/export/zip")
    assert resp.status_code == 200, resp.text
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        blob = b"".join(zf.read(n) for n in zf.namelist())
    assert b"OCTETS_SECRETS_ORG_B" not in blob


# ── 4. checklist_matcher : fallback org-scoped (défense en profondeur) ────────

def test_matcher_fallback_does_not_match_other_org_document(db_session, test_org):
    from services.ai.checklist_matcher import match_requirement_to_checklist_item

    _make_project(db_session, test_org.id, "projA-match")
    _make_org(db_session, "orgB-match")
    db_session.add(Document(
        id="docB-match", organization_id="orgB-match", type="kbis",
        file_url="/uploads/organizations/orgB-match/kbis.pdf",
        file_name="kbis_b.pdf",
    ))
    db_session.commit()

    result = match_requirement_to_checklist_item(
        {"exigence": "Fournir un extrait Kbis", "source_kind": "vault"},
        "projA-match", db_session, vault_by_type=None,
    )
    # projA (org A) n'a AUCUN Kbis : le doc d'org B ne doit pas être matché.
    assert result["linked_document_id"] is None
