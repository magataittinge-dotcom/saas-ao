"""
Unit tests for the source_kind / dce_template extension of ChecklistItem,
DCE_TEMPLATE_TYPES enum, vault DOCUMENT_TYPES updates, and
Reference.attestation_document_id link.
"""
from sqlalchemy.exc import IntegrityError

from models.checklist_item import (
    ChecklistItem,
    CHECKLIST_SOURCE_KINDS,
)
from models.document import Document, DOCUMENT_TYPES
from models.project import (
    DCE_TEMPLATE_TYPES,
    PROJECT_DOC_TYPES,
    Project,
    ProjectDocument,
)
from models.reference import Reference


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_project(db_session, test_org, name="Test AO"):
    p = Project(id="proj-test-1", organization_id=test_org.id, name=name)
    db_session.add(p)
    db_session.commit()
    return p


def _make_template_doc(db_session, project, doc_type="dc1_template"):
    pd = ProjectDocument(
        id=f"pd-{doc_type}",
        project_id=project.id,
        type=doc_type,
        file_url="/uploads/x.pdf",
        file_name=f"{doc_type}.pdf",
    )
    db_session.add(pd)
    db_session.commit()
    return pd


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_checklist_item_source_kind_default(db_session, test_org):
    project = _make_project(db_session, test_org)

    item = ChecklistItem(
        id="cli-1",
        project_id=project.id,
        document_type_required="kbis",
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    assert item.source_kind == "vault"


def test_checklist_item_dce_template_with_template_pointer(db_session, test_org):
    """A dce_template item must be able to link to its template_project_doc."""
    project = _make_project(db_session, test_org)
    template = _make_template_doc(db_session, project, "dc1_template")

    item = ChecklistItem(
        id="cli-2",
        project_id=project.id,
        document_type_required="dc1_template",
        source_kind="dce_template",
        template_project_doc_id=template.id,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    assert item.source_kind == "dce_template"
    assert item.template_project_doc_id == template.id
    assert item.template_project_doc.id == template.id
    assert item.completed_project_doc_id is None


def test_checklist_item_invalid_source_kind_raises(db_session, test_org):
    project = _make_project(db_session, test_org)

    item = ChecklistItem(
        id="cli-bad",
        project_id=project.id,
        document_type_required="kbis",
        source_kind="invalid_value",
    )
    db_session.add(item)
    try:
        db_session.commit()
        raised = False
    except IntegrityError:
        raised = True
        db_session.rollback()
    assert raised, "Un source_kind invalide doit lever une IntegrityError"


def test_reference_attestation_link(db_session, test_org):
    """A Reference can link to an attestation_travaux Document."""
    attestation = Document(
        id="doc-att-1",
        organization_id=test_org.id,
        type="attestation_travaux",
        file_url="/uploads/attest.pdf",
        file_name="attestation.pdf",
        status="valid",
    )
    db_session.add(attestation)
    db_session.commit()

    ref = Reference(
        id="ref-1",
        organization_id=test_org.id,
        intitule="Réhabilitation Mairie de Caen",
        montant_ht=850_000.0,
        annee=2024,
        attestation_document_id=attestation.id,
    )
    db_session.add(ref)
    db_session.commit()
    db_session.refresh(ref)

    assert ref.attestation_document_id == attestation.id
    assert ref.attestation_document.id == attestation.id
    assert ref.attestation_document.type == "attestation_travaux"


def test_dce_template_types_enum_complete():
    """The DCE_TEMPLATE_TYPES list must contain the 8 validated types, exactly."""
    expected = {
        "dc1_template",
        "dc2_template",
        "acte_engagement_template",
        "dpgf_template",
        "bpu_template",
        "dqe_template",
        "cadre_reponse",
        "attestation_visite_template",
    }
    assert set(DCE_TEMPLATE_TYPES) == expected
    assert len(DCE_TEMPLATE_TYPES) == 8

    # All DCE_TEMPLATE_TYPES are valid PROJECT_DOC_TYPES
    assert expected.issubset(set(PROJECT_DOC_TYPES))


def test_document_types_dc1_dc2_removed():
    """dc1 and dc2 must no longer be vault DOCUMENT_TYPES (now dce_template only)."""
    assert "dc1" not in DOCUMENT_TYPES
    assert "dc2" not in DOCUMENT_TYPES


def test_document_types_new_additions():
    """New vault types must all be present."""
    for t in ("rge", "attestation_travaux", "trc", "dommages_ouvrage"):
        assert t in DOCUMENT_TYPES, f"{t} manquant dans DOCUMENT_TYPES"


def test_checklist_source_kinds_constants():
    """The source_kind constants list must match what the DB constraint allows."""
    assert set(CHECKLIST_SOURCE_KINDS) == {"vault", "dce_template"}
