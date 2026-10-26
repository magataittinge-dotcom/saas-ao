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
    if texte_alt:
        forme._inline.docPr.set("descr", texte_alt)
        forme._inline.graphic.graphicData.pic.nvPicPr.cNvPr.set("descr", texte_alt)
    return forme
