"""
Tests C12 — workflow DPGF complet + confirmations de signature.

  • Re-upload d'une DPGF remplie → dpgf_checker valide : lignes remplies → ✓,
    lignes vides → ⚠️ warning avec détail.
  • Documents à signer (AE, DC1, DC2) : case « Je confirme avoir signé »
    persistée, reflétée dans le score de conformité.
"""
import io

import pytest
from openpyxl import Workbook

import routers.candidature as candidature_mod
from models.checklist_item import ChecklistItem
from models.project import Project, ProjectDocument


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    monkeypatch.setattr(candidature_mod.limiter, "enabled", False, raising=False)


@pytest.fixture
def patched_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _dpgf_xlsx(rows) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["Désignation", "Unité", "Quantité", "Prix unitaire HT", "Total HT"])
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _setup_template_item(db, org_id, pid="proj-c12", template_type="dpgf_template"):
    p = Project(id=pid, organization_id=org_id, name=f"AO {pid}")
    db.add(p)
    template = ProjectDocument(
        project_id=pid, type=template_type,
        file_url=f"/uploads/projects/{pid}/dce/template.xlsx",
        file_name="DPGF_lot2.xlsx",
    )
    db.add(template)
    db.flush()
    item = ChecklistItem(
        project_id=pid, document_type_required=template_type,
        source_kind="dce_template", template_project_doc_id=template.id,
        status="manquant",
    )
    db.add(item)
    db.commit()
    return p, item


def _upload_completed(client, pid, item_id, content: bytes, filename="DPGF_rempli.xlsx"):
    return client.post(
        f"/api/projects/{pid}/checklist/{item_id}/upload-completed",
        files={"file": (filename, content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )


# ─── DPGF : validation au re-upload ──────────────────────────────────────────

def test_filled_dpgf_gives_present(client, db_session, test_org, patched_uploads):
    p, item = _setup_template_item(db_session, test_org.id)
    content = _dpgf_xlsx([
        ["Échafaudage", "m²", 120, 18.5, 2220.0],
        ["Enduit monocouche", "m²", 350, 42.0, 14700.0],
    ])

    resp = _upload_completed(client, p.id, item.id, content)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "present"
    assert "DPGF" in (body["details"] or "")


def test_dpgf_with_empty_lines_gives_warning_with_detail(
    client, db_session, test_org, patched_uploads,
):
    p, item = _setup_template_item(db_session, test_org.id)
    content = _dpgf_xlsx([
        ["Échafaudage", "m²", 120, 18.5, 2220.0],
        ["Enduit monocouche", "m²", 350, None, None],   # prix manquant
        ["Nettoyage", "m²", 350, None, None],           # prix manquant
    ])

    resp = _upload_completed(client, p.id, item.id, content)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "warning"
    assert "vide" in (body["details"] or "").lower()


def test_non_dpgf_template_untouched_by_checker(client, db_session, test_org, patched_uploads):
    """Un DC1 complété ne passe pas par le contrôle DPGF."""
    p, item = _setup_template_item(db_session, test_org.id, pid="proj-c12b", template_type="dc1_template")

    resp = _upload_completed(client, p.id, item.id, b"%PDF-1.4 dc1 signe", filename="DC1_signe.pdf")
    assert resp.status_code == 200
    assert resp.json()["status"] == "present"


# ─── Confirmations de signature ──────────────────────────────────────────────

def test_signature_confirmation_persists(client, db_session, test_org, patched_uploads):
    p, item = _setup_template_item(db_session, test_org.id, pid="proj-c12c", template_type="acte_engagement_template")

    resp = client.patch(
        f"/api/projects/{p.id}/checklist/{item.id}",
        json={"signature_confirmed": True},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["signature_confirmed"] is True

    db_session.expire_all()
    assert db_session.query(ChecklistItem).filter(
        ChecklistItem.id == item.id,
    ).first().signature_confirmed is True


def test_score_counts_unsigned_ae_as_non_conforme(db_session, test_org):
    from services.ai.checklist_matcher import conformity_score

    class _Item:
        def __init__(self, status, doc_type="urssaf", signed=False, kind="vault"):
            self.status = status
            self.document_type_required = doc_type
            self.signature_confirmed = signed
            self.source_kind = kind

    items = [
        _Item("present"),                                                    # vault ✓
        _Item("present", "acte_engagement_template", signed=False, kind="dce_template"),  # AE non signé
        _Item("present", "dc1_template", signed=True, kind="dce_template"),  # DC1 signé ✓
    ]
    assert conformity_score(items) == {"conformes": 2, "total": 3}
