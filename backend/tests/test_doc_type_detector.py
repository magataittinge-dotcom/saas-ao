"""
Unit tests for `_detect_doc_type` in routers.projects.

Covers the priority cascade (DC1 → DC2 → AE → DPGF → BPU → DQE → cadre →
visite → RC → CCAP → CCTP → plan → autre), word-boundary anti-false-positive
guards, the .ods special case, and explicit form_type passthrough.
"""
import pytest

from models.project import PROJECT_DOC_TYPES
from routers.projects import _detect_doc_type


# ─── DC1 / DC2 ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    # DC1 — explicit
    ("DC1.pdf",                          "dc1_template"),
    ("DC1_lettre_candidature.pdf",       "dc1_template"),
    ("Lettre_DC1_2024.pdf",              "dc1_template"),
    ("DC 1.pdf",                         "dc1_template"),
    ("DC-1.pdf",                         "dc1_template"),
    ("Lettre_de_candidature.docx",       "dc1_template"),
    ("DC1.PDF",                          "dc1_template"),  # case-insensitive

    # DC2 — explicit
    ("DC2.pdf",                          "dc2_template"),
    ("DC2_declaration_candidat.pdf",     "dc2_template"),
    ("DC 2.pdf",                         "dc2_template"),
    ("Declaration_du_candidat.docx",     "dc2_template"),

    # DC1/DC2 false positives — must NOT match
    ("DC1234_irrelevant.pdf",            "autre"),
    ("DC14.pdf",                         "autre"),
    ("DC1A.pdf",                         "autre"),
])
def test_detect_dc1_dc2(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── Acte d'engagement (AE) ──────────────────────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("AE.pdf",                           "acte_engagement_template"),
    ("Acte_engagement.docx",             "acte_engagement_template"),
    ("Acte_d_engagement.pdf",            "acte_engagement_template"),
    ("AE_signe_final.pdf",               "acte_engagement_template"),
    ("AE_template.pdf",                  "acte_engagement_template"),
    ("AE_vierge.pdf",                    "acte_engagement_template"),

    # FALSE POSITIVE GUARD: 'AE' embedded in unrelated word
    ("phase_AE_dossier.pdf",             "autre"),
    ("phase_ae_avant_projet.pdf",        "autre"),

    # PRIORITY: DC1 wins over AE if both terms appear
    ("AE_DC1_combine.pdf",               "dc1_template"),
    ("DC1_AE_combine.pdf",               "dc1_template"),
])
def test_detect_acte_engagement(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── DPGF / BPU / DQE ────────────────────────────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    # DPGF
    ("DPGF.xlsx",                        "dpgf_template"),
    ("DPGF_Lot1.xlsm",                   "dpgf_template"),
    ("Decomposition_prix_global.xls",    "dpgf_template"),
    ("Dpgf-Lot-2.xlsx",                  "dpgf_template"),
    ("DPGF.ods",                         "dpgf_template"),

    # BPU
    ("BPU.pdf",                          "bpu_template"),
    ("Bordereau_prix_unitaire.xlsx",     "bpu_template"),
    ("BPU_Lot3.xlsx",                    "bpu_template"),

    # DQE
    ("DQE.xlsx",                         "dqe_template"),
    ("Detail_quantitatif.xlsx",          "dqe_template"),
    ("DQE_estimatif.xlsx",               "dqe_template"),

    # PRIORITY: DPGF > BPU > DQE
    ("DPGF_BPU_combine.xlsx",            "dpgf_template"),
    ("DPGF_DQE.xlsx",                    "dpgf_template"),
    ("BPU_DQE.xlsx",                     "bpu_template"),
])
def test_detect_pricing_documents(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── Cadre de réponse / Attestation de visite ────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("Cadre_de_reponse.docx",            "cadre_reponse"),
    ("Cadre_reponse_memoire.docx",       "cadre_reponse"),
    ("Cadre-réponse.docx",               "cadre_reponse"),  # diacritic

    ("Attestation_visite.pdf",           "attestation_visite_template"),
    ("Visite_obligatoire.pdf",           "attestation_visite_template"),
    ("Visite_de_site.pdf",               "attestation_visite_template"),
])
def test_detect_cadre_and_visite(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── Reference DCE (rc / ccap / cctp / plan) ─────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("RC.pdf",                           "rc"),
    ("Reglement_consultation.pdf",       "rc"),
    ("Reglement_de_la_consultation.pdf", "rc"),

    ("CCAP.pdf",                         "ccap"),
    ("Cahier_administratif.pdf",         "ccap"),

    ("CCTP.pdf",                         "cctp"),
    ("CCTP_Lot01.pdf",                   "cctp"),
    ("lot 01 Demolition-GO_DCE.pdf",     "cctp"),  # per-lot DCE PDF

    ("Plan_facade.pdf",                  "plan"),
    ("Plan_RDC.dwg",                     "plan"),
    ("ARCH 02 - Coupe AA.pdf",           "plan"),
])
def test_detect_reference_docs(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── Edge cases ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("",                                 "autre"),
    ("document.pdf",                     "autre"),
    ("image.png",                        "autre"),
    ("random_filename_42.pdf",           "autre"),
])
def test_detect_edge_cases(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── form_type passthrough & defensive validation ────────────────────────────

def test_form_type_explicit_valid_passthrough():
    """An explicit, valid form_type bypasses filename detection."""
    assert _detect_doc_type("random.pdf", "rc") == "rc"
    assert _detect_doc_type("random.pdf", "dc1_template") == "dc1_template"
    assert _detect_doc_type("DC1.pdf", "ccap") == "ccap"  # explicit wins


def test_form_type_invalid_falls_through_to_detection():
    """An invalid form_type is ignored — detector runs on the filename."""
    # Old/legacy values like 'acte_engagement' or 'dpgf' are no longer valid.
    assert _detect_doc_type("DC1.pdf", "acte_engagement") == "dc1_template"
    assert _detect_doc_type("BPU.xlsx", "dpgf") == "bpu_template"
    assert _detect_doc_type("random.pdf", "totally_invalid") == "autre"


def test_form_type_autre_runs_detection():
    """The default 'autre' triggers normal detection on the filename."""
    assert _detect_doc_type("DPGF.xlsx", "autre") == "dpgf_template"
    assert _detect_doc_type("CCTP.pdf", "autre") == "cctp"


# ─── Invariant: the detector NEVER returns a value outside PROJECT_DOC_TYPES ─

@pytest.mark.parametrize("filename", [
    "", "DC1.pdf", "DC2.pdf", "AE.pdf", "DPGF.xlsx", "BPU.xlsx", "DQE.xlsx",
    "Cadre_reponse.docx", "Attestation_visite.pdf", "RC.pdf", "CCAP.pdf",
    "CCTP.pdf", "Plan_RDC.dwg", "phase_AE_dossier.pdf", "DC14.pdf",
    "random.pdf", "image.png",
])
def test_detected_type_is_always_in_project_doc_types(filename):
    detected = _detect_doc_type(filename, "autre")
    assert detected in PROJECT_DOC_TYPES, (
        f"Detector returned '{detected}' for '{filename}', which is not in "
        f"PROJECT_DOC_TYPES — would violate the CHECK constraint on insert."
    )
