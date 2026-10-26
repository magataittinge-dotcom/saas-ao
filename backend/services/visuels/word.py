"""Insertion des visuels dans un .docx : SVG vectoriel + PNG de repli + texte alternatif.

Word 365, 2019, 2021 et LibreOffice lisent le SVG (extension `asvg:svgBlip`,
Microsoft « Edit SVG images in Microsoft Office ») ; les versions plus anciennes
prennent le PNG de repli. Le texte alternatif (`descr`) sert l'accessibilité.
"""
from __future__ import annotations

import io

from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls
from docx.shared import Cm

from .texte import nettoyer

SVG_EXT_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}"
NS_ASVG = "http://schemas.microsoft.com/office/drawing/2016/SVG/main"


def inserer_svg_png(paragraphe, svg: str | bytes, png: bytes, largeur_cm: float,
                    texte_alt: str = ""):
    """Ajoute au paragraphe une image PNG portant le SVG en extension. Retourne la forme."""
    if isinstance(svg, str):
        svg = svg.encode("utf-8")
    run = paragraphe.add_run()
    forme = run.add_picture(io.BytesIO(png), width=Cm(largeur_cm))
    package = run.part.package
    n = sum(1 for p in package.iter_parts() if str(p.partname).endswith(".svg")) + 1
    partie = Part(PackURI(f"/word/media/visuel{n}.svg"), "image/svg+xml", svg, package)
    rid = run.part.relate_to(partie, RT.IMAGE)
    blip = forme._inline.graphic.graphicData.pic.blipFill.blip
    ext_lst = OxmlElement("a:extLst")
    ext = OxmlElement("a:ext")
    ext.set("uri", SVG_EXT_URI)
    ext.append(parse_xml(f'<asvg:svgBlip xmlns:asvg="{NS_ASVG}" {nsdecls("r")} r:embed="{rid}"/>'))
    ext_lst.append(ext)
    blip.append(ext_lst)
    texte_alt = nettoyer(texte_alt)
    if texte_alt:
        forme._inline.docPr.set("descr", texte_alt)
        forme._inline.graphic.graphicData.pic.nvPicPr.cNvPr.set("descr", texte_alt)
    return forme


def ajouter_tableau(doc, tab: dict, legende: str | None = None):
    """Tableau Word natif : en-tête colorée répétée d'une page à l'autre, lignes non coupées.
    Le texte est celui des données saisies ; une seconde ligne (après « \\n ») est en gris."""
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor

    entetes, lignes, largeurs = tab["entetes"], tab["lignes"], tab["largeurs_cm"]
    couleur = tab.get("couleur", "#1E40AF").lstrip("#")
    table = doc.add_table(rows=1, cols=len(entetes))
    table.autofit = False
    tbl = table._tbl
    bordures = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>' + "".join(
            f'<w:{c} w:val="single" w:sz="4" w:space="0" w:color="C9D1DB"/>'
            for c in ("top", "left", "bottom", "right", "insideH", "insideV")) + "</w:tblBorders>")
    marges = parse_xml(
        f'<w:tblCellMar {nsdecls("w")}><w:top w:w="50" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
        f'<w:bottom w:w="50" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>')
    look = tbl.tblPr.find(qn("w:tblLook"))        # ordre du schéma : bordures, marges, puis tblLook
    for el in (bordures, marges):
        if look is not None:
            look.addprevious(el)
        else:
            tbl.tblPr.append(el)

    def remplir(cellule, texte, *, entete=False, largeur_cm=None):
        if largeur_cm:
            cellule.width = Cm(largeur_cm)
        p = cellule.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for i, morceau in enumerate(str(texte).split("\n")):
            if i:
                p.add_run().add_break()
            run = p.add_run(morceau)
            run.font.name = "Calibri"
            run.font.size = Pt(9 if i == 0 else 8.5)
            if entete:
                run.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
            elif i:
                run.font.color.rgb = RGBColor(0x5D, 0x6A, 0x79)
        if entete:
            tc_pr = cellule._tc.get_or_add_tcPr()
            tc_pr.append(parse_xml(f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="{couleur}"/>'))

    for i, e in enumerate(entetes):
        remplir(table.rows[0].cells[i], e, entete=True, largeur_cm=largeurs[i])
    for ligne in lignes:
        cells = table.add_row().cells
        for i, v in enumerate(ligne):
            remplir(cells[i], v, largeur_cm=largeurs[i])
    for i, w in enumerate(largeurs):      # grille du tableau (LibreOffice lit tblGrid, pas les cellules)
        table.columns[i].width = Cm(w)
    for k, row in enumerate(table.rows):
        tr_pr = row._tr.get_or_add_trPr()
        tr_pr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
        if k == 0:
            tr_pr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))
    if legende:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(12)
        r = p.add_run(legende)
        r.font.name = "Calibri"
        r.font.size = Pt(9)
        r.font.italic = True
        r.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    return table
