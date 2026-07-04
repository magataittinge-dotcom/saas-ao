"""Convertit le content_json d'un mémoire technique en fichier .docx formaté."""
from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

_MAP_PLACEHOLDER_RE = re.compile(r"\[📍.*?(?:carte|localisation|Google Maps).*?\]", re.IGNORECASE | re.DOTALL)


# ─── Couleurs ──────────────────────────────────────────────────────────────────
_BLUE_H1  = RGBColor(0x1E, 0x40, 0xAF)
_BLUE_H2  = RGBColor(0x1D, 0x4E, 0xD8)
_GREY_TXT = RGBColor(0x1F, 0x2D, 0x3D)
_GREY_META= RGBColor(0x6B, 0x72, 0x80)
_GREY_PG  = RGBColor(0x9C, 0xA3, 0xAF)

_PART_A: list[tuple[str, str]] = [
    ("implantation",          "1. Implantation géographique"),
    ("historique",            "2. Historique"),
    ("engagement_qualitatif", "3. Engagement qualitatif"),
    ("activites",             "4. Nos activités"),
    ("organigramme",          "5. Organigramme"),
    ("roles_missions",        "6. Rôles et missions de l'équipe d'encadrement"),
    ("moyens_informatiques",  "7. Moyens informatiques"),
    ("vehicules",             "8. Véhicules"),
    ("materiel",              "9. Matériel"),
    ("references",            "10. Références chantiers"),
    ("fournisseurs",          "11. Fournisseurs"),
]
_PART_B: list[tuple[str, str]] = [
    ("demarrage",        "1. Démarrage du chantier"),
    ("interlocuteur",    "2. Interlocuteur dédié"),
    ("qualite_ouvrages", "3. Qualité des ouvrages"),
    ("respect_planning", "4. Respect du planning"),
    ("securite",         "5. Dispositions relatives à la sécurité"),
    ("dechets",          "6. Traitement des déchets"),
    ("environnement",    "7. Environnement"),
]
_PART_C: list[tuple[str, str]] = [
    ("methodologie",             "1. Méthodologie détaillée"),
    ("effectifs",                "2. Effectifs dédiés au chantier"),
    ("materiels",                "3. Matériels dédiés"),
    ("hygiene_securite",         "4. Hygiène et sécurité"),
    ("mesures_environnementales","5. Mesures environnementales"),
    ("gpa",                      "6. Garantie de parfait achèvement (GPA)"),
    ("delai",                    "7. Délai de travaux"),
]


# ─── Helpers document ──────────────────────────────────────────────────────────

def _page_number_field(para, label: str):
    """Ajoute un champ Word (PAGE ou NUMPAGES) après un run de label."""
    run = para.add_run(label)
    run.font.size = Pt(9)
    run.font.color.rgb = _GREY_PG
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.text = label.strip() if label.strip() in ("PAGE", "NUMPAGES") else label.strip()
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)


