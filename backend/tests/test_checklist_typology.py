"""
Typologie déterministe de la checklist (4 groupes + consolidation).

Chaque exigence documentaire est classée dans UN des 4 groupes métier
(règles déterministes, 0 € API, mapping issu de la skill
conformite-candidature) :
  • fournir   — pièces à uploader / lier au coffre (attestations, assurances…)
  • completer — formulaires à compléter/signer (DC1, DC2, AE, visite…)
  • synorix   — produits par Synorix (mémoire technique) → jalon, jamais upload
  • workflow  — gérés par un workflow dédié (DPGF/BPU) → download→remplir→re-upload

Consolidation : plusieurs exigences pointant la MÊME pièce physique → une
seule ligne. Les non-pièces (dépôt, format, signature-instruction, chiffrage,
contenu de mémoire, renvois réglementaires) sont EXCLUES et loggées — jamais
mappées en ligne d'upload, jamais perdues (mapped + excluded == entrée).
Le score de conformité ne compte que fournir + completer.
"""
from datetime import date

import pytest

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.project import Project


# ─────────────────────────────────────────────────────────────────────────────
#  1. Classifieur pur (aucune DB)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected_group,expected_type", [
    # fournir (coffre / upload)
    ("Fournir l'attestation de vigilance URSSAF datant de moins de 6 mois", "fournir", "urssaf"),
    ("Fournir l'attestation de régularité fiscale de moins de 6 mois", "fournir", "fiscal"),
    ("Fournir l'attestation d'assurance décennale en cours de validité", "fournir", "decennale"),
    ("Fournir l'attestation d'assurance RC professionnelle en cours de validité", "fournir", "rc_civile"),
    ("Fournir la liste des travaux exécutés sur les 5 dernières années avec attestations de bonne exécution", "fournir", "attestation_travaux"),
    ("Communiquer le chiffre d'affaires global des 3 derniers exercices clos", "fournir", "chiffre_affaires"),
    ("Fournir une déclaration des effectifs moyens annuels et encadrement", "fournir", "effectifs"),
    ("Fournir le certificat de qualification Qualibat RGE ITE en cours de validité", "fournir", "qualibat_rge"),
    ("Fournir le pouvoir de la personne habilitée à signer les documents", "fournir", "pouvoir"),
    ("En cas de groupement, fournir l'acte d'habilitation du mandataire à signer le marché", "fournir", "pouvoir"),
    # completer / signer (formulaires)
    ("Effectuer obligatoirement la visite des lieux d'exécution du marché", "completer", "attestation_visite"),
    ("Fournir le formulaire DC1 (Lettre de candidature) complété, daté et signé", "completer", "dc1"),
    ("Fournir le formulaire DC2 (Déclaration du candidat) complété et signé", "completer", "dc2"),
    ("Compléter, dater et signer la Déclaration sur l'honneur (modèle fourni dans le RC)", "completer", "declaration_honneur"),
    ("Compléter, dater et signer l'acte d'engagement (AE/ATTRI1) joint au DCE", "completer", "acte_engagement"),
    ("Si sous-traitance prévue, joindre les déclarations de sous-traitance (DC4)", "completer", "dc4"),
    # synorix (jalon)
    ("Produire un mémoire technique décrivant la méthodologie d'exécution des travaux d'ITE", "synorix", "memoire_technique"),
    ("Fournir un mémoire méthodologique dans l'offre (rendu contractuel)", "synorix", "memoire_technique"),
    # workflow (DPGF/BPU)
    ("Renseigner intégralement le DPGF (Décomposition du Prix Global et Forfaitaire) du Lot 05", "workflow", "dpgf"),
    ("Vérifier la cohérence des quantités figurant dans la DPGF", "workflow", "dpgf"),
])
def test_classify_maps_to_expected_group(text, expected_group, expected_type):
    from services.checklist_typology import classify_requirement
    c = classify_requirement(text)
    assert not c.excluded, f"{text!r} classé exclu à tort"
    assert c.group == expected_group, f"{text!r} → {c.group} (attendu {expected_group})"
    assert c.canonical_type == expected_type


