"""
Statuts positifs des pièces (bloc 9, tranche 1) — lecture déterministe du RC.

La checklist dit, pour chaque pièce, si elle est demandée à tous (« obligatoire »),
« si concerné » ou « facultative », et à quelle phase elle est remise (« dépôt »
ou « attribution »). Lecture de l'extrait du document de la consultation rattaché
à la ligne (source_in_rc) : jamais de texte réel de DCE dans ces tests, les RC
sont inventés. Aucun appel IA.

Sources des règles :
  • DC4 : un DC4 par sous-traitant (service-public F32144) — la pièce n'existe
    que s'il y a sous-traitance : « si concerné » par nature.
  • Attestation URSSAF « datant de moins de six mois » : Code du travail D8222-5
    (règle) ; Kbis 3 mois = usage courant des acheteurs (service-public F21000).
"""
from datetime import date, timedelta

import pytest

from models.checklist_item import ChecklistItem
from models.document import Document
from models.project import Project


class _Item:
    def __init__(self, type_="kbis", extrait=None, details=None):
        self.document_type_required = type_
        self.source_in_rc = extrait
        self.details = details


@pytest.mark.parametrize("extrait", [
    "Le cas échéant, l'attestation d'assurance du sous-traitant.",
    "Si applicable, une copie du pouvoir de la personne habilitée.",
    "En cas de groupement, une déclaration par cotraitant.",
    "S'il y a lieu, la liste des sous-traitants déclarés.",
])
def test_pieces_demandees_si_concerne(extrait):
    from services.ai.checklist_matcher import lire_obligation
    assert lire_obligation(_Item("autre", extrait)) == "si_concerne"


def test_dc4_est_si_concerne_par_nature():
    from services.ai.checklist_matcher import lire_obligation
    assert lire_obligation(_Item("dc4", "Un DC4 par sous-traitant.")) == "si_concerne"


@pytest.mark.parametrize("extrait", [
    "Une note de présentation de l'équipe est facultative.",
    "Fournir, à titre optionnel, un book de références photographiques.",
])
def test_pieces_facultatives(extrait):
    from services.ai.checklist_matcher import lire_obligation
    assert lire_obligation(_Item("autre", extrait)) == "facultatif"


@pytest.mark.parametrize("extrait", [
    None, "",
    "Extrait Kbis de moins de trois mois.",
    "La présente pièce n'est pas facultative.",
    "L'attestation de vigilance URSSAF est exigée de tous les candidats.",
])
def test_pieces_obligatoires_par_defaut(extrait):
    from services.ai.checklist_matcher import lire_obligation
    assert lire_obligation(_Item("urssaf", extrait)) == "obligatoire"


@pytest.mark.parametrize("extrait", [
    "L'attributaire devra produire les attestations sociales et fiscales avant la notification.",
    "L'attributaire fournira les attestations avant la notification du marché.",
])
def test_pieces_remises_a_l_attribution(extrait):
    from services.ai.checklist_matcher import lire_phase
    assert lire_phase(_Item("urssaf", extrait)) == "attribution"


@pytest.mark.parametrize("extrait", [
    None, "",
    "Extrait Kbis de moins de trois mois.",
    # la signature renvoyée à l'attribution ne déplace pas la remise de la pièce
    "L'acte d'engagement sera signé par l'attributaire.",
    # le dépôt est explicite : on ne devine pas
    "Les candidats remettent avec leur offre l'attestation fiscale ; l'attributaire fournit en plus l'extrait K.",
])
def test_pieces_remises_au_depot_par_defaut(extrait):
    from services.ai.checklist_matcher import lire_phase
    assert lire_phase(_Item("kbis", extrait)) == "depot"


# ─── API : obligation, phase, fin de validité exposées par la checklist ─────

TODAY = date.today()
PID = "proj-statuts"


def test_la_checklist_expose_obligation_phase_et_fin_de_validite(client, db_session, test_org):
    db_session.add(Project(id=PID, organization_id=test_org.id, name="AO statuts"))
    # attestation du coffre échue : sa date de fin est donnée pour dire « À renouveler »
    db_session.add(Document(id="d-urssaf", organization_id=test_org.id, type="urssaf", status="expired",
                            expiry_date=TODAY - timedelta(days=12), category="attestations_sociales_fiscales",
                            file_name="urssaf.pdf", file_url="/uploads/o/urssaf.pdf"))
    for id_, type_, extrait, lie, statut in (
        ("l-urssaf", "urssaf", None, "d-urssaf", "expire"),
        ("l-dc4", "dc4", "Un DC4 par sous-traitant.", None, "manquant"),
        ("l-kbis", "kbis", "L'attributaire produit l'extrait Kbis avant la notification.", None, "manquant"),
    ):
        db_session.add(ChecklistItem(
            id=id_, project_id=PID, document_type_required=type_, source_kind="vault",
            document_group="fournir", status=statut, source_in_rc=extrait, linked_document_id=lie))
    db_session.commit()

    lignes = {l["id"]: l for l in client.get(f"/api/projects/{PID}/checklist").json()}
    assert lignes["l-urssaf"]["obligation"] == "obligatoire" and lignes["l-urssaf"]["phase"] == "depot"
    assert lignes["l-urssaf"]["jointe"] is False
    assert lignes["l-urssaf"]["valable_jusqu_au"] == (TODAY - timedelta(days=12)).isoformat()
    assert lignes["l-dc4"]["obligation"] == "si_concerne"
    assert lignes["l-kbis"]["phase"] == "attribution"
    assert lignes["l-kbis"]["valable_jusqu_au"] is None


def test_l_export_porte_aussi_obligation_phase_et_fin_de_validite(client, db_session, test_org):
    db_session.add(Project(id="proj-statuts-exp", organization_id=test_org.id, name="AO statuts export"))
    db_session.add(Document(id="d-urssaf2", organization_id=test_org.id, type="urssaf", status="expired",
                            expiry_date=TODAY - timedelta(days=3), category="attestations_sociales_fiscales",
                            file_name="urssaf.pdf", file_url="/uploads/o/urssaf.pdf"))
    db_session.add(ChecklistItem(id="e-urssaf", project_id="proj-statuts-exp", document_type_required="urssaf",
                                 source_kind="vault", document_group="fournir", status="expire",
                                 linked_document_id="d-urssaf2"))
    db_session.add(ChecklistItem(id="e-dc4", project_id="proj-statuts-exp", document_type_required="dc4",
                                 source_kind="dce_template", document_group="completer", status="manquant"))
    db_session.commit()
    detail = client.get("/api/projects/proj-statuts-exp/export/detail").json()
    lignes = {l["id"]: l for l in detail["checklist_items"]}
    assert lignes["e-urssaf"]["valable_jusqu_au"] == (TODAY - timedelta(days=3)).isoformat()
    assert lignes["e-dc4"]["obligation"] == "si_concerne" and lignes["e-dc4"]["phase"] == "depot"