def _add_footer_page_numbers(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    para = footer.paragraphs[0]
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    r_before = para.add_run("Page ")
    r_before.font.size = Pt(9)
    r_before.font.color.rgb = _GREY_PG

    # Champ PAGE
    for fld_type, instr_text in [("begin", ""), ("", "PAGE"), ("end", "")]:
        if fld_type:
            elem = OxmlElement("w:fldChar")
            elem.set(qn("w:fldCharType"), fld_type)
            r_before._r.append(elem)
        elif instr_text:
            instr = OxmlElement("w:instrText")
            instr.text = instr_text
            r_before._r.append(instr)

    r_sep = para.add_run(" / ")
    r_sep.font.size = Pt(9)
    r_sep.font.color.rgb = _GREY_PG

    # Champ NUMPAGES
    for fld_type, instr_text in [("begin", ""), ("", "NUMPAGES"), ("end", "")]:
        if fld_type:
            elem = OxmlElement("w:fldChar")
            elem.set(qn("w:fldCharType"), fld_type)
            r_sep._r.append(elem)
        elif instr_text:
            instr = OxmlElement("w:instrText")
            instr.text = instr_text
            r_sep._r.append(instr)


def _setup_doc(org_name: str) -> Document:
    doc = Document()
    section = doc.sections[0]
    section.top_margin    = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin   = Cm(2.0)
    section.right_margin  = Cm(2.0)

    # Header : nom entreprise à droite
    header = section.header
    header.is_linked_to_previous = False
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hp.add_run(org_name)
    hr.font.name = "Calibri"
    hr.font.size = Pt(9)
    hr.font.color.rgb = _GREY_META

    _add_footer_page_numbers(section)

    # Police par défaut
    try:
        doc.styles["Normal"].font.name = "Calibri"
        doc.styles["Normal"].font.size = Pt(11)
    except KeyError:
        pass

    return doc


def _centered_line(doc: Document, text: str, *, size: int, color, bold: bool = False,
                   space_after: int = 6):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    p.paragraph_format.space_after = Pt(space_after)
    return p


def _cover_page(
    doc: Document,
    project_name: str,
    org_name: str,
    *,
    logo_image: bytes | None = None,
    lot_name: str | None = None,
    maitre_ouvrage: str | None = None,
    org_address: str | None = None,
    org_siret: str | None = None,
):
    """C8b — page de garde sobre : logo (si présent), marché, lot, MOA,
    date, coordonnées entreprise. Sans logo → texte propre, jamais de
    placeholder d'image cassé."""
    for _ in range(2):
        doc.add_paragraph()

    if logo_image:
        try:
            p_logo = doc.add_paragraph()
            p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_logo.add_run().add_picture(io.BytesIO(logo_image), width=Cm(4.5))
            p_logo.paragraph_format.space_after = Pt(18)
        except Exception:
            # Logo illisible → page de garde texte propre, pas d'image cassée.
            pass

    _centered_line(doc, "MÉMOIRE TECHNIQUE", size=13, color=_GREY_META, space_after=14)
    _centered_line(doc, project_name.upper(), size=24, color=_BLUE_H1, bold=True, space_after=10)
    if lot_name:
        _centered_line(doc, lot_name, size=14, color=RGBColor(0x03, 0x69, 0xA1), space_after=8)
    if maitre_ouvrage:
        _centered_line(
            doc, f"Maître d'ouvrage : {maitre_ouvrage}", size=11,
            color=RGBColor(0x47, 0x55, 0x69), space_after=16,
        )

    _centered_line(doc, org_name, size=13, color=RGBColor(0x37, 0x41, 0x51))
    if org_address:
        _centered_line(doc, org_address, size=10, color=_GREY_PG, space_after=2)
    if org_siret:
        _centered_line(doc, f"SIRET {org_siret}", size=10, color=_GREY_PG, space_after=2)

    _centered_line(doc, datetime.now().strftime("%B %Y").capitalize(), size=11, color=_GREY_PG)

    doc.add_page_break()


def _h1(doc: Document, text: str):
    p = doc.add_heading(text, level=1)
    run = p.runs[0] if p.runs else p.add_run(text)
    run.font.color.rgb = _BLUE_H1
    run.font.name = "Calibri"
    run.font.size = Pt(16)
    p.paragraph_format.space_before = Pt(20)
    p.paragraph_format.space_after  = Pt(8)


def _h2(doc: Document, text: str):
    p = doc.add_heading(text, level=2)
    run = p.runs[0] if p.runs else p.add_run(text)
    run.font.color.rgb = _BLUE_H2
    run.font.name = "Calibri"
    run.font.size = Pt(13)
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after  = Pt(4)


def _body(doc: Document, text: str, *, skip_map_placeholder: bool = False):
    """Ajoute le texte ligne par ligne — gère les puces et le gras **...**."""
    for line in text.split("\n"):
        stripped = line.rstrip()
        if not stripped:
            continue

        # Skip the map placeholder line — it will be replaced by the actual image
        if skip_map_placeholder and _MAP_PLACEHOLDER_RE.search(stripped):
            continue

        is_bullet = bool(re.match(r"^[-*]\s+", stripped))
        content = re.sub(r"^[-*]\s+", "", stripped) if is_bullet else stripped

        if is_bullet:
            p = doc.add_paragraph(style="List Bullet")
        else:
            p = doc.add_paragraph()

        p.paragraph_format.space_after = Pt(4)

        for part in re.split(r"(\*\*.*?\*\*)", content):
            r = p.add_run(part[2:-2] if part.startswith("**") and part.endswith("**") else part)
            r.bold = part.startswith("**") and part.endswith("**")
            r.font.name = "Calibri"
            r.font.size = Pt(11)
            r.font.color.rgb = _GREY_TXT


def _add_map_image(doc: Document, map_image: bytes, caption: str):
    """Insert a map PNG image with a caption below it."""
    img_stream = io.BytesIO(map_image)
    p_img = doc.add_paragraph()
    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p_img.add_run()
    run.add_picture(img_stream, width=Cm(15))
    p_img.paragraph_format.space_before = Pt(8)
    p_img.paragraph_format.space_after = Pt(4)

    p_cap = doc.add_paragraph()
    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap = p_cap.add_run(caption)
    r_cap.font.name = "Calibri"
    r_cap.font.size = Pt(9)
    r_cap.font.italic = True
    r_cap.font.color.rgb = _GREY_META
    p_cap.paragraph_format.space_after = Pt(12)


def _add_part(
    doc: Document,
    title: str,
    part: dict[str, Any],
    sections: list[tuple[str, str]],
    *,
    map_image: bytes | None = None,
    map_caption: str | None = None,
    organigramme_image: bytes | None = None,
):
    _h1(doc, title)
    for key, label in sections:
        text = (part or {}).get(key, "")
        if text and text.strip():
            _h2(doc, label)
            if key == "implantation" and map_image:
                _body(doc, text, skip_map_placeholder=True)
                _add_map_image(doc, map_image, map_caption or "")
            elif key == "effectifs" and organigramme_image:
                # C8a — organigramme du chantier sous les moyens humains
                _body(doc, text)
                _add_map_image(doc, organigramme_image, "Organigramme du chantier")
            else:
                _body(doc, text)


# ─── Point d'entrée public ─────────────────────────────────────────────────────

def build_memoire_docx(
    content_json: dict[str, Any],
    project_name: str,
    org_name: str,
    *,
    map_image: bytes | None = None,
    map_caption: str | None = None,
    organigramme_image: bytes | None = None,
    logo_image: bytes | None = None,
    lot_name: str | None = None,
    maitre_ouvrage: str | None = None,
    org_address: str | None = None,
    org_siret: str | None = None,
) -> bytes:
    """Retourne les bytes du .docx prêt à être streamé en réponse HTTP."""
    doc = _setup_doc(org_name)
    _cover_page(
        doc, project_name, org_name,
        logo_image=logo_image, lot_name=lot_name, maitre_ouvrage=maitre_ouvrage,
        org_address=org_address, org_siret=org_siret,
    )

    preambule = content_json.get("preambule", "")
    if preambule and preambule.strip():
        _h1(doc, "PRÉAMBULE")
        _body(doc, preambule)

    _add_part(doc, "PARTIE A — PRÉSENTATION GÉNÉRALE",       content_json.get("partie_a", {}), _PART_A, map_image=map_image, map_caption=map_caption)
    _add_part(doc, "PARTIE B — PRÉSENTATION DE LA PRESTATION", content_json.get("partie_b", {}), _PART_B)
    _add_part(doc, "PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE",   content_json.get("partie_c", {}), _PART_C, organigramme_image=organigramme_image)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ─── Compatibilité avec routers/export.py ──────────────────────────────────────

class DocxExporter:
    """Façade conservée pour la rétrocompatibilité avec routers/export.py."""

    def export(self, content_json: dict, organization) -> bytes:
        org_name = organization.name if organization else "Entreprise"
        project_name = content_json.get("_project_name", "Projet")
        return build_memoire_docx(content_json, project_name, org_name)
