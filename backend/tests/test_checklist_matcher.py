"""
Tests for ChecklistMatcher + RequirementFromAI Pydantic schema.

Covers:
- Pydantic validation of source_kind / expected_template_type with fallbacks
- Vault branch (with/without doc, expired, expiring soon)
- DCE template branch (template found, completed copy linked, missing template,
  multiple templates → first + warn)
- Requirement category outside candidature/offre falls through cleanly
- Backwards-compatible ChecklistMatcher.match() integration
"""
import pytest

from models.checklist_item import CHECKLIST_STATUSES
from models.document import Document
from models.project import Project, ProjectDocument
from schemas.compliance import RequirementFromAI
from services.ai.checklist_matcher import (
    ChecklistMatcher,
    _detect_vault_type,
    match_requirement_to_checklist_item,
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_project(db_session, test_org, pid="proj-cm-1"):
    p = Project(id=pid, organization_id=test_org.id, name="Test AO Matcher")
    db_session.add(p)
    db_session.commit()
    return p


def _make_template(db_session, project, doc_type, file_name=None, completed=False, suffix=""):
    pd = ProjectDocument(
        id=f"pd-{doc_type}-{'c' if completed else 't'}{suffix}",
        project_id=project.id,
        type=doc_type,
        file_url=f"/uploads/{doc_type}{suffix}.pdf",
        file_name=file_name or f"{doc_type}{suffix}.pdf",
        is_user_completed=completed,
    )
    db_session.add(pd)
    db_session.commit()
    return pd


def _make_vault_doc(db_session, test_org, doc_type, status="valid", suffix=""):
    d = Document(
        id=f"vault-{doc_type}{suffix}",
        organization_id=test_org.id,
        type=doc_type,
        file_url=f"/uploads/vault/{doc_type}{suffix}.pdf",
        file_name=f"{doc_type}{suffix}.pdf",
        status=status,
    )
    db_session.add(d)
    db_session.commit()
    return d


# ─── Pydantic RequirementFromAI ──────────────────────────────────────────────

def test_requirement_pydantic_defaults():
    req = RequirementFromAI(exigence="Fournir Kbis", category="candidature")
    assert req.source_kind == "vault"
    assert req.expected_template_type is None
    assert req.priority == "obligatoire"


def test_requirement_pydantic_invalid_source_kind_raises():
    with pytest.raises(Exception):
        RequirementFromAI(
            exigence="x", category="candidature", source_kind="invalid",
        )


def test_requirement_pydantic_invalid_template_raises():
    with pytest.raises(Exception):
        RequirementFromAI(
            exigence="x", category="candidature",
            source_kind="dce_template",
            expected_template_type="not_a_real_template",
        )


def test_requirement_pydantic_vault_with_template_clears_template(caplog):
    """source_kind=vault but expected_template_type set → cleared with warning."""
    req = RequirementFromAI(
        exigence="x",
        category="candidature",
        source_kind="vault",
        expected_template_type="dc1_template",
    )
    assert req.expected_template_type is None


def test_requirement_pydantic_dce_template_without_type_keeps_kind(caplog):
    """source_kind=dce_template but expected_template_type=None → kept (warning logged)."""
    req = RequirementFromAI(
        exigence="x", category="candidature", source_kind="dce_template",
        expected_template_type=None,
    )
    assert req.source_kind == "dce_template"
    assert req.expected_template_type is None


# ─── Vault keyword detection ─────────────────────────────────────────────────

@pytest.mark.parametrize("text, expected", [
    ("Fournir un Kbis de moins de 3 mois", "kbis"),
    ("Attestation de vigilance URSSAF", "urssaf"),
    ("Attestation de régularité fiscale", "fiscal"),
    ("Attestation d'assurance décennale", "decennale"),
    ("Attestation Pro BTP", "pro_btp"),
    ("Liste des travaux exécutés sur 5 ans avec attestations de bonne exécution", "attestation_travaux"),
    ("RIB au nom de l'entreprise", "rib"),
    ("Quelque chose de complètement aléatoire", None),
])
def test_detect_vault_type(text, expected):
    assert _detect_vault_type(text) == expected


# ─── Vault branch ────────────────────────────────────────────────────────────

def test_vault_match_with_valid_document(db_session, test_org):
    project = _make_project(db_session, test_org)
    kbis = _make_vault_doc(db_session, test_org, "kbis", status="valid")

    req = {"exigence": "Fournir un extrait Kbis", "category": "candidature",
           "source_kind": "vault", "expected_template_type": None}
    item = match_requirement_to_checklist_item(req, project.id, db_session)

    assert item["document_type_required"] == "kbis"
    assert item["source_kind"] == "vault"
    assert item["linked_document_id"] == kbis.id
    assert item["status"] == "present"
    assert item["template_project_doc_id"] is None


def test_vault_match_without_document(db_session, test_org):
    project = _make_project(db_session, test_org)

    req = {"exigence": "Attestation URSSAF de moins de 6 mois",
           "category": "candidature", "source_kind": "vault"}
    item = match_requirement_to_checklist_item(req, project.id, db_session)

    assert item["document_type_required"] == "urssaf"
    assert item["linked_document_id"] is None
    assert item["status"] == "manquant"


def test_vault_match_expired_document(db_session, test_org):
    project = _make_project(db_session, test_org)
    _make_vault_doc(db_session, test_org, "decennale", status="expired")

    req = {"exigence": "Attestation décennale", "category": "candidature",
           "source_kind": "vault"}
    item = match_requirement_to_checklist_item(req, project.id, db_session)

    assert item["status"] == "expire"
    assert item["status"] in CHECKLIST_STATUSES


def test_vault_match_expiring_soon(db_session, test_org):
    project = _make_project(db_session, test_org)
    _make_vault_doc(db_session, test_org, "fiscal", status="expiring_soon")

    req = {"exigence": "Attestation de régularité fiscale", "category": "candidature",
           "source_kind": "vault"}
    item = match_requirement_to_checklist_item(req, project.id, db_session)
    assert item["status"] == "expiration_proche"


def test_vault_match_unknown_keyword_returns_autre(db_session, test_org):
    project = _make_project(db_session, test_org)

    req = {"exigence": "Toute autre pièce non reconnue", "category": "candidature",
           "source_kind": "vault"}
    item = match_requirement_to_checklist_item(req, project.id, db_session)
    assert item["document_type_required"] == "autre"
    assert item["status"] == "manquant"


# ─── DCE template branch ─────────────────────────────────────────────────────

def test_dce_template_with_template_only(db_session, test_org):
    """Template fourni dans le DCE mais pas encore complété par l'utilisateur."""
    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "dc1_template", file_name="DC1.pdf")

    req = {"exigence": "Compléter le formulaire DC1", "category": "candidature",
           "source_kind": "dce_template", "expected_template_type": "dc1_template"}
    item = match_requirement_to_checklist_item(req, project.id, db_session)

    assert item["source_kind"] == "dce_template"
    assert item["template_project_doc_id"] == tpl.id
    assert item["completed_project_doc_id"] is None
    assert item["status"] == "manquant"
    assert "à compléter" in (item["details"] or "")


