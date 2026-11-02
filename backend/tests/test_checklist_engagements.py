"""R17 — « N pièces à joindre » ne compte que de vraies pièces : un engagement du
candidat (validité de l'offre, solidarité, exactitude des renseignements, langue…)
n'est pas une pièce à joindre. Phrases inventées, aucun texte de DCE."""
import pytest

from models.compliance_item import ComplianceItem
from services.checklist_typology import classify_requirement, plan_checklist

ENGAGEMENTS = [
    "S'engager à maintenir son offre valable pendant quatre-vingt-dix jours",
    "Accepter la solidarité de tous les membres du groupement vis-à-vis de l'acheteur",
    "Certifier la sincérité de toutes les informations communiquées à l'acheteur",
    "Rédiger l'ensemble de l'offre en langue française",
    "Indiquer le choix du candidat relatif à l'avance forfaitaire",
    "Respecter l'ordre de présentation prévu pour le dossier",
    "Établir l'offre aux conditions économiques d'un mois de référence",
    "Renseigner le montant de l'offre en chiffres et en lettres",
    "Ne pas déposer plusieurs offres pour le même lot",
    "Signer et dater le cahier des clauses administratives avec la mention d'acceptation",
]

PIECES = [
    "Fournir le justificatif d'agrément préfectoral spécial n°42",
    "Joindre les CV des chefs d'équipe affectés au chantier",
    "Produire un certificat de bonne exécution signé par le maître d'ouvrage",
    "Remettre la liste des sous-traitants envisagés avec leurs coordonnées",
    "Joindre le plan d'installation de chantier proposé par l'entreprise",
]


@pytest.mark.parametrize("texte", ENGAGEMENTS)
def test_un_engagement_n_est_pas_une_piece(texte):
    c = classify_requirement(texte)
    assert c.excluded, f"{texte!r} ne doit pas devenir une pièce à joindre"
    assert c.exclude_reason


@pytest.mark.parametrize("texte", PIECES)
def test_une_piece_demandee_reste_une_piece(texte):
    c = classify_requirement(texte)
    assert not c.excluded and c.group == "fournir", texte


def test_le_decompte_ne_garde_que_les_pieces_et_rien_n_est_perdu():
    rows = [ComplianceItem(exigence_text=t, category="offre", priority="obligatoire",
                           status="non_couvert", lot="_commun") for t in ENGAGEMENTS + PIECES]
    plan = plan_checklist(rows)
    assert len(plan.lines) == len(PIECES)
    assert len(plan.excluded) == len(ENGAGEMENTS)          # loggés, jamais perdus
    assert len(plan.lines) + len(plan.excluded) == len(rows)


# ── V2 : obligations d'exécution (phrases inventées) ──
EXECUTION = [
    "Produire tous les six mois les justificatifs relatifs aux obligations sociales du titulaire",
    "Adresser préalablement une déclaration de détachement à l'inspection du travail",
    "Fournir la caution demandée pour tout sous-traitant de second rang dans les huit jours",
]


@pytest.mark.parametrize("texte", EXECUTION)
def test_une_obligation_d_execution_n_est_pas_une_piece_de_l_offre(texte):
    c = classify_requirement(texte)
    assert c.excluded and "exécution" in c.exclude_reason, texte


def test_une_piece_du_coffre_demandee_tous_les_six_mois_reste_une_piece():
    c = classify_requirement("Fournir tous les six mois l'attestation de vigilance URSSAF")
    assert not c.excluded and c.canonical_type == "urssaf"
