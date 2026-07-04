"""
Guard test: prevent regression where the export ZIP leaks original DCE files.

The ZIP must contain ONLY the deliverables produced by the company:
  - 01_Candidature/ : vault documents (via checklist) + user-completed docs
  - 02_Offre/       : Memoire_technique.docx + DPGF remplie + AE signé
Never the blank DCE templates the maître d'ouvrage provided as input.
"""
import io
import json
import re
import shutil
import uuid
import zipfile
from pathlib import Path

import pytest

from models.checklist_item import ChecklistItem
from models.document import Document
from models.memoire import MemoireTechnique
from models.project import Project, ProjectDocument


# Files uploaded by the maître d'ouvrage — must NEVER appear in the export ZIP.
# These match the project_documents.type enum values (PROJECT_DOC_TYPES).
FORBIDDEN_PROJECT_DOC_TYPES = {
    "rc", "ccap", "cctp",
    "acte_engagement_template", "dpgf_template",
    "dc1_template", "dc2_template", "bpu_template", "dqe_template",
    "cadre_reponse", "attestation_visite_template",
}

# Filename markers that indicate a blank template from the DCE.
FORBIDDEN_FILENAME_MARKERS = ("_vierge", "_template", "_original")

# Patterns for expected user-produced deliverables in 02_Offre/.
# C13a — le mémoire est en PDF (version dépôt) par défaut ; le DOCX ne
# reste possible que si la conversion LibreOffice est indisponible.
OFFRE_ALLOWED_PATTERNS = (
    re.compile(r"^Memoire_technique\.(pdf|docx)$"),
    re.compile(r"^DPGF_remplie.*\.(xlsx|xlsm|xls|ods|pdf)$", re.IGNORECASE),
    re.compile(r"^AE_sign[eé].*\.(pdf|docx)$", re.IGNORECASE),
    re.compile(r"^DC[12]_rempli.*\.(pdf|docx)$", re.IGNORECASE),
)


@pytest.fixture
def uploads_workspace(tmp_path_factory):
    """Seed real files under backend/uploads/<prefix>/ and clean up after."""
    from routers.export import UPLOADS_ROOT
    prefix = f"tests/{uuid.uuid4().hex[:8]}"
    base = UPLOADS_ROOT / prefix
    base.mkdir(parents=True, exist_ok=True)

    def write(rel_name: str, content: bytes = b"%PDF-1.4 test\n") -> str:
        path = base / rel_name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return f"/uploads/{prefix}/{rel_name}"

    yield write

    shutil.rmtree(base, ignore_errors=True)


@pytest.fixture
def seeded_project(db_session, test_org, uploads_workspace):
    """
    Seed a realistic project with:
      - 5 DCE project_documents (RC, CCAP, CCTP, AE template, DPGF template)
      - 3 vault documents (Kbis, URSSAF, décennale) linked via checklist
      - 1 mémoire technique generated
      - No filled DPGF, no signed AE → should trigger warnings
    """
    project = Project(
        id="proj-test-zip",
        organization_id=test_org.id,
        name="MAS Les Platanes",
        selected_lot_name="Lot 2 - ITE",
    )
    db_session.add(project)

    # ── DCE originals (input files — MUST NOT leak into the export) ──────
    dce_files = [
        ("rc", "RC_reglement_consultation.pdf"),
        ("ccap", "CCAP_clauses_administratives.pdf"),
        ("cctp", "CCTP_clauses_techniques.pdf"),
        ("acte_engagement_template", "AE_acte_engagement_vierge.pdf"),
        ("dpgf_template", "DPGF_decomposition_template.xlsx"),
    ]
    for doc_type, name in dce_files:
        db_session.add(ProjectDocument(
            id=f"pdoc-{doc_type}",
            project_id=project.id,
            type=doc_type,
            file_url=uploads_workspace(name),
            file_name=name,
            is_user_completed=False,
        ))

    # ── Coffre-fort (vault) documents — allowed in 01_Candidature/ ───────
    vault_files = [
        ("kbis", "Extrait_Kbis.pdf"),
        ("urssaf", "Attestation_URSSAF.pdf"),
        ("decennale", "Attestation_decennale.pdf"),
    ]
    vault_docs: list[Document] = []
    for doc_type, name in vault_files:
        doc = Document(
            id=f"vault-{doc_type}",
            organization_id=test_org.id,
            type=doc_type,
            file_url=uploads_workspace(name),
            file_name=name,
            status="valid",
        )
        db_session.add(doc)
        vault_docs.append(doc)

    # ── Checklist linking vault docs to requirements ─────────────────────
    for doc in vault_docs:
        db_session.add(ChecklistItem(
            id=f"cli-{doc.type}",
            project_id=project.id,
            document_type_required=doc.type,
            linked_document_id=doc.id,
            status="present",
        ))

    # ── Mémoire technique (generated) ────────────────────────────────────
    db_session.add(MemoireTechnique(
        id="mem-test",
        project_id=project.id,
        version=1,
        content_json={
            "preambule": "Test préambule",
            "partie_a": {"implantation": "Paris"},
            "partie_b": {},
            "partie_c": {},
        },
    ))

    db_session.commit()
    return project


