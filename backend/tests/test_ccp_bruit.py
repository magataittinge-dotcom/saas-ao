"""T5 (plan H §2.8) — CCP du RAG : le bruit de mise en page tenu sur une ligne.

Lu par pdfium, le pied de page du Code de la commande publique tient sur une
seule ligne (« p.12 Code de la commande publique ») et les liens de navigation
peuvent être réunis (« Legif. Plan Jp.Judi. Jp.Admin. Juricaf »). La regex de
bruit ne reconnaissait que les lignes séparées (forme PyMuPDF) : le pied de
page s'infiltrait dans 377 articles sur 1 793.

Test de la regex seule : aucun lecteur PDF, aucune ingestion (payante).
"""
import pytest

from services.rag.ccp_loader import _NOISE_RE


@pytest.mark.parametrize("ligne", [
    "p.12 Code de la commande publique",          # §4.4 n° 8
    "p.476 Code de la commande publique ",
    "Legif. Plan Jp.Judi. Jp.Admin. Juricaf",
    "  Plan Jp.Judi. Jp.Admin. Juricaf",
    "Legif.Plan Jp.Judi.",
])
def test_bruit_tenu_sur_une_ligne(ligne):
    assert _NOISE_RE.match(ligne)


@pytest.mark.parametrize("ligne", [
    "p.12", "Code de la commande publique", "Legif.", "Plan", "Jp.Judi.", "Jp.Admin.",
    "Juricaf", "service-public.fr", "codes.droit.org/codes/commande-publique",
    "> Répondre au marché : préparer le dossier de candidature",
])
def test_formes_pymupdf_toujours_du_bruit(ligne):
    assert _NOISE_RE.match(ligne)


@pytest.mark.parametrize("ligne", [
    "Plan de financement prévisionnel de l'opération.",
    "p.12 du rapport de présentation",
    "Juridiction compétente pour connaître des recours.",
    "L'acheteur précise dans les documents de la consultation les prestations attendues.",
])
def test_texte_des_articles_garde(ligne):
    assert not _NOISE_RE.match(ligne)