@pytest.mark.parametrize("text,reason_hint", [
    ("Transmettre la candidature et l'offre avant la date et heure limites inscrites au RC", "depot"),
    ("Déposer l'offre exclusivement par voie dématérialisée sur la plateforme achatpublic.com", "depot"),
    ("Transmettre les fichiers dans des formats acceptés : .zip, .pdf, .docx", "format"),
    ("Nommer les dossiers électroniques selon la convention 'candidature lot n°05'", "format"),
    ("Traiter préalablement tous les fichiers par un anti-virus avant dépôt", "format"),
    ("Signer les candidatures et offres (signature manuscrite scannée ou électronique)", "signature"),
    ("Chiffrer impérativement toutes les prestations supplémentaires éventuelles (PSE)", "chiffrage"),
    ("Fournir un sous-détail de chacun des prix forfaitaires dans les 20 jours", "chiffrage"),
    ("Fournir l'indication des mesures de gestion environnementale appliquées", "contenu"),
    ("Fournir une déclaration indiquant l'outillage, le matériel et l'équipement technique disponible", "contenu"),
    ("Intégrer dans le mémoire technique les CV des personnels affectés au chantier", "contenu"),
    ("Établir un Plan d'Assurance Qualité (PAQ) du chantier conformément au CCAG", "contenu"),
    ("Fournir les pièces prévues aux articles R.2143-6 et suivants du Code de la commande publique", "reglementaire"),
])
def test_classify_excludes_non_pieces(text, reason_hint):
    from services.checklist_typology import classify_requirement
    c = classify_requirement(text)
    assert c.excluded, f"{text!r} aurait dû être exclu ({reason_hint})"
    assert c.exclude_reason  # non vide


def test_unmapped_defaults_to_fournir_with_raw_label():
    """Ce qui ne mappe pas proprement → groupe 'fournir', libellé brut, jamais perdu."""
    from services.checklist_typology import classify_requirement
    c = classify_requirement("Fournir le justificatif d'agrément préfectoral spécial n°42")
    assert not c.excluded
    assert c.group == "fournir"
    assert c.canonical_type == "autre"


# ─────────────────────────────────────────────────────────────────────────────
#  2. Plan de consolidation (rows → lignes + exclusions), sans DB
# ─────────────────────────────────────────────────────────────────────────────

def _reqs(*texts, lot=None, category="candidature"):
    return [ComplianceItem(exigence_text=t, category=category, priority="obligatoire",
                           status="non_couvert", lot=lot) for t in texts]


def test_plan_consolidates_same_physical_piece():
    """4 variantes d'attestation RC → UNE ligne (merged_count=4)."""
    from services.checklist_typology import plan_checklist
    rows = _reqs(
        "Fournir l'attestation d'assurance RC professionnelle en cours de validité",
        "Fournir une attestation d'assurance RC couvrant tous dommages à 8 M€",
        "Fournir une attestation d'assurance RC couvrant les immatériels non consécutifs",
        "Renouveler et fournir les justificatifs d'assurance RC à chaque échéance",
    )
    plan = plan_checklist(rows)
    rc = [l for l in plan.lines if l.canonical_type == "rc_civile"]
    assert len(rc) == 1, f"attendu 1 ligne RC, obtenu {len(rc)}"
    assert rc[0].merged_count == 4


def test_plan_separates_scopes():
    """Une pièce par lot reste distincte par scope (DPGF lot5 ≠ DPGF lot6)."""
    from services.checklist_typology import plan_checklist
    rows = (_reqs("Renseigner le DPGF du Lot 05", lot="lot5", category="offre")
            + _reqs("Renseigner le DPGF du Lot 06", lot="lot6", category="offre"))
    plan = plan_checklist(rows)
    dpgf = [l for l in plan.lines if l.canonical_type == "dpgf"]
    assert {l.scope for l in dpgf} == {"lot5", "lot6"}


