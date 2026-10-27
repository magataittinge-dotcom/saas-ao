"""A1 (sujet A) — texte d'une page indexé par caractère et rectangles des caractères
(``services/pdf_positions.py``). Textes inventés : aucun texte de DCE dans le dépôt."""
import pypdfium2 as pdfium
import pytest

from services import pdf_positions as pp
from services.pdf_lecture import VERROU_PDFIUM
from tests.pdf_fabrique import A4, pdf_regle, pdf_texte, pdf_texte_masque


def _page(octets: bytes, index: int = 0) -> pp.PageTexte:
    with pp.ouvrir(octets) as pdf:
        return pdf.page(index)


def _plage(page: pp.PageTexte, passage: str) -> tuple[int, int]:
    """(a, b) : les index de texte du premier et du dernier caractère du passage."""
    flux, _ = pp.forme_flux(passage)
    k = page.flux.index(flux)
    return page.origine[k], page.origine[k + len(flux) - 1]


# ─── flux ─────────────────────────────────────────────────────────────────────

def test_flux_sans_accents_ponctuation_ni_blancs():
    flux, origine = pp.forme_flux("L’Éléphant : « Œuvre » (AE) — n° 5.")
    assert flux == "lelephantœuvreaen5"
    assert len(origine) == len(flux)


def test_flux_ligature_deux_lettres_meme_origine():
    flux, origine = pp.forme_flux("a ﬁn ﬂ")
    assert flux == "afinfl"
    assert list(origine) == [0, 2, 2, 3, 5, 5]


def test_flux_ignore_cesure_et_masque():
    flux, _ = pp.forme_flux("celui\x02ci\x00 sera")
    assert flux == "celuicisera"


# ─── texte par caractère ──────────────────────────────────────────────────────

def test_texte_par_caractere_aligne_sur_les_index_pdfium():
    octets = pdf_texte(["Règlement de consultation — article 1 : 5 % de retenue.\nSuite à l’œuvre."])
    page = _page(octets)
    with VERROU_PDFIUM:
        pdf = pdfium.PdfDocument(octets)
        try:
            p = pdf[0]
            n = p.get_textpage().count_chars()
            p.close()
        finally:
            pdf.close()
    assert len(page.texte) == n
    assert "Règlement de consultation — article 1 : 5 % de retenue." in page.texte
    assert page.flux.startswith("reglementdeconsultationarticle15deretenue")
    assert page.rotation == 0
    assert (page.largeur, page.hauteur) == A4


def test_page_inexistante_ou_illisible_donne_none():
    with pp.ouvrir(pdf_texte(["Une page."])) as pdf:
        assert pdf.nombre_pages == 1
        assert pdf.page(1) is None and pdf.page(-1) is None


# ─── rectangles ───────────────────────────────────────────────────────────────

def test_rectangle_d_un_mot_en_fractions_origine_en_haut_a_gauche():
    page_pdf = pdf_texte(["Article premier : le candidat fournit un Kbis."])
    with pp.ouvrir(page_pdf) as pdf:
        page = pdf.page(0)
        a, b = _plage(page, "candidat")
        (x0, y0, x1, y1), = pdf.rectangles(0, a, b)
    # texte écrit à x = 72 pt, ligne de base à 100 pt du haut, Helvetica 11
    assert 72 / A4[0] < x0 < x1 < 0.6
    assert 0.09 < y0 < y1 < 0.14
    assert x1 - x0 == pytest.approx(len("candidat") * 11 * 0.5 / A4[0], rel=0.25)


def test_une_ligne_de_plus_descend_et_chaque_ligne_a_son_rectangle():
    texte = "Première ligne du passage cité\nDeuxième ligne du passage cité"
    with pp.ouvrir(pdf_texte([texte], largeur_car=None)) as pdf:
        page = pdf.page(0)
        a, b = _plage(page, "ligne du passage cité Deuxième ligne")
        rects = pdf.rectangles(0, a, b)
    assert len(rects) == 2
    assert rects[0][1] < rects[1][1] and rects[0][3] < rects[1][3]
    assert rects[0][2] > rects[1][2] - 0.2          # fin de la 1re ligne ≈ bord droit du texte


def test_ponctuation_de_bord_dans_la_plage_a_un_rectangle():
    with pp.ouvrir(pdf_texte(["Voir l’acte d’engagement (AE) ci-joint."])) as pdf:
        page = pdf.page(0)
        sans = pdf.rectangles(0, *_plage(page, "acte d’engagement"))
        a, b = _plage(page, "acte d’engagement (AE)")
        avec = pdf.rectangles(0, a, b + 0)           # b = dernière lettre : « E »
        avec_parenthese = pdf.rectangles(0, a, b + 1)  # + « ) »
    assert avec[0][2] > sans[0][2]
    assert avec_parenthese[0][2] > avec[0][2]


