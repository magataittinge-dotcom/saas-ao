"""
Tests BONUS Lot 5 — Gantt visuel + annexes du coffre-fort.

  • Gantt : phases+durées SAISIES au pre-flight → rendu SVG déterministe
    (aucune donnée inventée : 0 phase → pas de Gantt) inséré au DOCX.
  • Annexes : pièces du coffre sélectionnées au pre-flight → jointes au ZIP
    d'export en section 3_ANNEXES (ownership org respecté).
"""
import io
import zipfile

import pytest

from models.document import Document
from models.memoire import MemoireTechnique
from models.project import Project, ProjectDocument


PHASES = [
    {"nom": "Installation de chantier", "duree_semaines": 2},
    {"nom": "Dépose des menuiseries", "duree_semaines": 3},
    {"nom": "Pose et finitions", "duree_semaines": 5},
]

CONTENT = {"preambule": "P.", "partie_a": {}, "partie_b": {},
           "partie_c": {"methodologie": "Notre phasage."}}


# ─── Gantt SVG déterministe ──────────────────────────────────────────────────

def test_gantt_svg_from_phases():
    from services.gantt import generate_gantt_svg

    svg = generate_gantt_svg(PHASES)
    assert svg is not None
    assert svg.lstrip().startswith("<svg")
    for phase in PHASES:
        assert phase["nom"] in svg
    # 3 barres + graduations semaines (10 semaines au total)
    assert svg.count('class="gantt-bar"') == 3
    assert "S10" in svg


def test_gantt_none_without_phases():
    from services.gantt import generate_gantt_svg

    assert generate_gantt_svg([]) is None
    assert generate_gantt_svg(None) is None
    # Phases sans durée exploitable → rien (aucune donnée inventée)
    assert generate_gantt_svg([{"nom": "X", "duree_semaines": 0}]) is None


def test_gantt_png_and_docx_insertion():
    from services.docx_exporter import build_memoire_docx
    from services.gantt import generate_gantt_svg
    from services.organigramme import svg_to_png_bytes

    png = svg_to_png_bytes(generate_gantt_svg(PHASES))
    assert png[:8] == b"\x89PNG\r\n\x1a\n"

    def _media(b):
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            return len([n for n in z.namelist() if n.startswith("word/media/")])

    base = build_memoire_docx(CONTENT, "P", "Org")
    with_gantt = build_memoire_docx(CONTENT, "P", "Org", gantt_image=png)
    assert _media(with_gantt) == _media(base) + 1


# ─── Pre-flight : saisie des phases + sélection d'annexes ────────────────────

@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def _setup(db, org_id, pid="proj-bonus"):
    p = Project(id=pid, organization_id=org_id, name="Gueux", selected_lot="lot1")
    db.add(p)
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
        file_name="rc.pdf", extracted_text="RC " * 30,
    ))
    db.commit()
    return p


def test_preflight_exposes_vault_documents(client, db_session, test_org):
    _setup(db_session, test_org.id)
    db_session.add(Document(
        organization_id=test_org.id, type="qualibat", category="qualifications",
        file_url="/uploads/organizations/x/vault/qualibat.pdf",
        file_name="Qualibat_2026.pdf", status="valid",
    ))
    db_session.commit()

    resp = client.get("/api/projects/proj-bonus/memoire/preflight")
    assert resp.status_code == 200
    docs = resp.json()["vault_documents"]
    assert any(d["file_name"] == "Qualibat_2026.pdf" for d in docs)


def test_generate_stores_gantt_and_annexes(client, db_session, test_org, monkeypatch):
    import routers.memoire as memoire_mod

    async def _fake(self, **kwargs):
        return dict(CONTENT)
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _fake)
    test_org.plan = "pro"
    db_session.commit()
    _setup(db_session, test_org.id, pid="proj-bonus2")

    resp = client.post("/api/projects/proj-bonus2/memoire/generate", json={
        "gantt_phases": PHASES,
        "annexe_document_ids": ["doc-a", "doc-b"],
    })
    assert resp.status_code == 200, resp.text

    memoire = db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-bonus2",
    ).first()
    assert memoire.variables["gantt_phases"] == PHASES
    assert memoire.variables["annexe_document_ids"] == ["doc-a", "doc-b"]


# ─── ZIP : section 3_ANNEXES ─────────────────────────────────────────────────

@pytest.fixture
def workspace(tmp_path, monkeypatch):
    import routers.export as export_mod
    import services.file_storage as fs_mod
    monkeypatch.setattr(export_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _vault_doc(db, workspace, org_id, fname):
    path = workspace / "organizations" / org_id / "vault" / fname
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"%PDF-1.4 " + fname.encode())
    doc = Document(
        organization_id=org_id, type="qualibat", category="qualifications",
        file_url=f"/uploads/organizations/{org_id}/vault/{fname}",
        file_name=fname, status="valid",
    )
    db.add(doc)
    db.flush()
    return doc


def test_zip_includes_selected_annexes(client, db_session, test_org, workspace):
    _setup(db_session, test_org.id, pid="proj-bonus3")
    doc = _vault_doc(db_session, workspace, test_org.id, "Qualibat_2026.pdf")

    # Doc d'une autre org : ne doit JAMAIS sortir dans le ZIP
    from models.organization import Organization
    db_session.add(Organization(id="org-bonus-evil", name="Evil"))
    db_session.flush()
    evil = _vault_doc(db_session, workspace, "org-bonus-evil", "Secret.pdf")

    db_session.add(MemoireTechnique(
        project_id="proj-bonus3", content_json=dict(CONTENT),
        variables={"annexe_document_ids": [doc.id, evil.id]},
    ))
    db_session.commit()

    resp = client.get("/api/projects/proj-bonus3/export/zip")
    assert resp.status_code == 200, resp.text
    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        names = z.namelist()
        assert any("/3_ANNEXES/" in n and "Qualibat_2026.pdf" in n for n in names)
        assert not any("Secret.pdf" in n for n in names)


def test_zip_no_annexes_section_when_none_selected(client, db_session, test_org, workspace):
    _setup(db_session, test_org.id, pid="proj-bonus4")
    db_session.add(MemoireTechnique(
        project_id="proj-bonus4", content_json=dict(CONTENT), variables={},
    ))
    db_session.commit()

    resp = client.get("/api/projects/proj-bonus4/export/zip")
    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        assert not any("/3_ANNEXES/" in n for n in z.namelist())
