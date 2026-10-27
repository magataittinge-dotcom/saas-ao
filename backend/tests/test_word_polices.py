"""Polices du Word et du PDF (bloc 3 tranche 4, puis WORD2 point 5).

Le Word déclare Calibri, présente dans tout Word : il n'embarque aucune police
(~1,1 Mo de moins). Seul le serveur garde Carlito (clone métrique libre de
Calibri, SIL OFL 1.1, fsType 0) pour le PDF : `pdf_export` la montre à
LibreOffice par un fonts.conf du sous-processus, sans paquet système, et
LibreOffice remplace Calibri par Carlito (mêmes largeurs, mêmes coupures).

Le test du PDF vérifie que le texte est bien en Carlito, sans police embarquée
dans le Word. (La comparaison avec l'ancien Word à Carlito embarquée, faite lors de
WORD2, a été retirée avec `docx_polices.py`, supprimé le 27/10 avec l'accord de Mohamed.)
"""
import io
import re
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path

import pytest

from services.docx_exporter import build_memoire_docx

POLICES = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "carlito"
FICHIERS = ("Carlito-Regular.ttf", "Carlito-Bold.ttf", "Carlito-Italic.ttf", "Carlito-BoldItalic.ttf")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

needs_soffice = pytest.mark.skipif(
    not (shutil.which("soffice") or shutil.which("libreoffice"))
    or not (shutil.which("pdffonts") and shutil.which("pdftotext") and shutil.which("pdfinfo")),
    reason="LibreOffice ou poppler-utils absent de l'environnement",
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


def test_le_word_n_embarque_aucune_police_et_declare_calibri():
    octets = build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST")
    z = zipfile.ZipFile(io.BytesIO(octets))
    assert [n for n in z.namelist() if n.startswith("word/fonts/") or n.endswith(".odttf")] == []
    assert b"embedTrueTypeFonts" not in z.read("word/settings.xml")
    styles = z.read("word/styles.xml").decode("utf-8")
    assert 'w:ascii="Calibri"' in styles and "Carlito" not in styles
    table = z.read("word/fontTable.xml").decode("utf-8")
    assert "Carlito" not in table and "embed" not in table


def test_le_word_pese_peu_sans_police_embarquee():
    # Avec les 4 graisses de Carlito embarquées, un Word vide pesait ~1,1 Mo.
    assert len(build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST")) < 150_000


def test_le_fontconfig_du_sous_processus_ajoute_carlito_sans_toucher_au_systeme(tmp_path):
    from services.pdf_export import DOSSIER_CARLITO, _ecrire_fontconfig

    conf = _ecrire_fontconfig(tmp_path).read_text(encoding="utf-8")
    assert "/etc/fonts/fonts.conf" in conf          # la configuration système reste prise en compte
    assert f"<dir>{DOSSIER_CARLITO}</dir>" in conf
    assert DOSSIER_CARLITO.is_dir() and (DOSSIER_CARLITO / "Carlito-Regular.ttf").is_file()


# ── Le PDF ne change pas ─────────────────────────────────────────────────────

def _contenu_long() -> dict:
    """Mémoire fictif d'environ 20 pages : titres, paragraphes, listes, tableaux."""
    para = ("Notre entreprise fictive organise le chantier en phases courtes, avec un point hebdomadaire "
            "sur place, un compte rendu écrit sous vingt-quatre heures et un suivi des réserves tenu à jour "
            "par le conducteur de travaux. Les approvisionnements sont planifiés à la semaine, les livraisons "
            "regroupées pour limiter les nuisances, et les zones de stockage balisées dès l'installation. ")
    tableau = ("| Poste | Effectif | Qualification |\n|---|---|---|\n"
               "| Conducteur de travaux | 1 | Bac+3 bâtiment |\n| Chef d'équipe | 2 | CAP maçon |\n"
               "| Ouvrier qualifié | 6 | CAP / BEP |\n| Apprenti | 1 | Bac pro |\n")

    def section(n: int) -> str:
        return (f"### Point {n}\n\n" + (para * 2 + "\n\n") * 2
                + "- Premier engagement fictif\n- Second engagement fictif\n\n" + tableau + "\n" + para)

    return {
        "preambule": para * 3,
        "partie_a": {k: section(i) for i, k in enumerate(
            ["implantation", "historique", "engagement_qualitatif", "activites", "roles_missions",
             "moyens_informatiques", "vehicules", "materiel", "fournisseurs"])},
        "partie_b": {k: section(i + 20) for i, k in enumerate(
            ["demarrage", "interlocuteur", "qualite_ouvrages", "respect_planning", "securite", "dechets",
             "environnement"])},
        "partie_c": {k: section(i + 40) for i, k in enumerate(
            ["methodologie", "effectifs", "materiels", "hygiene_securite", "mesures_environnementales",
             "gpa", "delai"])},
    }


def _polices_pdf(pdf: Path) -> list[str]:
    sortie = subprocess.run(["pdffonts", str(pdf)], capture_output=True, text=True).stdout
    return [ligne.split()[0].split("+")[-1] for ligne in sortie.splitlines()[2:] if ligne.strip()]


def _nombre_de_pages(pdf: Path) -> int:
    sortie = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", sortie, re.M).group(1))


def _texte_par_page(pdf: Path) -> list[list[str]]:
    """Mots de chaque page, dans l'ordre. Les points de conduite du sommaire
    (leur nombre suit la largeur de la ligne, au 1/100 de point près) sont
    écartés ; ce sont les titres et les numéros de page qui comptent."""
    texte = subprocess.run(["pdftotext", "-raw", str(pdf), "-"], capture_output=True, text=True).stdout
    pages = texte.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    return [re.sub(r"\.{2,}", " ", p).split() for p in pages]


@needs_soffice
def test_le_pdf_exporte_utilise_carlito_pour_le_texte(tmp_path):
    from services.pdf_export import docx_to_pdf

    word = build_memoire_docx(_contenu_long(), "Chantier fictif", "ENTREPRISE TEST")
    assert not [n for n in zipfile.ZipFile(io.BytesIO(word)).namelist() if n.startswith("word/fonts/")]
    pdf = tmp_path / "memoire.pdf"
    pdf.write_bytes(docx_to_pdf(word))

    noms = _polices_pdf(pdf)
    texte = [n for n in noms if not n.startswith("OpenSymbol")]   # OpenSymbol : puces des listes
    assert texte and all(n.startswith("Carlito") for n in texte), noms
    assert not any("DejaVu" in n or "Liberation" in n for n in noms), noms
    assert 18 <= _nombre_de_pages(pdf) <= 24                      # ≈ 20 pages