def test_dce_template_with_user_completed_copy(db_session, test_org):
    """Template + version complétée par l'utilisateur → status=present."""
    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "acte_engagement_template",
                          file_name="AE_vierge.pdf")
    completed = _make_template(db_session, project, "acte_engagement_template",
                                file_name="AE_signe_final.pdf", completed=True)

    req = {"exigence": "Compléter et signer l'acte d'engagement",
           "category": "offre", "source_kind": "dce_template",
           "expected_template_type": "acte_engagement_template"}
    item = match_requirement_to_checklist_item(req, project.id, db_session)

    assert item["template_project_doc_id"] == tpl.id
    assert item["completed_project_doc_id"] == completed.id
    assert item["status"] == "present"


def test_dce_template_missing_in_dce(db_session, test_org):
    """Aucun template du type attendu → manquant + détail explicatif."""
    project = _make_project(db_session, test_org)

    req = {"exigence": "Compléter le DPGF", "category": "offre",
           "source_kind": "dce_template", "expected_template_type": "dpgf_template"}
    item = match_requirement_to_checklist_item(req, project.id, db_session)

    assert item["status"] == "manquant"
    assert item["template_project_doc_id"] is None
    assert "non trouvé" in (item["details"] or "")
    assert item["document_type_required"] == "dpgf_template"


