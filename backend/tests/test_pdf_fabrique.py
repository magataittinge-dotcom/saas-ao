"""Fabrique de PDF de test sans PyMuPDF (plan H, tranche T1).

Le texte écrit par ``tests/pdf_fabrique.py`` est relu À L'IDENTIQUE par l'extraction de
l'appli (``DocumentProcessor``, page par page) : les tests qui fabriquent des PDF restent
valables quel que soit le lecteur de l'appli (PyMuPDF aujourd'hui, pypdfium2 ensuite).
"""
from services.document_processor import DocumentProcessor
from tests.pdf_fabrique import ecrire_pdf, pdf_texte


def _pages_relues(octets: bytes) -> list[str]:
    pages: list[str] = []
    DocumentProcessor().extract_ex(octets, "piece.pdf", on_pages=pages.extend)
    return pages


def test_texte_relu_a_l_identique_page_vide_comprise(tmp_path):
    pages = [
        "Règlement de consultation — article 1 : le candidat fournit un Kbis.",
        "",
        "L’entreprise œuvre à l’ouvrage ; « délai » : 12 mois, retenue de 5 %.\nArticle 3 — Pénalités.",
    ]
    chemin = ecrire_pdf(tmp_path / "rc.pdf", pages)
    assert _pages_relues(chemin.read_bytes()) == [p + "\n" if p else "" for p in pages]


def test_ligne_longue_repliee_a_80_caracteres_sans_perte():
    ligne = "Les travaux comprennent la dépose complète des menuiseries existantes, " * 4
    (relue,) = _pages_relues(pdf_texte([ligne]))
    assert relue.split() == ligne.split()
    assert max(len(l) for l in relue.splitlines()) <= 80
