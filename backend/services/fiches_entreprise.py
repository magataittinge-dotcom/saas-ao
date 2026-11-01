"""Fiches « Mon entreprise » : le Word (python-docx) et le PDF (LibreOffice isolé).

Même mise en page que l'aperçu de l'appli (frontend/src/components/fiche/FichePreview.tsx) : bandeau sombre
(logo à gauche sur fond blanc, titre en capitales espacées, sous-titre et contact à droite), ligne d'identité,
quatre tuiles de chiffres, sections numérotées en deux colonnes, tableau des références avec sa ligne TOTAL,
pied de page « raison sociale · forme · SIRET · adresse » et « Page n / N ».

Les données viennent de ``services.fiches_donnees.assembler`` ; le bordereau (titre, sous-titre, contact,
couleur, lignes libres, logo) de la table ``fiches_entreprise``. Le PDF est le Word converti par
``services.libreoffice_isole`` (profil jetable, sans réseau, une conversion à la fois) : rien d'autre ne
touche aux données de l'entreprise pendant la conversion. Réutilise les aides de ``docx_exporter`` (styles,
polices, champs de pied de page, ombrage).
"""
from __future__ import annotations

import io
from typing import Optional

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from schemas.fiches_entreprise import retirer_controles
from services.docx_exporter import (
    _GREY_PG, _add_footer_page_numbers, _effacer_tabulations_du_style, _ombrer, _police_style, _styles,
)
from services.fiches_donnees import INTERVENTIONS, VIDE_SECTION, NBSP
from services.libreoffice_isole import PdfConversionError, convertir_en_pdf, soffice_available  # noqa: F401

LARGEUR_CM = 18.0                      # A4, marges de 1,5 cm
TYPE_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TYPE_PDF = "application/pdf"


# ─── Aides de bas niveau ───────────────────────────────────────────────────────

def _rgb(hexa: str) -> RGBColor:
    h = hexa.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _s(texte) -> str:
    return retirer_controles(str(texte)) if texte is not None else ""


def _hex(couleur: str) -> str:
    return couleur.lstrip("#").upper()


def _espacer(run, points: float) -> None:
    """Approche des capitales (écart entre les lettres), en points."""
    rpr = run._r.get_or_add_rPr()
    e = OxmlElement("w:spacing")
    e.set(qn("w:val"), str(int(points * 20)))
    rpr.append(e)


def _run(para, texte: str, *, taille: float = 9.5, gras: bool = False, couleur: str = "#2b3543",
         italique: bool = False, espace: float = 0, fond: Optional[str] = None):
    r = para.add_run(_s(texte))
    r.font.name = "Calibri"
    r.font.size = Pt(taille)
    r.font.bold = gras
    r.font.italic = italique
    r.font.color.rgb = _rgb(couleur)
    if espace:
        _espacer(r, espace)
    if fond:
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), _hex(fond))
        r._r.get_or_add_rPr().append(shd)
    return r


def _para(cible, *, apres: float = 0, avant: float = 0, align=None, interligne: float = 1.0):
    p = cible.add_paragraph() if hasattr(cible, "add_paragraph") else cible
    p.paragraph_format.space_after = Pt(apres)
    p.paragraph_format.space_before = Pt(avant)
    p.paragraph_format.line_spacing = interligne
    if align is not None:
        p.alignment = align
    return p


def _premier_para(cellule, **kw):
    """Le paragraphe vide qu'une cellule porte déjà."""
    p = cellule.paragraphs[0]
    p.paragraph_format.space_after = Pt(kw.get("apres", 0))
    p.paragraph_format.space_before = Pt(kw.get("avant", 0))
    p.paragraph_format.line_spacing = kw.get("interligne", 1.0)
    if kw.get("align") is not None:
        p.alignment = kw["align"]
    return p


def _bordure(element_pr, cote: str, taille_8e: int, couleur: str = "auto", valeur: str = "single") -> None:
    parent = element_pr.find(qn("w:tcBorders")) if element_pr.tag == qn("w:tcPr") else element_pr.find(qn("w:tblBorders"))
    if parent is None:
        parent = OxmlElement("w:tcBorders" if element_pr.tag == qn("w:tcPr") else "w:tblBorders")
        element_pr.append(parent)
    e = OxmlElement(f"w:{cote}")
    e.set(qn("w:val"), valeur)
    e.set(qn("w:sz"), str(taille_8e))
    e.set(qn("w:space"), "0")
    e.set(qn("w:color"), couleur)
    parent.append(e)