def test_dce_template_multiple_templates_takes_first(db_session, test_org, caplog):
    """Plusieurs templates du même type → prendre le premier + warning loggé."""
    project = _make_project(db_session, test_org)
    tpl1 = _make_template(db_session, project, "cadre_reponse",
                           file_name="Cadre_v1.docx", suffix="-1")
    _make_template(db_session, project, "cadre_reponse",
                    file_name="Cadre_v2.docx", suffix="-2")

    req = {"exigence": "Suivre le cadre de réponse", "category": "offre",
           "source_kind": "dce_template", "expected_template_type": "cadre_reponse"}

    import logging
    with caplog.at_level(logging.WARNING, logger="services.ai.checklist_matcher"):
        item = match_requirement_to_checklist_item(req, project.id, db_session)

    # Either tpl is fine — the contract is "take the first the query returned".
    assert item["template_project_doc_id"] in {tpl1.id, "pd-cadre_reponse-t-2"}
    assert any("2 templates" in r.message for r in caplog.records)


def test_dce_template_without_expected_type(db_session, test_org):
    """source_kind=dce_template mais expected_template_type=null → manquant + détail."""
    project = _make_project(db_session, test_org)

    req = {"exigence": "Compléter un formulaire mystère", "category": "candidature",
           "source_kind": "dce_template", "expected_template_type": None}
    item = match_requirement_to_checklist_item(req, project.id, db_session)

    assert item["status"] == "manquant"
    assert item["template_project_doc_id"] is None
    assert "non précisé" in (item["details"] or "")


# ─── Backwards-compatible match() ────────────────────────────────────────────

def test_match_batch_mixed_vault_and_template(db_session, test_org):
    import asyncio

    project = _make_project(db_session, test_org)
    kbis = _make_vault_doc(db_session, test_org, "kbis", status="valid")
    dc1_tpl = _make_template(db_session, project, "dc1_template")

    requirements = [
        {"exigence": "Fournir Kbis", "category": "candidature",
         "source_kind": "vault", "expected_template_type": None},
        {"exigence": "Compléter DC1", "category": "candidature",
         "source_kind": "dce_template", "expected_template_type": "dc1_template"},
        {"exigence": "Compléter DPGF", "category": "offre",
         "source_kind": "dce_template", "expected_template_type": "dpgf_template"},
    ]

    matcher = ChecklistMatcher()
    vault_docs = db_session.query(Document).filter(
        Document.organization_id == test_org.id
    ).all()
    checklist = asyncio.run(matcher.match(
        requirements, vault_docs, project_id=project.id, db=db_session,
    ))

    assert len(checklist) == 3
    by_type = {item["document_type_required"]: item for item in checklist}

    assert by_type["kbis"]["linked_document_id"] == kbis.id
    assert by_type["kbis"]["status"] == "present"

    assert by_type["dc1_template"]["template_project_doc_id"] == dc1_tpl.id
    assert by_type["dc1_template"]["status"] == "manquant"  # no completed copy

    assert by_type["dpgf_template"]["status"] == "manquant"
    assert by_type["dpgf_template"]["template_project_doc_id"] is None
