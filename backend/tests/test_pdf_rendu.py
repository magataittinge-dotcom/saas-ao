"""Rendu d'une page (ou d'une zone) en WebP (T-RENDU) : taille, cadrage, rotation, bornes, plafond.

Le rendu s'exécute dans le processus pdfium (plafond de mémoire, délai) : l'API ne rend jamais
un PDF déposé elle-même.
"""
import io

import pytest
from PIL import Image

from services import pdf_rendu
from services import pdfium_processus as pp
from services.pdf_lecture import PdfIllisible
from tests.pdf_fabrique import pdf_pivote, pdf_texte

TEXTE = "Prescriptions techniques du lot 05 — façade et isolation thermique par l'extérieur."


@pytest.fixture
def pdf(tmp_path):
    """Un PDF de 2 pages A4 (595 × 842 pt), texte en haut à gauche, bas de page vide."""
    chemin = tmp_path / "cctp.pdf"
    chemin.write_bytes(pdf_texte([TEXTE, "Page deux."], taille=18.0, largeur_car=30))
    return chemin


def _image(octets: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(octets))
    image.load()
    return image


def _sombre(image: Image.Image) -> bool:
    """Vrai si l'image contient des pixels foncés (du texte)."""
    return image.convert("L").getextrema()[0] < 100


def test_page_entiere_en_webp_a_la_largeur_demandee(pdf):
    octets = pdf_rendu.rendre_page_webp(pdf, 0, 600)
    image = _image(octets)
    assert image.format == "WEBP"
    assert image.size == (600, 850)             # ceil(842 × 600 / 595)
    assert _sombre(image)


def test_la_largeur_est_celle_de_l_image_rendue_meme_cadree(pdf):
    image = _image(pdf_rendu.rendre_page_webp(pdf, 0, 300, cadrage=(0.0, 0.0, 0.5, 0.5)))
    assert image.size[0] == 300
    assert abs(image.size[1] - round(421 * 300 / 297.5)) <= 1


def test_le_cadrage_est_en_fractions_origine_en_haut_a_gauche(pdf):
    haut_gauche = _image(pdf_rendu.rendre_page_webp(pdf, 0, 300, cadrage=(0.0, 0.0, 0.6, 0.5)))
    bas_droite = _image(pdf_rendu.rendre_page_webp(pdf, 0, 300, cadrage=(0.5, 0.5, 1.0, 1.0)))
    assert _sombre(haut_gauche)            # le texte est là
    assert not _sombre(bas_droite)         # page blanche en bas à droite


def test_rotation_de_la_page_respectee(pdf):
    pivote = pdf_pivote(pdf_texte([TEXTE], taille=18.0, largeur_car=30), 90)
    chemin = pdf.parent / "pivote.pdf"
    chemin.write_bytes(pivote)
    image = _image(pdf_rendu.rendre_page_webp(chemin, 0, 842))
    assert image.size == (842, 595)        # paysage : largeur et hauteur échangées


def test_deuxieme_page(pdf):
    assert _sombre(_image(pdf_rendu.rendre_page_webp(pdf, 1, 400)))


@pytest.mark.parametrize("index", [2, 99, -1])
def test_page_hors_bornes(pdf, index):
    with pytest.raises(pdf_rendu.PageHorsBornes):
        pdf_rendu.rendre_page_webp(pdf, index, 400)


def test_plafond_de_pixels_refuse_avant_de_rendre(pdf):
    # 4000 px de large sur une page A4 : 4000 × 5662 = 22,6 Mpx > 16 Mpx
    with pytest.raises(pdf_rendu.RenduTropGrand):
        pdf_rendu.rendre_page_webp(pdf, 0, 4000)
    # même largeur sur une zone qui reste sous le plafond : accepté
    assert _image(pdf_rendu.rendre_page_webp(pdf, 0, 4000, cadrage=(0.0, 0.0, 1.0, 0.4))).size[0] == 4000


@pytest.mark.parametrize("largeur", [0, 5, 4097, 100000])
def test_largeur_hors_limites(pdf, largeur):
    with pytest.raises(pdf_rendu.RenduTropGrand):
        pdf_rendu.rendre_page_webp(pdf, 0, largeur)


def test_page_geante_refusee_sans_allouer(tmp_path):
    """Page de 14 400 pt de côté (5 m) rendue à 4096 px : 4096² = 16,8 Mpx > plafond."""
    chemin = tmp_path / "geant.pdf"
    chemin.write_bytes(pdf_pivote(pdf_texte(["x"]), 90, taille_page=(14400.0, 14400.0)))
    with pytest.raises(pdf_rendu.RenduTropGrand):
        pdf_rendu.rendre_page_webp(chemin, 0, 4096)
    assert _image(pdf_rendu.rendre_page_webp(chemin, 0, 1000)).size == (1000, 1000)


@pytest.mark.parametrize("cadrage", [(0.5, 0.0, 0.5, 1.0), (0.6, 0.0, 0.4, 1.0), (-0.1, 0, 1, 1),
                                     (0, 0, 1.2, 1), (0, 0, 1), "abcd", (float("nan"), 0, 1, 1)])
def test_cadrage_invalide(pdf, cadrage):
    with pytest.raises(pdf_rendu.RenduRefuse):
        pdf_rendu.rendre_page_webp(pdf, 0, 400, cadrage=cadrage)


def test_document_illisible(tmp_path):
    chemin = tmp_path / "abime.pdf"
    chemin.write_bytes(b"%PDF-1.4 pas un vrai pdf")
    with pytest.raises(PdfIllisible):
        pdf_rendu.rendre_page_webp(chemin, 0, 400)


def test_le_rendu_passe_par_le_processus_pdfium(pdf, monkeypatch):
    appels = []
    vrai = pp.executer

    def espion(fonction, *args, **kw):
        appels.append((fonction.__name__, kw.get("delai_s")))
        return vrai(fonction, *args, **kw)

    monkeypatch.setattr(pp, "executer", espion)
    pdf_rendu.rendre_page_webp(pdf, 0, 300)
    assert appels == [("_rendre_page", pdf_rendu.DELAI_RENDU_S)]


def test_page_aplatie_est_la_porte_commune_avec_la_lecture():
    """Le rendu utilise l'ouverture et l'aplatissement de pdf_lecture, pas les siens."""
    import inspect
    from services import pdf_lecture
    source = inspect.getsource(pdf_rendu)
    assert "page_aplatie" in source and "import pypdfium2" not in source
    assert callable(pdf_lecture.page_aplatie)
