"""Socle des visuels du mémoire (bloc 3, tranche 1) : coupure par les largeurs réelles
de Carlito, SVG conforme, PNG de repli par Pillow (sans PyMuPDF), insertion dans le Word
(SVG + PNG de repli + texte alternatif), texte retrouvé dans le PDF.

Toutes les données sont inventées."""
import io
import re
import shutil
import zipfile
from pathlib import Path

import pytest
from docx import Document

from services.visuels import couper, largeur, svg_conforme, svg_vers_png
from services.visuels import svg as S
from services.visuels.couleurs import Theme, contraste

HAS_SOFFICE = bool(shutil.which("soffice") or shutil.which("libreoffice"))
needs_soffice = pytest.mark.skipif(not HAS_SOFFICE, reason="LibreOffice absent de l'environnement")
RACINE = Path(__file__).resolve().parents[1]


def _svg_exemple() -> str:
    th = Theme("#1E40AF")
    corps = (
        S.r(10, 10, 200, 50, fill=th.accent, rx=6)
        + S.t(20, 40, "Conductrice de travaux", 12, True, "#FFFFFF")
        + S.r(10, 70, 200, 40, fill="#FFFFFF", stroke=th.filet, sw=1)
        + S.t(110, 95, "Chef de chantier", 10, False, th.encre, "middle")
        + S.ligne(10, 130, 300, 130, th.accent, 1, ' stroke-dasharray="3 2"')
        + S.chemin("M10,150 Q60,120 110,150 Z", th.accent, 1, fill=th.accent_clair)
        + S.cercle(250, 80, 12, fill=th.ambre)
        + S.hachures_rect(220, 10, 80, 40, 5, 45, "#6B7686", 0.8, fond="#E6E9EE")
    )
    return S.document_svg(320, 170, corps, "Exemple")


# ── Coupure par les largeurs réelles ─────────────────────────────────────────

def test_le_rasteriseur_lit_carlito_dans_assets_fonts():
    """Une seule copie de Carlito dans le dépôt : backend/assets/fonts/carlito (WORD2 point 8)."""
    from services.visuels import raster
    assert raster._POLICES == RACINE / "assets" / "fonts" / "carlito"
    for nom in ("Carlito-Regular.ttf", "Carlito-Bold.ttf"):
        assert raster._police(nom.endswith("Bold.ttf"), 20).path == str(raster._POLICES / nom)


@pytest.mark.parametrize("gras", [False, True])
def test_largeur_egale_a_celle_de_la_police(gras):
    from PIL import ImageFont
    police = ImageFont.truetype(
        str(RACINE / "assets/fonts/carlito" / ("Carlito-Bold.ttf" if gras else "Carlito-Regular.ttf")), 1000)
    for texte in ("Conductrice de travaux", "Isolation thermique par l'extérieur", "WWW iii 0123456789"):
        attendu = police.getlength(texte) / 1000 * 10
        assert largeur(texte, 10, gras) == pytest.approx(attendu, rel=0.02), texte


def test_couper_tient_dans_la_boite():
    texte = "Pose de l'isolant en polystyrène expansé graphité avec chevillage et harpage aux angles"
    lignes = couper(texte, 8.5, 120)
    assert len(lignes) > 1
    assert all(largeur(lg, 8.5) <= 120 for lg in lignes)
    assert " ".join(lignes) == texte  # rien de perdu, rien d'ajouté


def test_couper_mot_trop_long_et_ellipse():
    lignes = couper("Anticonstitutionnellement" * 3, 9, 60)
    assert len(lignes) > 1 and all(largeur(lg, 9) <= 60 for lg in lignes)
    court = couper("un deux trois quatre cinq six sept huit neuf dix onze douze", 9, 50, lignes_max=2)
    assert len(court) == 2 and court[-1].endswith("…") and all(largeur(lg, 9) <= 50 for lg in court)


# ── SVG conforme ─────────────────────────────────────────────────────────────

def test_svg_sans_balise_interdite():
    assert svg_conforme(_svg_exemple()) == []
    mauvais = '<svg><defs><pattern id="p"/></defs><foreignObject/><filter/><style/></svg>'
    assert set(svg_conforme(mauvais)) == {"<pattern", "<foreignobject", "<filter", "<style"}


def test_contraste_texte_blanc_sur_accent():
    for accent in ("#00B7FF", "#7DD3FC", "#A4482A", "#FFD400"):  # cyan clair, jaune : assombris
        assert contraste(Theme(accent).accent, "#FFFFFF") >= 4.5


# ── PNG de repli sans PyMuPDF ────────────────────────────────────────────────

def test_png_de_repli_dimensions_et_contenu():
    from PIL import Image
    png = svg_vers_png(_svg_exemple(), dpi=150)
    im = Image.open(io.BytesIO(png)).convert("RGB")
    assert im.size == (round(320 * 150 / 72), round(170 * 150 / 72))
    k = 150 / 72
    assert im.getpixel((round(15 * k), round(15 * k))) == (0x1E, 0x40, 0xAF)      # aplat de l'accent
    assert im.getpixel((round(2 * k), round(165 * k))) == (255, 255, 255)         # fond blanc
    # le texte blanc est bien dessiné dans le rectangle de l'accent
    zone = im.crop((round(20 * k), round(30 * k), round(150 * k), round(42 * k)))
    assert any(p == (255, 255, 255) for p in zone.getdata())


def test_aucun_import_pymupdf_dans_les_visuels():
    for f in (RACINE / "services/visuels").rglob("*.py"):
        assert not re.search(r"^\s*(import|from)\s+(fitz|pymupdf)\b", f.read_text(encoding="utf-8"), re.M), f


# ── Insertion dans le Word ───────────────────────────────────────────────────

def _docx_avec_visuel(texte_alt="Organigramme du chantier") -> bytes:
    from services.docx_exporter import _ajouter_visuel
    doc = Document()
    svg = _svg_exemple()
    _ajouter_visuel(doc, svg, svg_vers_png(svg), 12.0, texte_alt)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_word_contient_svg_png_et_texte_alternatif():
    z = zipfile.ZipFile(io.BytesIO(_docx_avec_visuel()))
    noms = z.namelist()
    assert any(n.startswith("word/media/visuel") and n.endswith(".svg") for n in noms)
    assert any(n.endswith(".png") for n in noms)
    xml = z.read("word/document.xml").decode("utf-8")
    assert "svgBlip" in xml
    assert 'descr="Organigramme du chantier"' in xml
    assert "Conductrice de travaux" in z.read("word/media/visuel1.svg").decode("utf-8")


@needs_soffice
def test_texte_du_visuel_present_dans_le_pdf():
    from services.pdf_export import docx_to_pdf
    from services.pdf_lecture import lire_pages
    pdf = docx_to_pdf(_docx_avec_visuel())
    texte = " ".join(lire_pages(pdf))
    assert "Conductrice de travaux" in texte and "Chef de chantier" in texte
