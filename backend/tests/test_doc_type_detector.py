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

    # PREFIXED FILENAMES: AE just before file extension (real DCE pattern,
    # e.g. dossier-numeric-prefix from PLACE / achatpublic).
    ("2829 - AE.pdf",                    "acte_engagement_template"),
    ("2829 _ AE.pdf",                    "acte_engagement_template"),
    ("DCE_AE.pdf",                       "acte_engagement_template"),
    ("DOSSIER-001-AE.docx",              "acte_engagement_template"),

    # FALSE POSITIVE GUARD: 'AE' embedded in unrelated word
    ("phase_AE_dossier.pdf",             "autre"),
    ("phase_ae_avant_projet.pdf",        "autre"),

    # PRIORITY: DC1 wins over AE if both terms appear
    ("AE_DC1_combine.pdf",               "dc1_template"),
    ("DC1_AE_combine.pdf",               "dc1_template"),
])
def test_detect_acte_engagement(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── Diagnostic — DAT, CREP, G2, contrôles techniques ────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("DIAG AMIANTE 1.pdf",               "diagnostic"),
    ("ECOLE_DIAG_AMIANTE_2.pdf",         "diagnostic"),
    ("DIAG PLOMB.pdf",                   "diagnostic"),
    ("DAT_amiante_2024.pdf",             "diagnostic"),
    ("CREP_plomb.pdf",                   "diagnostic"),
    ("260310-APAVE-C24192521-1-RI.pdf",  "diagnostic"),
    ("Rapport_SOCOTEC.pdf",              "diagnostic"),
    ("QUALICONSULT_controle.pdf",        "diagnostic"),
    ("BUREAU_VERITAS_2024.pdf",          "diagnostic"),
    ("I-25-03-66-G2PRO_etude.pdf",       "diagnostic"),
    ("ETUDE_STRUCTURE_batiment.pdf",     "diagnostic"),
    ("controle_technique.pdf",           "diagnostic"),
    ("Diagnostic_termites.pdf",          "diagnostic"),

    # FALSE POSITIVE GUARDS
    ("Plomberie_lot.pdf",                "autre"),  # 'plomberie' ≠ 'plomb'
])
def test_detect_diagnostic(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── Notice (accessibilité, sécurité, acoustique, PC, EP) ────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("EQ2402-NOTICE_ACCESSIBILITE.pdf",  "notice"),
    ("Notice_acoustique.pdf",            "notice"),
    ("Notice gestion EP.pdf",            "notice"),
    ("Notice PC.pdf",                    "notice"),
    ("Notice_securite_incendie.pdf",     "notice"),
    ("Notice_environnementale.pdf",      "notice"),
])
def test_detect_notice(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── DT — déclarations concessionnaires (vs DTU/DTI false positives) ─────────

@pytest.mark.parametrize("filename, expected", [
    ("DT ENEDIS.pdf",                    "dt"),
    ("DT GRDF.pdf",                      "dt"),
    ("DT ORANGE.pdf",                    "dt"),
    ("DT_SIEM.pdf",                      "dt"),
    ("DT CUGR_EP.pdf",                   "dt"),
    ("DT-FREE.pdf",                      "dt"),

    # FALSE POSITIVE GUARDS — DTU / DTI are technical reference docs,
    # not concessionnaire declarations (no separator after DT).
    ("DTU 13.3 fondations.pdf",          "autre"),
    ("dtu_2024_ref.pdf",                 "autre"),
    ("DTI_specifications.pdf",           "autre"),
])
def test_detect_dt(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── PGC SPS — Plan Général de Coordination ─────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("PGC SPS.pdf",                      "pgc_sps"),
    ("PGC-SPS.pdf",                      "pgc_sps"),
    ("PGCSPS_2024.pdf",                  "pgc_sps"),
    ("Plan_general_coordination.pdf",    "pgc_sps"),
])
def test_detect_pgc_sps(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── Planning ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("Planning previsionnel.pdf",        "planning"),
    ("Planning_travaux.pdf",             "planning"),
    ("Planning_DCE.pdf",                 "planning"),
    ("Planning_chantier_2024.pdf",       "planning"),
])
def test_detect_planning(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── CCTP — carnet de détail / menuiseries / plans ───────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("DCE - CARNET DE DETAIL.pdf",       "cctp"),
    ("CARNET MENUISERIES.pdf",           "cctp"),
    ("Carnet_de_plan.pdf",               "cctp"),
    ("Carnet_detail_facade.pdf",         "cctp"),
])
def test_detect_cctp_carnet(filename, expected):
    assert _detect_doc_type(filename, "autre") == expected


# ─── RDC — Règlement vs Rez-De-Chaussée disambiguation ───────────────────────

@pytest.mark.parametrize("filename, expected", [
    # RDC alone or with règlement context → RC
    ("RDC.pdf",                          "rc"),
    ("RDC_consultation.pdf",             "rc"),
    # RDC + plan markers → plan
    ("Plan_RDC.dwg",                     "plan"),
    ("RDC_coupe.pdf",                    "plan"),
    ("ARCH 02 - RDC.pdf",                "plan"),
])
def test_rdc_disambiguation(filename, expected):
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


# ─── CCTP — corps d'état prefix "DCE-XX[0-9]?" ───────────────────────────────

@pytest.mark.parametrize("filename, expected", [
    ("DCE-GO01.pdf",                     "cctp"),  # Gros Œuvre
    ("DCE-ST.pdf",                       "cctp"),  # Structure
    ("DCE-PIC02.pdf",                    "cctp"),  # Plomberie
    ("DCE-MEN03.docx",                   "cctp"),  # Menuiserie
    ("DCE-CVC.pdf",                      "cctp"),  # Chauffage-Ventilation
    ("DCE-ELE.pdf",                      "cctp"),  # Électricité

    # FALSE POSITIVE GUARDS
    ("DCE-XYZABC123.pdf",                "autre"),  # >4 lettres
    ("MyDCE-GO01.pdf",                   "autre"),  # pas en début de nom
])
def test_detect_cctp_corps_etat_prefix(filename, expected):
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
    "2829 - AE.pdf", "DIAG AMIANTE 1.pdf", "Notice_PC.pdf", "DT ENEDIS.pdf",
    "PGC SPS.pdf", "Planning previsionnel.pdf", "Carnet_menuiseries.pdf",
    "DTU 13.3.pdf",
    "random.pdf", "image.png",
])
def test_detected_type_is_always_in_project_doc_types(filename):
    detected = _detect_doc_type(filename, "autre")
    assert detected in PROJECT_DOC_TYPES, (
        f"Detector returned '{detected}' for '{filename}', which is not in "
        f"PROJECT_DOC_TYPES — would violate the CHECK constraint on insert."
    )
