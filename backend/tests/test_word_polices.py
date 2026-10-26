"""Bloc 3 « Le Word dit vrai » — tranche 4 : Carlito embarquée dans le Word.

Avant : le Word déclarait Calibri ; sans `fonts-crosextra-carlito` sur la
machine, LibreOffice sortait le PDF en DejaVu Sans (autres largeurs de lettres,
autres coupures de lignes, autre nombre de pages que dans Word).

Maintenant : Carlito (clone métrique libre de Calibri, SIL OFL 1.1, fsType 0)
est embarquée dans le .docx. Les styles continuent de déclarer Calibri : Word
utilise sa Calibri, LibreOffice remplace Calibri par Carlito embarquée.
"""
import io
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path

import pytest
from lxml import etree

from services.docx_exporter import build_memoire_docx

POLICES = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "carlito"
FICHIERS = ("Carlito-Regular.ttf", "Carlito-Bold.ttf", "Carlito-Italic.ttf", "Carlito-BoldItalic.ttf")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

needs_soffice = pytest.mark.skipif(
    not (shutil.which("soffice") or shutil.which("libreoffice")),
    reason="LibreOffice absent de l'environnement",
)

CONTENU = {
    "preambule": "Engagement **fictif** sur ce marché, avec une *nuance*.",
    "partie_a": {"historique": "Entreprise fictive créée en 2005.\n- Premier point\n- Second point"},
    "partie_b": {}, "partie_c": {"methodologie": "Méthode fictive en trois temps."},
}


def _fsType(chemin: Path) -> int:
    d = chemin.read_bytes()
    n = struct.unpack(">H", d[4:6])[0]
    for i in range(n):
        tag, _, off, _ = struct.unpack(">4sIII", d[12 + 16 * i:28 + 16 * i])
        if tag == b"OS/2":
            return struct.unpack(">H", d[off + 8:off + 10])[0]
    raise AssertionError("table OS/2 introuvable")


def test_polices_et_licence_dans_le_depot():
    for f in FICHIERS:
        assert (POLICES / f).is_file(), f
        assert _fsType(POLICES / f) == 0, f"{f} : intégration non libre"   # fsType 0 = embarquement installable
    ofl = (POLICES / "OFL.txt").read_text(encoding="utf-8")
    assert "SIL OPEN FONT LICENSE Version 1.1" in ofl


def test_le_word_embarque_les_quatre_graisses_et_declare_toujours_calibri():
    octets = build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST")
    z = zipfile.ZipFile(io.BytesIO(octets))
    odttf = [n for n in z.namelist() if n.startswith("word/fonts/") and n.endswith(".odttf")]
    assert len(odttf) == 4
    assert b"embedTrueTypeFonts" in z.read("word/settings.xml")
    styles = z.read("word/styles.xml").decode("utf-8")
    assert 'w:ascii="Calibri"' in styles and "Carlito" not in styles

    table = etree.fromstring(z.read("word/fontTable.xml"))
    carlito = [f for f in table.findall(f"{W}font") if f.get(f"{W}name") == "Carlito"]
    assert len(carlito) == 1
    assert [c.tag.removeprefix(W) for c in carlito[0] if c.tag.startswith(f"{W}embed")] == [
        "embedRegular", "embedBold", "embedItalic", "embedBoldItalic"]
    # Calibri a Carlito pour police de remplacement
    calibri = [f for f in table.findall(f"{W}font") if f.get(f"{W}name") == "Calibri"]
    assert calibri and calibri[0].find(f"{W}altName").get(f"{W}val") == "Carlito"


def test_polices_obfusquees_se_relisent_a_l_identique():
    """ECMA-376 §17.8.1 : les 32 premiers octets sont combinés (XOR) avec la
    clé GUID, lue à l'envers. On refait l'opération inverse."""
    octets = build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST")
    z = zipfile.ZipFile(io.BytesIO(octets))
    table = etree.fromstring(z.read("word/fontTable.xml"))
    rels = etree.fromstring(z.read("word/_rels/fontTable.xml.rels"))
    cibles = {r.get("Id"): r.get("Target") for r in rels}
    carlito = next(f for f in table.findall(f"{W}font") if f.get(f"{W}name") == "Carlito")
    for embed, fichier in zip(carlito, FICHIERS):
        cle = bytes.fromhex(embed.get(f"{W}fontKey").strip("{}").replace("-", ""))[::-1]
        data = bytearray(z.read("word/" + cibles[embed.get(f"{R}id")]))
        for i in range(32):
            data[i] ^= cle[i % 16]
        assert bytes(data) == (POLICES / fichier).read_bytes()


def test_poids_ajoute_au_word_reste_sous_1_5_mo():
    avec = len(build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST"))
    assert avec < 1_500_000


@needs_soffice
def test_pdf_libreoffice_en_carlito_et_non_en_dejavu(tmp_path):
    from services.pdf_export import docx_to_pdf

    pdf = tmp_path / "m.pdf"
    pdf.write_bytes(docx_to_pdf(build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST")))
    sortie = subprocess.run(["pdffonts", str(pdf)], capture_output=True, text=True).stdout
    noms = [ligne.split()[0].split("+")[-1] for ligne in sortie.splitlines()[2:] if ligne.strip()]
    assert any(n.startswith("Carlito") for n in noms), sortie
    assert not any("DejaVu" in n for n in noms), sortie
