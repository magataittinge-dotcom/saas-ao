"""Bloc 3 « Le Word dit vrai » — tranche 5 : sommaire en deux passes.

Avant : aucun sommaire dans le Word. Un champ TOC créé par programme n'est pas
rempli par LibreOffice sans interface : il garde son texte provisoire.

Maintenant : le Word porte un champ TOC (résultat en cache, `w:updateFields`
pour que Word le recalcule) ; `docx_to_pdf` convertit une 1re fois, lit la page
de chaque titre dans les signets du PDF, écrit les numéros dans le Word et
convertit une 2e fois, une seule conversion LibreOffice à la fois.

Contenu entièrement inventé.
"""
import io
import re
import shutil
import subprocess
import threading
import time
import zipfile

import pytest
from docx import Document
from pypdf import PdfReader

from services import pdf_export
from services.docx_exporter import build_memoire_docx
from services.docx_sommaire import completer_sommaire

needs_soffice = pytest.mark.skipif(
    not (shutil.which("soffice") or shutil.which("libreoffice")),
    reason="LibreOffice absent de l'environnement",
)

PARAGRAPHE = ("Nous organisons le chantier fictif par zones successives, avec un point hebdomadaire "
              "et un compte rendu écrit transmis à la maîtrise d'œuvre. ") * 6


def _section(*phrases: str) -> str:
    return "\n\n".join(PARAGRAPHE + p for p in phrases)


CONTENU = {
    "preambule": _section("Engagement un.", "Engagement deux."),
    "partie_a": {
        "implantation": _section("Siège fictif.", "Zone fictive."),
        "historique": _section("Création fictive.", "Évolution fictive.", "Perspectives fictives."),
        "activites": "### Maçonnerie\n" + _section("Gros œuvre.", "Second œuvre."),
    },
    "partie_b": {"demarrage": _section("Réunion fictive.", "Visite fictive.", "Planning fictif.")},
    "partie_c": {
        "methodologie": _section("Étape une.", "Étape deux.", "Étape trois.", "Étape quatre."),
        "effectifs": _section("Équipe fictive.", "Encadrement fictif."),
    },
}


def _docx() -> bytes:
    return build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST")


def test_le_word_porte_un_champ_toc_avec_une_ligne_par_titre_1_et_2():
    z = zipfile.ZipFile(io.BytesIO(_docx()))
    document = z.read("word/document.xml").decode("utf-8")
    assert 'TOC \\o "1-2"' in document
    assert 'w:dirty="true"' in document
    assert b"<w:updateFields" in z.read("word/settings.xml")
    doc = Document(io.BytesIO(_docx()))
    titres = [p.text for p in doc.paragraphs if p.style.name in ("Heading 1", "Heading 2")]
    lignes = [p.text.split("\t")[0] for p in doc.paragraphs if p.style.name in ("TOC 1", "TOC 2")]
    assert lignes == titres and len(titres) >= 8
    assert lignes[0] == "PRÉAMBULE"
    assert any(p.text == "Sommaire" for p in doc.paragraphs)


def test_completer_sommaire_sans_sommaire_renvoie_none():
    simple = io.BytesIO()
    Document().save(simple)
    assert completer_sommaire(simple.getvalue(), b"%PDF-1.4 vide") is None


def test_completer_sommaire_avec_pdf_illisible_ne_leve_rien():
    assert completer_sommaire(_docx(), b"pas un pdf") is None


@needs_soffice
def test_pdf_sommaire_rempli_titres_et_numeros_justes(tmp_path):
    pdf_octets = pdf_export.docx_to_pdf(_docx())
    chemin = tmp_path / "m.pdf"
    chemin.write_bytes(pdf_octets)
    lecteur = PdfReader(io.BytesIO(pdf_octets))
    assert len(lecteur.pages) >= 6

    def texte(page: int) -> str:
        return subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-layout", str(chemin), "-"],
                              capture_output=True, text=True).stdout

    sommaire = texte(2)
    assert "Sommaire" in sommaire
    assert "se remplit" not in sommaire and "F9" not in sommaire        # pas le texte provisoire

    # chaque ligne « Titre ........ N » : N est la page où le titre est réellement
    lignes = [re.match(r"^\s*(.+?)\s*\.{2,}\s*(\d+)\s*$", l) for l in sommaire.splitlines()]
    entrees = [(m.group(1), int(m.group(2))) for m in lignes if m]
    assert len(entrees) >= 8, sommaire
    assert entrees[0] == ("PRÉAMBULE", 3)
    pages_distinctes = {n for _, n in entrees}
    assert len(pages_distinctes) >= 4
    for titre, numero in entrees:
        titres_de_la_page = [l.strip() for l in texte(numero).splitlines()]
        assert titre in titres_de_la_page, f"« {titre} » absent de la page {numero}"


@needs_soffice
def test_une_seule_conversion_libreoffice_a_la_fois(monkeypatch, tmp_path):
    """Deux exports simultanés (VPS 1 vCPU) : les conversions s'enchaînent."""
    actifs, pic = [0], [0]
    verrou = threading.Lock()
    reel = subprocess.run

    def surveille(cmd, *a, **kw):
        if "--convert-to" not in cmd:
            return reel(cmd, *a, **kw)
        with verrou:
            actifs[0] += 1
            pic[0] = max(pic[0], actifs[0])
        try:
            time.sleep(0.2)
            return reel(cmd, *a, **kw)
        finally:
            with verrou:
                actifs[0] -= 1

    monkeypatch.setattr(pdf_export.subprocess, "run", surveille)
    octets = build_memoire_docx({"preambule": "Texte fictif.", "partie_a": {}}, "P", "E")
    fils = [threading.Thread(target=pdf_export.docx_to_pdf, args=(octets,)) for _ in range(3)]
    for f in fils:
        f.start()
    for f in fils:
        f.join(timeout=300)
    assert pic[0] == 1