def _table(doc, lignes: int, colonnes: int, largeurs_cm: list[float]):
    t = doc.add_table(rows=lignes, cols=colonnes)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    tbl_pr = t._tbl.tblPr
    disposition = OxmlElement("w:tblLayout")
    disposition.set(qn("w:type"), "fixed")
    tbl_pr.append(disposition)
    for col, l in zip(t.columns, largeurs_cm):
        col.width = Cm(l)
    for ligne in t.rows:
        for cellule, l in zip(ligne.cells, largeurs_cm):
            cellule.width = Cm(l)
    # Aucune bordure par défaut : chaque tableau pose les siennes.
    bordures = OxmlElement("w:tblBorders")
    for cote in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{cote}")
        e.set(qn("w:val"), "nil")
        bordures.append(e)
    tbl_pr.append(bordures)
    return t


def _marges_table(t, haut: float, gauche: float, bas: float, droite: float) -> None:
    """Marges internes des cellules, en cm."""
    marges = OxmlElement("w:tblCellMar")
    for cote, v in (("top", haut), ("left", gauche), ("bottom", bas), ("right", droite)):
        e = OxmlElement(f"w:{cote}")
        e.set(qn("w:w"), str(int(v / 2.54 * 1440)))
        e.set(qn("w:type"), "dxa")
        marges.append(e)
    t._tbl.tblPr.append(marges)


def _filet_bas(para, couleur: str, taille_8e: int = 6, espace: int = 1) -> None:
    ppr = para._p.get_or_add_pPr()
    b = OxmlElement("w:pBdr")
    bas = OxmlElement("w:bottom")
    bas.set(qn("w:val"), "single")
    bas.set(qn("w:sz"), str(taille_8e))
    bas.set(qn("w:space"), str(espace))
    bas.set(qn("w:color"), _hex(couleur))
    b.append(bas)
    ppr.append(b)


def _filet_haut(para, couleur: str, taille_8e: int = 4) -> None:
    ppr = para._p.get_or_add_pPr()
    b = OxmlElement("w:pBdr")
    h = OxmlElement("w:top")
    h.set(qn("w:val"), "single")
    h.set(qn("w:sz"), str(taille_8e))
    h.set(qn("w:space"), "4")
    h.set(qn("w:color"), _hex(couleur))
    b.append(h)
    ppr.append(b)


def _ligne_non_coupee(ligne, entete: bool = False) -> None:
    tr_pr = ligne._tr.get_or_add_trPr()
    tr_pr.append(OxmlElement("w:cantSplit"))
    if entete:
        tr_pr.append(OxmlElement("w:tblHeader"))


# ─── Contenu commun ────────────────────────────────────────────────────────────

def lignes_effectives(section: dict, lignes_libres: list[dict]) -> list[dict]:
    """Lignes de la section, puis les lignes libres du bordereau pour cette section."""
    libres = [{"libelle": _s(l.get("libelle")), "valeur": _s(l.get("valeur"))}
              for l in lignes_libres if l.get("section") == section["id"]]
    return list(section["lignes"]) + libres


def _banniere(doc, bordereau: dict, societe: dict, pal: dict, logo_png: Optional[bytes]) -> None:
    t = _table(doc, 1, 2, [5.0, LARGEUR_CM - 5.0])
    _marges_table(t, 0.35, 0.45, 0.35, 0.45)
    gauche, droite = t.rows[0].cells
    _ombrer(gauche, "FFFFFF")
    _ombrer(droite, _hex(pal["bandeau"]))
    gauche.vertical_alignment = droite.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p = _premier_para(gauche, align=WD_ALIGN_PARAGRAPH.LEFT)
    inseree = False
    if logo_png:
        try:
            p.add_run().add_picture(io.BytesIO(logo_png), height=Cm(1.5))
            inseree = True
        except Exception:
            inseree = False
    if not inseree:
        _run(p, societe["nom"], taille=11, gras=True, couleur=pal["bandeau"])
    p = _premier_para(droite, align=WD_ALIGN_PARAGRAPH.RIGHT, apres=3)
    _run(p, _s(bordereau["titre"]).upper(), taille=15, gras=True, couleur=pal["bandeau_texte"], espace=2.5)
    if bordereau["sous_titre"]:
        p = _para(droite, apres=1, align=WD_ALIGN_PARAGRAPH.RIGHT)
        _run(p, bordereau["sous_titre"], taille=9, couleur="#dbe4ee")
    if bordereau["contact"]:
        p = _para(droite, align=WD_ALIGN_PARAGRAPH.RIGHT)
        _run(p, bordereau["contact"], taille=9, couleur="#dbe4ee")
    # Filet d'accent sous le bandeau (décor : l'accent brut, jamais du texte).
    for cellule in (gauche, droite):
        _bordure(cellule._tc.get_or_add_tcPr(), "bottom", 24, _hex(pal["accent"]))