def _zip_filenames(content: bytes) -> list[str]:
    zf = zipfile.ZipFile(io.BytesIO(content))
    return [n for n in zf.namelist() if not n.endswith("/")]


def test_export_zip_never_includes_dce_originals(client, seeded_project, db_session):
    resp = client.get(f"/api/projects/{seeded_project.id}/export/zip")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"

    names = _zip_filenames(resp.content)
    assert names, "Le ZIP ne doit pas être vide"

    # ── Guard 1: no DCE originals by their exact file_name ────────────────
    forbidden_names = {
        d.file_name for d in db_session.query(ProjectDocument)
        .filter(ProjectDocument.project_id == seeded_project.id)
        .filter(ProjectDocument.is_user_completed.is_(False))
        .all()
    }
    for zname in names:
        bare = Path(zname).name
        assert bare not in forbidden_names, (
            f"Le ZIP contient un original du DCE : {zname} "
            f"— ces fichiers ne doivent JAMAIS être ré-exportés."
        )

    # ── Guard 2: no "_vierge" / "_template" / "_original" filenames ───────
    for zname in names:
        lowered = zname.lower()
        for marker in FORBIDDEN_FILENAME_MARKERS:
            assert marker not in lowered, (
                f"Le ZIP contient un template vierge du DCE : {zname}"
            )


def test_export_zip_candidature_folder_only_vault_or_user_completed(
    client, seeded_project, db_session,
):
    resp = client.get(f"/api/projects/{seeded_project.id}/export/zip")
    assert resp.status_code == 200
    names = _zip_filenames(resp.content)

    vault_names = {
        d.file_name for d in db_session.query(Document)
        .filter(Document.organization_id == seeded_project.organization_id)
        .all()
    }
    user_completed_names = {
        d.file_name for d in db_session.query(ProjectDocument)
        .filter(ProjectDocument.project_id == seeded_project.id)
        .filter(ProjectDocument.is_user_completed.is_(True))
        .all()
    }
    allowed = vault_names | user_completed_names

    candidature_files = [n for n in names if "/01_Candidature/" in n]
    assert candidature_files, "01_Candidature/ doit contenir au moins un fichier"

    for zname in candidature_files:
        bare = Path(zname).name
        assert bare in allowed, (
            f"01_Candidature/ contient un fichier non autorisé : {zname} "
            f"— seuls les docs coffre-fort ou is_user_completed=True sont permis."
        )


def test_export_zip_offre_folder_matches_allowed_patterns(client, seeded_project):
    resp = client.get(f"/api/projects/{seeded_project.id}/export/zip")
    assert resp.status_code == 200
    names = _zip_filenames(resp.content)

    offre_files = [n for n in names if "/02_Offre/" in n]
    assert offre_files, "02_Offre/ doit contenir au moins un livrable"

    for zname in offre_files:
        bare = Path(zname).name
        assert any(p.match(bare) for p in OFFRE_ALLOWED_PATTERNS), (
            f"02_Offre/ contient un fichier inattendu : {zname} "
            f"— seuls Memoire_technique.docx, DPGF_remplie*, AE_signe*, "
            f"DC[12]_rempli* sont autorisés."
        )


def test_export_zip_returns_warnings_for_missing_user_completed(client, seeded_project):
    resp = client.get(f"/api/projects/{seeded_project.id}/export/zip")
    assert resp.status_code == 200

    raw = resp.headers.get("x-export-warnings") or resp.headers.get("X-Export-Warnings")
    assert raw is not None, "Header X-Export-Warnings manquant"
    warnings = json.loads(raw)

    joined = " | ".join(warnings).lower()
    assert "dpgf" in joined, f"Warning DPGF non remplie absent : {warnings}"
    assert "engagement" in joined, f"Warning AE non signé absent : {warnings}"


def test_export_zip_includes_memoire_technique(client, seeded_project):
    resp = client.get(f"/api/projects/{seeded_project.id}/export/zip")
    assert resp.status_code == 200
    names = _zip_filenames(resp.content)

    # C13a — PDF = version dépôt par défaut (DOCX seulement si LibreOffice
    # indisponible, ce qui n'est pas le cas de cet environnement de test).
    memoire_files = [n for n in names if "Memoire_technique." in n]
    assert len(memoire_files) == 1
    assert memoire_files[0].endswith("Memoire_technique.pdf")
    assert "/02_Offre/" in memoire_files[0]


def test_export_zip_includes_user_completed_project_doc(
    client, seeded_project, db_session, uploads_workspace,
):
    """When a project_doc is flagged is_user_completed=True, include it."""
    db_session.add(ProjectDocument(
        id="pdoc-ae-signed",
        project_id=seeded_project.id,
        type="acte_engagement_template",
        file_url=uploads_workspace("AE_signe_final.pdf"),
        file_name="AE_signe_final.pdf",
        is_user_completed=True,
    ))
    db_session.commit()

    resp = client.get(f"/api/projects/{seeded_project.id}/export/zip")
    assert resp.status_code == 200
    names = _zip_filenames(resp.content)

    matches = [n for n in names if n.endswith("AE_signe_final.pdf")]
    assert len(matches) == 1, f"AE signé absent du ZIP : {names}"
    assert "/02_Offre/" in matches[0], f"AE signé doit être dans 02_Offre/ : {matches[0]}"
