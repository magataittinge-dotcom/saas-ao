"""
Tests C10 — 3e état de vérification « ⚠️ présente mais problème ».

Un document du coffre matché sur une exigence mais expiré / non vérifié
(unverified) / non classé → l'item de checklist est "warning", PAS ✓.
Score de conformité X/Y : les ⚠️ (warning/expire) ne comptent pas
conformes ; les non_applicable sortent du dénominateur.
"""
import pytest

from models.document import Document
from models.checklist_item import ChecklistItem
from models.project import Project


class _Doc:
    def __init__(self, status):
        self.status = status


# ─── Mapping statut coffre → statut checklist ────────────────────────────────

def test_vault_doc_status_mapping():
    from services.ai.checklist_matcher import _vault_doc_status

    assert _vault_doc_status(_Doc("valid")) == "present"
    assert _vault_doc_status(_Doc("expiring_soon")) == "expiration_proche"
    assert _vault_doc_status(_Doc("expired")) == "expire"
    # C10 : présent mais problème → warning, jamais ✓
    assert _vault_doc_status(_Doc("unverified")) == "warning"
    assert _vault_doc_status(_Doc("unclassified")) == "warning"


# ─── Score de conformité ─────────────────────────────────────────────────────

class _Item:
    def __init__(self, status):
        self.status = status


def test_conformity_score():
    from services.ai.checklist_matcher import conformity_score

    items = [
        _Item("present"), _Item("present"),
        _Item("expiration_proche"),   # encore valide → conforme
        _Item("warning"),             # présente mais problème → PAS conforme
        _Item("expire"),              # PAS conforme
        _Item("manquant"),            # PAS conforme
        _Item("non_applicable"),      # hors dénominateur
    ]
    score = conformity_score(items)
    assert score == {"conformes": 3, "total": 6}


def test_conformity_score_empty():
    from services.ai.checklist_matcher import conformity_score

    assert conformity_score([]) == {"conformes": 0, "total": 0}


# ─── Intégration : lier un doc unverified → item warning ─────────────────────

def _setup(db, org_id):
    p = Project(id="proj-c10", organization_id=org_id, name="AO C10")
    db.add(p)
    doc = Document(
        organization_id=org_id, type="urssaf",
        category="attestations_sociales_fiscales",
        file_url="/uploads/organizations/x/vault/u.pdf", file_name="urssaf.pdf",
        status="unverified",
    )
    db.add(doc)
    item = ChecklistItem(
        project_id="proj-c10", document_type_required="urssaf",
        source_kind="vault", status="manquant",
    )
    db.add(item)
    db.commit()
    return p, doc, item


def test_linking_unverified_doc_gives_warning_not_present(client, db_session, test_org):
    _, doc, item = _setup(db_session, test_org.id)

    resp = client.put(
        f"/api/projects/proj-c10/checklist/{item.id}/link",
        json={"document_id": doc.id},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "warning"

    db_session.expire_all()
    assert db_session.query(ChecklistItem).filter(
        ChecklistItem.id == item.id,
    ).first().status == "warning"


def test_linking_valid_doc_gives_present(client, db_session, test_org):
    _, doc, item = _setup(db_session, test_org.id)
    doc.status = "valid"
    db_session.commit()

    resp = client.put(
        f"/api/projects/proj-c10/checklist/{item.id}/link",
        json={"document_id": doc.id},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "present"


# ─── Endpoint score ──────────────────────────────────────────────────────────

def test_checklist_score_all_green_state(client, db_session, test_org):
    """Second état du gate d'export : X == Y quand tout est conforme."""
    p = Project(id="proj-c10g", organization_id=test_org.id, name="AO")
    db_session.add(p)
    for status in ("present", "present", "expiration_proche"):
        db_session.add(ChecklistItem(
            project_id="proj-c10g", document_type_required="urssaf",
            source_kind="vault", status=status,
        ))
    db_session.commit()

    body = client.get("/api/projects/proj-c10g/checklist/score").json()
    assert body["conformes"] == body["total"] == 3


def test_checklist_score_endpoint(client, db_session, test_org):
    p = Project(id="proj-c10s", organization_id=test_org.id, name="AO")
    db_session.add(p)
    for status in ("present", "present", "warning", "manquant", "non_applicable"):
        db_session.add(ChecklistItem(
            project_id="proj-c10s", document_type_required="urssaf",
            source_kind="vault", status=status,
        ))
    db_session.commit()

    resp = client.get("/api/projects/proj-c10s/checklist/score")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"conformes": 2, "total": 4}