def _ligne_identite(doc, donnees: dict, pal: dict) -> None:
    p = _para(doc, avant=7, apres=7)
    premier = True
    for x in donnees["identite_ligne"]:
        if not premier:
            _run(p, "   ·   ", taille=9, couleur=pal["filet"])
        premier = False
        _run(p, _s(x["libelle"]).upper() + "  ", taille=7, gras=True, couleur=pal["discret"], espace=1)
        _run(p, x["valeur"], taille=9, gras=True, couleur=pal["encre"])
    _filet_bas(p, pal["filet"], 4, 5)


def _tuiles(doc, donnees: dict, pal: dict) -> None:
    n = len(donnees["tuiles"])
    largeur = LARGEUR_CM / n
    t = _table(doc, 1, n, [largeur] * n)
    _marges_table(t, 0.22, 0.3, 0.22, 0.2)
    t.rows[0].cells  # noqa: B018
    tbl_pr = t._tbl.tblPr
    _bordure(tbl_pr, "insideV", 48, "FFFFFF")      # filet blanc épais : l'espace entre les tuiles
    for cellule, tuile in zip(t.rows[0].cells, donnees["tuiles"]):
        _ombrer(cellule, _hex(pal["accent_pale"]))
        _bordure(cellule._tc.get_or_add_tcPr(), "left", 24, _hex(pal["accent"]))
        p = _premier_para(cellule, apres=0)
        _run(p, tuile["valeur"], taille=17, gras=True, couleur=pal["accent_texte"])
        p = _para(cellule)
        _run(p, _s(tuile["libelle"]).upper(), taille=7, gras=True, couleur=pal["discret"], espace=0.8)
    _para(doc, apres=4)


def _lignes_cles(doc, donnees: dict, pal: dict) -> None:
    if not donnees["lignes_cles"]:
        return
    t = _table(doc, len(donnees["lignes_cles"]), 2, [3.6, LARGEUR_CM - 3.6])
    _marges_table(t, 0.08, 0, 0.08, 0.1)
    for ligne, x in zip(t.rows, donnees["lignes_cles"]):
        p = _premier_para(ligne.cells[0])
        _run(p, _s(x["libelle"]).upper(), taille=7.5, gras=True, couleur=pal["accent_texte"], espace=1)
        p = _premier_para(ligne.cells[1])
        _run(p, x["valeur"], taille=9.5)
    _para(doc, apres=2)


def _section(cellule, section: dict, lignes: list[dict], pal: dict) -> None:
    p = _premier_para(cellule, apres=3)
    _run(p, section["id"] + "  ", taille=11, gras=True, couleur=pal["accent_texte"])
    _run(p, _s(section["titre"]).upper(), taille=8.5, gras=True, couleur=pal["encre"], espace=1.2)
    _filet_bas(p, pal["accent"], 6, 2)
    if section["texte"]:
        p = _para(cellule, avant=2, apres=2)
        _run(p, section["texte"], taille=9)
    if not lignes and not section["texte"]:
        p = _para(cellule, avant=2)
        _run(p, VIDE_SECTION, taille=9, italique=True, couleur=pal["discret"])
        return
    empile = section["disposition"] == "empile"
    retrait = 1.15 if section["disposition"] == "etroit" else 3.1
    for x in lignes:
        p = _para(cellule, avant=1.5, apres=0.5)
        if not x["libelle"]:
            _run(p, x["valeur"], taille=9)
        elif empile:
            _run(p, x["libelle"], taille=9, gras=True, couleur=pal["encre"])
            if x["valeur"]:
                p = _para(cellule, apres=1.5)
                _run(p, x["valeur"], taille=8.5, couleur=pal["discret"])
        else:
            p.paragraph_format.left_indent = Cm(retrait)
            p.paragraph_format.first_line_indent = Cm(-retrait)
            p.paragraph_format.tab_stops.add_tab_stop(Cm(retrait), WD_TAB_ALIGNMENT.LEFT)
            gras_accent = section["disposition"] == "etroit"
            _run(p, x["libelle"], taille=9, gras=True, couleur=pal["accent_texte"] if gras_accent else pal["encre"])
            p.add_run("\t")                                    # tabulation : \t est valide en XML (hors _s)
            _run(p, x["valeur"], taille=9)


