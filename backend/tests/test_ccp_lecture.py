"""CCP du RAG lu par pypdfium2 (plan H, tranche T7) : le chargeur passe par
services/pdf_lecture, sans PyMuPDF ; les liens de navigation collés en fin de ligne par
pdfium (« … (VD) Legif. Plan Jp.Judi. Jp.Admin. Juricaf ») sont retirés.

Aucune ingestion (payante) : seulement le découpage en articles, sur un PDF fabriqué.
"""
import pytest

from services import pdf_lecture
from services.rag import ccp_loader
from tests.pdf_fabrique import ecrire_pdf


@pytest.mark.parametrize("ligne, attendu", [
    ("Annexe préliminaire Arrêté du 22 décembre 2022 - art. 11 (VD) Legif. Plan Jp.Judi. Jp.Admin. Juricaf",
     "Annexe préliminaire Arrêté du 22 décembre 2022 - art. 11 (VD)"),
    ("L. 2100-1 Ordonnance n° 2018-1074 du 26 novembre 2018 Legif. Plan",
     "L. 2100-1 Ordonnance n° 2018-1074 du 26 novembre 2018"),
    ("Le maître d'ouvrage arrête le Plan", "Le maître d'ouvrage arrête le Plan"),
    ("Plan de financement prévisionnel de l'opération.", "Plan de financement prévisionnel de l'opération."),
])
def test_liens_de_navigation_colles_en_fin_de_ligne(ligne, attendu):
    assert ccp_loader._LIENS_EN_FIN_RE.sub("", ligne) == attendu


def test_articles_lus_par_pdf_lecture_sans_liens_colles(tmp_path, monkeypatch):
    pdf = ecrire_pdf(tmp_path / "ccp.pdf", [
        "Edition : 2026-06-19\nCode de la commande publique",
        "Partie réglementaire - TROISIÈME PARTIE - Livre III\n"
        "D. 3381-5 Décret n° 2018-1075 du 3 décembre 2018 Legif. Plan Jp.Judi. Jp.Admin. Juricaf\n"
        "Pour l'application de l'article D. 3133-2, les mots : « à L. 3133-3 » sont remplacés.\n"
        "Annexe préliminaire Arrêté du 22 décembre 2022 - art. 11 (VD) Legif. Plan Jp.Judi. Jp.Admin. Juricaf\n"
        "p.476 Code de la commande publique",
    ], largeur_car=None)
    lectures = []
    vrai = pdf_lecture.lire_pages
    monkeypatch.setattr(pdf_lecture, "lire_pages", lambda *a, **k: (lectures.append(k), vrai(*a, **k))[1])

    assert ccp_loader.extract_edition_date(pdf) == "2026-06-19"
    (article,) = ccp_loader.load_ccp_articles(pdf)
    assert article["ref"] == "D3381-5"
    assert article["texte"] == (
        "Pour l'application de l'article D. 3133-2, les mots : « à L. 3133-3 » sont remplacés.\n"
        "Annexe préliminaire Arrêté du 22 décembre 2022 - art. 11 (VD)")
    assert article["hierarchie"] == "Partie réglementaire › TROISIÈME PARTIE › Livre III"
    assert lectures == [{"max_pages": 1}, {}]
