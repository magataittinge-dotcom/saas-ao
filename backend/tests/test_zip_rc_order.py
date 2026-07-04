"""
Tests C13b — ZIP dans l'ordre du RC + convention de nommage du RC.

  • Numérotation des pièces = ordre des exigences du RC (ordre de création
    des items de checklist issus de l'analyse), pas l'ordre alphabétique.
  • Convention de nommage détectée dans le RC → appliquée + exposée à l'UI ;
    absente → nommage safe existant (numéroté).
"""
import io
import zipfile

import pytest

from models.checklist_item import ChecklistItem
from models.document import Document
from models.project import Project, ProjectDocument


RC_WITH_CONVENTION = """
REGLEMENT DE LA CONSULTATION
Article 6 — Remise des plis
Les fichiers devront être nommés selon le format : NumLot_Entreprise_NomPiece
Exemple : 02_DUPONT_KBIS.pdf
"""

RC_WITHOUT_CONVENTION = """
REGLEMENT DE LA CONSULTATION
Article 6 — Remise des plis : dépôt sur le profil acheteur avant la date limite.
"""


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    import routers.export as export_mod
    import services.file_storage as fs_mod
    monkeypatch.setattr(export_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _seed(db, org_id, workspace, rc_text, pid="proj-c13b", org_name="BATI FACADE"):
    p = Project(
        id=pid, organization_id=org_id, name="Gueux",
        selected_lot="lot2", selected_lot_name="Lot 2 — Façades",
    )
    db.add(p)
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
        file_name="RC.pdf", extracted_text=rc_text,
    ))
    # 3 pièces du coffre liées via checklist — ordre RC : KBIS, URSSAF, Décennale
    # (volontairement non alphabétique). rc_position = ordre des exigences
    # dans le RC, posé par l'analyse.
    for i, (dtype, fname) in enumerate([
        ("kbis", "Zebra_KBIS.pdf"),           # Z... : l'ordre alphabétique trahirait
        ("urssaf", "Attestation_URSSAF.pdf"),
        ("decennale", "Decennale_2026.pdf"),
    ]):
        file_path = workspace / "organizations" / org_id / "vault" / fname
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(b"%PDF-1.4 " + fname.encode())
        doc = Document(
            organization_id=org_id, type=dtype, category="autres",
            file_url=f"/uploads/organizations/{org_id}/vault/{fname}",
            file_name=fname, status="valid",
        )
        db.add(doc)
        db.flush()
        db.add(ChecklistItem(
            project_id=pid, document_type_required=dtype, source_kind="vault",
            linked_document_id=doc.id, status="present", rc_position=i,
        ))
    db.commit()
    return p


def _candidature_names(content: bytes) -> list:
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        return [
            n.split("/")[-1] for n in z.namelist()
            if "/01_Candidature/" in n and not n.endswith("/")
        ]


# ─── Ordre du RC ─────────────────────────────────────────────────────────────

def test_zip_order_follows_rc_not_alphabetical(client, db_session, test_org, workspace):
    _seed(db_session, test_org.id, workspace, RC_WITHOUT_CONVENTION)

    resp = client.get("/api/projects/proj-c13b/export/zip")
    assert resp.status_code == 200, resp.text
    names = _candidature_names(resp.content)
    assert len(names) == 3
    # Numérotation = ordre RC (KBIS d'abord malgré 'Zebra_', décennale en 3e)
    assert names[0].startswith("01_") and "KBIS" in names[0]
    assert names[1].startswith("02_") and "URSSAF" in names[1]
    assert names[2].startswith("03_") and "Decennale" in names[2]


# ─── Convention de nommage du RC ─────────────────────────────────────────────

def test_detect_naming_convention():
    from services.export_naming import detect_naming_convention

    conv = detect_naming_convention(RC_WITH_CONVENTION)
    assert conv is not None
    assert conv["template"] == "{lot}_{entreprise}_{piece}"

    assert detect_naming_convention(RC_WITHOUT_CONVENTION) is None
    assert detect_naming_convention("") is None


def test_zip_applies_rc_convention(client, db_session, test_org, workspace):
    _seed(db_session, test_org.id, workspace, RC_WITH_CONVENTION)
    test_org.name = "BATI FACADE"
    db_session.commit()

    resp = client.get("/api/projects/proj-c13b/export/zip")
    assert resp.status_code == 200, resp.text
    names = _candidature_names(resp.content)
    # Convention {lot}_{entreprise}_{piece} appliquée, numérotation conservée
    first = names[0]
    assert first.startswith("01_")
    assert "Lot2" in first or "LOT2" in first or "lot2" in first
    assert "BATI_FACADE" in first or "BATI-FACADE" in first or "BATIFACADE" in first
    assert "KBIS" in first.upper()
    assert first.lower().endswith(".pdf")


def test_zip_fallback_safe_names_without_convention(client, db_session, test_org, workspace):
    _seed(db_session, test_org.id, workspace, RC_WITHOUT_CONVENTION, pid="proj-c13b2")

    resp = client.get("/api/projects/proj-c13b2/export/zip")
    names = _candidature_names(resp.content)
    # Fallback : noms d'origine (safe), juste numérotés
    assert names[0] == "01_Zebra_KBIS.pdf"


# ─── Signalement à l'UI d'export ─────────────────────────────────────────────

def test_export_detail_exposes_convention(client, db_session, test_org, workspace):
    _seed(db_session, test_org.id, workspace, RC_WITH_CONVENTION, pid="proj-c13b3")

    resp = client.get("/api/projects/proj-c13b3/export/detail")
    assert resp.status_code == 200, resp.text
    assert resp.json().get("naming_convention") == "{lot}_{entreprise}_{piece}"

    _seed(db_session, test_org.id, workspace, RC_WITHOUT_CONVENTION, pid="proj-c13b4")
    resp2 = client.get("/api/projects/proj-c13b4/export/detail")
    assert resp2.json().get("naming_convention") is None