def _sections(doc, donnees: dict, lignes_libres: list[dict], pal: dict) -> None:
    sections = donnees["sections"]
    if not sections:
        return
    rangees = (len(sections) + 1) // 2
    t = _table(doc, rangees, 2, [LARGEUR_CM / 2] * 2)
    _marges_table(t, 0.1, 0.0, 0.25, 0.0)
    for i, section in enumerate(sections):
        ligne, colonne = divmod(i, 2)
        cellule = t.rows[ligne].cells[colonne]
        # Gouttière entre les deux colonnes : marge à droite dans la colonne de gauche, à gauche dans l'autre.
        tc_pr = cellule._tc.get_or_add_tcPr()
        marges = OxmlElement("w:tcMar")
        for cote, v in (("left", 0 if colonne == 0 else 0.35), ("right", 0.35 if colonne == 0 else 0)):
            e = OxmlElement(f"w:{cote}")
            e.set(qn("w:w"), str(int(v / 2.54 * 1440)))
            e.set(qn("w:type"), "dxa")
            marges.append(e)
        tc_pr.append(marges)
        _section(cellule, section, lignes_effectives(section, lignes_libres), pal)
    for ligne in t.rows:
        _ligne_non_coupee(ligne)


def _tableau_references(doc, ref: dict, pal: dict) -> None:
    largeurs = [1.0, 4.4, 2.7, 7.3, 2.6]
    t = _table(doc, 1, 5, largeurs)
    _marges_table(t, 0.13, 0.15, 0.13, 0.15)
    _bordure(t._tbl.tblPr, "insideH", 4, _hex(pal["filet"]))
    _bordure(t._tbl.tblPr, "bottom", 4, _hex(pal["filet"]))
    entetes = ("N°", "Client / donneur d'ordre", "Intervention", "Chantier et travaux réalisés", "Montant HT")
    for cellule, texte, i in zip(t.rows[0].cells, entetes, range(5)):
        _ombrer(cellule, _hex(pal["bandeau"]))
        p = _premier_para(cellule, align=WD_ALIGN_PARAGRAPH.RIGHT if i == 4 else None)
        _run(p, texte.upper(), taille=7, gras=True, couleur=pal["bandeau_texte"], espace=0.8)
    _ligne_non_coupee(t.rows[0], entete=True)
    for x in ref["lignes"]:
        ligne = t.add_row()
        _ligne_non_coupee(ligne)
        for cellule, l in zip(ligne.cells, largeurs):
            cellule.width = Cm(l)
        c = ligne.cells
        _run(_premier_para(c[0]), f"{x['numero']:02d}", taille=9, gras=True, couleur=pal["accent_texte"])
        p = _premier_para(c[1])
        _run(p, x["client"] or "—", taille=9, gras=True, couleur=pal["encre"])
        if x["particulier"]:
            _run(p, "  PARTICULIER", taille=6.5, gras=True, couleur=pal["discret"], espace=0.6, fond="#eef1f5")
        if x["client_adresse"]:
            _run(_para(c[1]), x["client_adresse"], taille=8, couleur=pal["discret"])
        p = _premier_para(c[2])
        if x["intervention"]:
            texte = INTERVENTIONS[x["intervention"]]
            fond, encre = {
                "direct": (pal["accent_clair"], pal["accent_texte"]),
                "sous_traitance": ("#fbebcf", "#8a5700"),
                "cotraitance": ("#eef1f5", pal["encre"]),
            }[x["intervention"]]
            _run(p, f" {texte} ", taille=7, gras=True, couleur=encre, espace=0.6, fond=fond)
        p = _premier_para(c[3])
        _run(p, x["chantier"], taille=9, gras=True, couleur=pal["encre"])
        if x["lieu"]:
            _run(_para(c[3]), x["lieu"], taille=8, couleur=pal["discret"])
        if x["travaux"]:
            _run(_para(c[3]), x["travaux"], taille=8.5)
        _run(_premier_para(c[4], align=WD_ALIGN_PARAGRAPH.RIGHT), x["montant"] or "—", taille=9, gras=True,
             couleur=pal["encre"])
    total = ref["total"]
    ligne = t.add_row()
    _ligne_non_coupee(ligne)
    fusion = ligne.cells[0].merge(ligne.cells[3])
    for cellule in (fusion, ligne.cells[4]):
        _ombrer(cellule, _hex(pal["accent_pale"]))
        _bordure(cellule._tc.get_or_add_tcPr(), "top", 12, _hex(pal["accent"]))
    p = _premier_para(fusion)
    n = total["chantiers"]
    _run(p, f"TOTAL  ·  {n} chantier{'s' if n > 1 else ''}", taille=9, gras=True, couleur=pal["accent_texte"],
         espace=0.8)
    if total["sous_traitance"]:
        _run(p, f"  ·  dont {total['sous_traitance']} en sous-traitance", taille=8.5, couleur=pal["discret"])
    _run(_premier_para(ligne.cells[4], align=WD_ALIGN_PARAGRAPH.RIGHT), total["montant"] or "—", taille=10,
         gras=True, couleur=pal["accent_texte"])
    p = _para(doc, avant=6, apres=8)
    _run(p, ref["note"], taille=8, italique=True, couleur=pal["discret"])


