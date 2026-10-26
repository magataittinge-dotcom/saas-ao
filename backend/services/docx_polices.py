"""Embarque Carlito dans le .docx (ECMA-376 §17.8.1, police obfusquée).

Pourquoi : les styles du mémoire déclarent Calibri. Sur un serveur sans
`fonts-crosextra-carlito`, LibreOffice sort le PDF en DejaVu Sans (autres
largeurs de lettres, autres coupures de lignes, autre nombre de pages). Avec
Carlito dans le fichier, le PDF a les mêmes lignes que dans Word, quelle que
soit la machine.

Carlito : clone métrique libre de Calibri, SIL Open Font License 1.1, drapeau
d'embarquement `fsType` 0 (installable) — licence dans
`backend/assets/fonts/carlito/OFL.txt`. Dans Word, la Calibri installée reste
utilisée ; la police embarquée sert à LibreOffice et aux Word sans Calibri
(`w:altName`).
"""
from __future__ import annotations

import uuid
from functools import lru_cache
from pathlib import Path

from docx.document import Document as _Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
from lxml import etree

DOSSIER_CARLITO = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "carlito"
_GRAISSES: tuple[tuple[str, str], ...] = (
    ("embedRegular", "Carlito-Regular.ttf"),
    ("embedBold", "Carlito-Bold.ttf"),
    ("embedItalic", "Carlito-Italic.ttf"),
    ("embedBoldItalic", "Carlito-BoldItalic.ttf"),
)
_TYPE_POLICE_OBFUSQUEE = "application/vnd.openxmlformats-officedocument.obfuscatedFont"


@lru_cache(maxsize=1)
def _fichiers_carlito() -> tuple[tuple[str, bytes], ...]:
    return tuple((balise, (DOSSIER_CARLITO / nom).read_bytes()) for balise, nom in _GRAISSES)


def _obfusquer(octets: bytes, cle: str) -> bytes:
    """XOR des 32 premiers octets avec la clé GUID lue à l'envers (§17.8.1)."""
    cle_octets = bytes.fromhex(cle.strip("{}").replace("-", ""))[::-1]
    data = bytearray(octets)
    for i in range(32):
        data[i] ^= cle_octets[i % 16]
    return bytes(data)


def embarquer_carlito(doc: _Document) -> None:
    """Ajoute Carlito (4 graisses) au .docx et la désigne comme police de
    remplacement de Calibri. À appeler une fois par document."""
    table_part = next(
        (rel.target_part for rel in doc.part.rels.values() if rel.reltype == RT.FONT_TABLE), None
    )
    if table_part is None:
        raise RuntimeError("fontTable.xml introuvable dans le modèle Word")
    racine = parse_xml(table_part.blob)

    # Calibri → police de remplacement Carlito
    calibri = next((f for f in racine.findall(qn("w:font")) if f.get(qn("w:name")) == "Calibri"), None)
    if calibri is None:
        calibri = OxmlElement("w:font")
        calibri.set(qn("w:name"), "Calibri")
        racine.append(calibri)
    if calibri.find(qn("w:altName")) is None:
        alt = OxmlElement("w:altName")
        alt.set(qn("w:val"), "Carlito")
        calibri.insert(0, alt)

    police = OxmlElement("w:font")
    police.set(qn("w:name"), "Carlito")
    racine.append(police)
    for rang, (balise, octets) in enumerate(_fichiers_carlito(), start=1):
        cle = "{" + str(uuid.uuid4()).upper() + "}"
        part = Part(
            PackURI(f"/word/fonts/font{rang}.odttf"), _TYPE_POLICE_OBFUSQUEE,
            _obfusquer(octets, cle), doc.part.package,
        )
        rid = table_part.relate_to(part, RT.FONT)
        embed = OxmlElement(f"w:{balise}")
        embed.set(qn("r:id"), rid)
        embed.set(qn("w:fontKey"), cle)
        police.append(embed)
    table_part._blob = etree.tostring(racine, xml_declaration=True, encoding="UTF-8", standalone=True)

    # settings.xml : <w:embedTrueTypeFonts/> avant ses successeurs (Word est strict sur l'ordre)
    reglages = doc.settings.element
    if reglages.find(qn("w:embedTrueTypeFonts")) is None:
        marqueur = OxmlElement("w:embedTrueTypeFonts")
        for nom in ("w:embedSystemFonts", "w:saveSubsetFonts", "w:proofState", "w:defaultTabStop"):
            suivant = reglages.find(qn(nom))
            if suivant is not None:
                suivant.addprevious(marqueur)
                break
        else:
            reglages.append(marqueur)