def test_cesure_u0002_sans_rectangle_et_passage_sur_deux_lignes():
    with pp.ouvrir(pdf_texte(["Le panneau celui-\nci sera posé en fond de joint."], largeur_car=None)) as pdf:
        page = pdf.page(0)
        assert pp.CESURE in page.texte
        assert "celuicisera" in page.flux
        a, b = _plage(page, "celui-ci sera")
        rects = pdf.rectangles(0, a, b)
        position_cesure = page.texte.index(pp.CESURE)
        # le trait d'union de césure n'a pas de rectangle : la plage qui n'est que lui est vide
        assert pdf.rectangles(0, position_cesure, position_cesure) == []
    assert len(rects) == 2
    assert rects[0][1] < rects[1][1]


def test_texte_masque_ni_dans_le_flux_ni_sous_un_rectangle():
    octets = pdf_texte_masque("Texte visible du haut", "Mention cachee du bas")
    with pp.ouvrir(octets) as pdf:
        page = pdf.page(0)
        assert pp.MASQUE in page.texte
        assert "cachee" not in page.flux and "visible" in page.flux
        rects = pdf.rectangles(0, 0, len(page.texte) - 1)
        # même en demandant toute la page : aucun rectangle sur la moitié basse (masquée)
        assert rects and all(r[3] <= 0.5 for r in rects)
        # le texte masqué lui-même, demandé explicitement, n'a pas de rectangle
        masque = page.texte.index(pp.MASQUE)
        assert pdf.rectangles(0, masque, masque) == []


# ─── rotation et cadre ────────────────────────────────────────────────────────

def test_page_tournee_rotation_decrite_rectangles_dans_la_page_non_tournee():
    droit = pdf_texte(["Plan du bâtiment : façade nord, échelle 1/100."])
    tourne = pdf_regle(droit, rotation=90)
    with pp.ouvrir(droit) as p0, pp.ouvrir(tourne) as p1:
        a, b = _plage(p0.page(0), "façade nord")
        assert p1.page(0).rotation == 90 and p0.page(0).rotation == 0
        # le texte et les rectangles décrivent la page non tournée : identiques
        assert p1.page(0).texte == p0.page(0).texte
        assert p1.rectangles(0, a, b) == p0.rectangles(0, a, b)
        assert (p1.page(0).largeur, p1.page(0).hauteur) == A4


@pytest.mark.parametrize("rotation, attendu", [
    (0, [0.1, 0.2, 0.3, 0.25]),
    (90, [0.75, 0.1, 0.8, 0.3]),
    (180, [0.7, 0.75, 0.9, 0.8]),
    (270, [0.2, 0.7, 0.25, 0.9]),
])
def test_tourner_rectangle_pour_l_affichage(rotation, attendu):
    assert pp.tourner_rectangle([0.1, 0.2, 0.3, 0.25], rotation) == pytest.approx(attendu)


def test_tourner_rectangle_quatre_fois_90_revient_au_depart():
    r = [0.12, 0.34, 0.56, 0.78]
    for _ in range(4):
        r = pp.tourner_rectangle(r, 90)
    assert r == pytest.approx([0.12, 0.34, 0.56, 0.78])


def test_cadre_visible_decale_change_les_fractions():
    droit = pdf_texte(["Article premier : le candidat fournit un Kbis."])
    rogne = pdf_regle(droit, cadre=(36.0, 42.0, 559.0, 800.0))      # 523 × 758
    with pp.ouvrir(droit) as p0, pp.ouvrir(rogne) as p1:
        a, b = _plage(p0.page(0), "candidat")
        (r0,), (r1,) = p0.rectangles(0, a, b), p1.rectangles(0, a, b)
        assert (p1.page(0).largeur, p1.page(0).hauteur) == (523.0, 758.0)
    assert r1[0] == pytest.approx((r0[0] * A4[0] - 36.0) / 523.0, abs=2e-4)
    assert r1[1] == pytest.approx((r0[1] * A4[1] - (A4[1] - 800.0)) / 758.0, abs=2e-4)


def test_texte_vertical_d_un_plan_un_seul_rectangle_et_pas_un_par_lettre():
    from tests.pdf_fabrique import pdf_texte_vertical
    with pp.ouvrir(pdf_texte_vertical("Plan de façade", "Cotes générales du niveau 2")) as pdf:
        page = pdf.page(0)
        a, b = _plage(page, "Cotes générales du niveau 2")
        rects = pdf.rectangles(0, a, b)
        (x0, y0, x1, y1), = rects
        assert (y1 - y0) * A4[1] > 3 * (x1 - x0) * A4[0]        # haut et étroit
        assert len(pdf.rectangles(0, *_plage(page, "Plan de façade"))) == 1