def test_plan_reconciles_nothing_lost():
    """mapped (somme des merged_count) + excluded == nombre d'exigences en entrée."""
    from services.checklist_typology import plan_checklist
    rows = _reqs(
        "Fournir l'attestation URSSAF de moins de 6 mois",           # fournir
        "Fournir le formulaire DC1 complété et signé",               # completer
        "Produire un mémoire technique méthodologique",              # synorix
        "Renseigner le DPGF",                                        # workflow
        "Déposer l'offre par voie dématérialisée avant la date limite",  # exclu depot
        "Fournir l'indication des mesures de gestion environnementale",  # exclu contenu
    )
    plan = plan_checklist(rows)
    mapped = sum(l.merged_count for l in plan.lines)
    assert mapped + len(plan.excluded) == len(rows)
    assert mapped == 4 and len(plan.excluded) == 2


def test_plan_memoire_is_synorix_jalon():
    from services.checklist_typology import plan_checklist
    rows = _reqs("Produire un mémoire technique décrivant la méthodologie", category="offre")
    line = plan_checklist(rows).lines[0]
    assert line.group == "synorix"


# ─────────────────────────────────────────────────────────────────────────────
#  3. Intégration builder + endpoint (DB) : groupe exposé, score = fournir+completer
# ─────────────────────────────────────────────────────────────────────────────

def _seed_full(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="X", deadline=date.today()))
    texts = [
        ("Fournir l'attestation URSSAF de moins de 6 mois", "candidature"),        # fournir
        ("Fournir le formulaire DC1 complété et signé", "candidature"),            # completer
        ("Produire un mémoire technique méthodologique", "offre"),                 # synorix
        ("Renseigner le DPGF du marché", "offre"),                                 # workflow
        ("Chiffrer les prestations supplémentaires éventuelles (PSE)", "offre"),   # exclu
    ]
    for t, cat in texts:
        db.add(ComplianceItem(project_id=pid, exigence_text=t, category=cat,
                              priority="obligatoire", status="non_couvert", lot="_commun"))
    db.commit()


def test_get_checklist_exposes_document_group(client, db_session, test_org):
    _seed_full(db_session, test_org.id, "proj-ty1")
    client.post("/api/projects/proj-ty1/checklist/regenerate")
    body = client.get("/api/projects/proj-ty1/checklist").json()
    groups = {i["document_group"] for i in body}
    assert groups == {"fournir", "completer", "synorix", "workflow"}
    # 4 lignes visibles, le PSE (chiffrage) est exclu
    assert len(body) == 4


def test_workflow_dpgf_carries_template_for_inline_fill(client, db_session, test_org):
    """La pièce DPGF (workflow) porte le template DCE à télécharger + le
    source_kind attendu par le flux « remplir sur place » (download →
    upload-completed → check_dpgf), SANS saut vers l'étape Export."""
    from models.project import ProjectDocument

    db_session.add(Project(id="proj-ty3", organization_id=test_org.id, name="X",
                           deadline=date.today()))
    db_session.add(ProjectDocument(
        id="tpl-dpgf-1", project_id="proj-ty3", type="dpgf_template",
        file_url="/uploads/x.xlsx", file_name="DPGF_Lot05.xlsx", is_user_completed=False))
    db_session.add(ComplianceItem(
        project_id="proj-ty3", exigence_text="Renseigner intégralement le DPGF du Lot 05",
        category="offre", priority="obligatoire", status="non_couvert", lot="_commun"))
    db_session.commit()

    client.post("/api/projects/proj-ty3/checklist/regenerate")
    body = client.get("/api/projects/proj-ty3/checklist").json()
    dpgf = [i for i in body if i["document_group"] == "workflow"][0]
    assert dpgf["source_kind"] == "dce_template"
    assert dpgf["document_type_required"] == "dpgf_template"
    assert dpgf["template_project_doc_id"] == "tpl-dpgf-1"  # téléchargeable en place


def test_synorix_item_not_upload_and_out_of_score(client, db_session, test_org):
    _seed_full(db_session, test_org.id, "proj-ty2")
    client.post("/api/projects/proj-ty2/checklist/regenerate")
    body = client.get("/api/projects/proj-ty2/checklist").json()
    synorix = [i for i in body if i["document_group"] == "synorix"][0]
    assert synorix["status"] == "non_applicable"   # jalon auto, jamais "manquant" à uploader

    score = client.get("/api/projects/proj-ty2/checklist/score").json()
    # score ne compte que fournir + completer (2 pièces), ni synorix ni workflow
    assert score["total"] == 2