def _pied(doc, donnees: dict, pal: dict) -> None:
    section = doc.sections[0]
    _add_footer_page_numbers(section)                       # « Page n / N » (champs PAGE et NUMPAGES)
    pied = section.footer
    page = pied.paragraphs[0]
    page.paragraph_format.space_before = Pt(1)
    page.paragraph_format.space_after = Pt(0)
    identite = pied.add_paragraph()
    identite.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _effacer_tabulations_du_style(identite)
    identite.paragraph_format.space_after = Pt(0)
    _run(identite, donnees["pied"], taille=8, couleur=pal["discret"])
    _filet_haut(identite, pal["filet"])
    page._p.addprevious(identite._p)                        # ligne d'identité d'abord, numéro de page dessous


# ─── Assemblage du document ────────────────────────────────────────────────────

def generer_docx(donnees: dict, bordereau: dict, pal: dict, logo_png: Optional[bytes] = None) -> bytes:
    """Word de la fiche. ``bordereau`` : titre, sous_titre, contact, lignes_libres (valeurs effectives)."""
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21.0), Cm(29.7)
    section.left_margin = section.right_margin = Cm(1.5)
    section.top_margin, section.bottom_margin = Cm(1.2), Cm(1.8)
    section.footer_distance = Cm(0.7)
    _styles(doc)
    normal = doc.styles["Normal"]
    normal.font.size = Pt(9.5)
    _police_style(normal)
    props = doc.core_properties
    props.title = _s(bordereau["titre"])[:200]
    props.author = _s(donnees["societe"]["nom"])[:200] or "Synorix"
    props.last_modified_by = props.author
    props.comments = ""

    pal = dict(pal)
    _banniere(doc, bordereau, donnees["societe"], pal, logo_png)
    _ligne_identite(doc, donnees, pal)
    _tuiles(doc, donnees, pal)
    _lignes_cles(doc, donnees, pal)
    if donnees.get("references") and donnees["references"]["lignes"]:
        _tableau_references(doc, donnees["references"], pal)
    _sections(doc, donnees, bordereau.get("lignes_libres") or [], pal)
    _pied(doc, donnees, pal)
    # Le premier paragraphe du corps (vide, créé par python-docx) n'existe pas : le bandeau ouvre la page.
    sortie = io.BytesIO()
    doc.save(sortie)
    return sortie.getvalue()


def generer_pdf(docx: bytes) -> bytes:
    """PDF de la fiche : le Word converti par LibreOffice isolé. ``PdfConversionError`` si indisponible."""
    return convertir_en_pdf(docx, ".docx")
