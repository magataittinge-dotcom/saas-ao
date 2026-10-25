"""Lecteur PDF pypdfium2 (``services/pdf_lecture.py``) — plan H, tranche T2 ; pas encore branché.

Plan H, §4.4 : n° 1 normalisation, n° 2 lecteur, n° 4 threads, n° 5 garde d'import ;
plus le texte masqué par un détourage (§2.3), les champs et annotations aplatis (§2.4) et
les pages lourdes (filtre non appliqué, mémoire rendue : §2.3 et §3.3).
"""
import ctypes
import gc
import io
import os
import re
import threading
from pathlib import Path

import pypdf
import pytest

from services import pdf_lecture
from services.pdf_lecture import PdfIllisible, lire_document, lire_pages, normaliser_texte_pdfium
from tests.pdf_fabrique import (
    ecrire_pdf,
    pdf_avec_annotation,
    pdf_avec_page_illisible,
    pdf_texte,
    pdf_texte_masque,
)


# ─── n° 1 : normalisation vers la forme du texte PyMuPDF ─────────────────────

@pytest.mark.parametrize("brut, attendu", [
    ("celui\x02ci sera positionné", "celui-\nci sera positionné\n"),   # trait d'union de fin de ligne
    ("celui\x02\r\nci", "celui-\nci\n"),                              # suivi d'une fin de ligne : un seul \n
    ("celui￾ci", "celui-\nci\n"),                                # forme de get_text_range
    ("ligne 1\r\nligne 2\r\n", "ligne 1\nligne 2\n"),
    ("ligne 1\rligne 2", "ligne 1\nligne 2\n"),
    ("dernière ligne", "dernière ligne\n"),                           # « \n » final, comme PyMuPDF
    ("", ""),                                                          # page vide
])
def test_normalisation_vers_la_forme_pymupdf(brut, attendu):
    assert normaliser_texte_pdfium(brut) == attendu


# ─── n° 2 : lecteur ──────────────────────────────────────────────────────────

def test_pages_vides_a_leur_place_et_accents_aller_retour():
    pages = [
        "Article 1 — Objet du marché",
        "",
        "L’entreprise œuvre à l’ouvrage ; « délai » : 12 mois, retenue de 5 %.\nArticle 3 — Pénalités.",
        "",
    ]
    assert lire_pages(pdf_texte(pages)) == [p + "\n" if p else "" for p in pages]


def test_lecture_par_chemin_et_max_pages(tmp_path):
    chemin = ecrire_pdf(tmp_path / "ccap.pdf", ["Article 1", "Article 2", "Article 3"])
    attendu = ["Article 1\n", "Article 2\n", "Article 3\n"]
    assert lire_pages(chemin) == lire_pages(str(chemin)) == attendu
    assert lire_pages(chemin.read_bytes(), max_pages=2) == attendu[:2]


def _chiffre(octets: bytes, mot_de_passe_d_ouverture: str) -> bytes:
    ecrivain = pypdf.PdfWriter(clone_from=io.BytesIO(octets))
    ecrivain.encrypt(user_password=mot_de_passe_d_ouverture, owner_password="proprietaire",
                     algorithm="AES-128")
    sortie = io.BytesIO()
    ecrivain.write(sortie)
    return sortie.getvalue()


def test_mot_de_passe_d_ouverture_code_4():
    with pytest.raises(PdfIllisible) as erreur:
        lire_pages(_chiffre(pdf_texte(["Acte d'engagement"]), "secret"))
    assert erreur.value.code == pdf_lecture.ERREUR_MOT_DE_PASSE == 4


def test_chiffre_sans_mot_de_passe_d_ouverture_reste_lisible():
    # le cas des 4 CCTP de Gueux chiffrés en AES-128 (H §2.1)
    assert lire_pages(_chiffre(pdf_texte(["Article 1"]), "")) == ["Article 1\n"]


def test_pdf_tronque_code_3():
    octets = pdf_texte(["Article 1", "Article 2"])
    with pytest.raises(PdfIllisible) as erreur:
        lire_pages(octets[: len(octets) // 2])
    assert erreur.value.code == pdf_lecture.ERREUR_FORMAT == 3


@pytest.mark.parametrize("octets", [b"%PDF-1.4 fake", b"ceci n'est pas un PDF", b""])
def test_faux_pdf_illisible(octets):
    with pytest.raises(PdfIllisible) as erreur:
        lire_pages(octets)
    assert erreur.value.code == pdf_lecture.ERREUR_FORMAT


def test_pdf_sans_page_code_exact_meme_apres_une_autre_erreur():
    """pypdfium2 rendrait ici le code de l'erreur précédente du processus (4)."""
    with pytest.raises(PdfIllisible):
        lire_pages(_chiffre(pdf_texte(["Article 1"]), "secret"))
    sortie = io.BytesIO()
    pypdf.PdfWriter().write(sortie)
    with pytest.raises(PdfIllisible) as erreur:
        lire_pages(sortie.getvalue())
    assert erreur.value.code == pdf_lecture.ERREUR_PAGE


def test_page_qui_ne_se_charge_pas_texte_vide_et_numerotee():
    lu = lire_document(pdf_avec_page_illisible(["Article 1", "Article 2", "Article 3"], 2))
    assert lu.pages == ["Article 1\n", "", "Article 3\n"]
    assert lu.illisibles == (2,) and lu.total == 3


def test_aucune_page_lisible_document_illisible():
    with pytest.raises(PdfIllisible) as erreur:
        lire_document(pdf_avec_page_illisible(["Article 1"], 1))
    assert erreur.value.code == pdf_lecture.ERREUR_PAGE


def test_progression_page_par_page_et_nombre_total_de_pages():
    octets = pdf_texte(["Article 1", "", "Article 3"])
    vues = []
    lu = lire_document(octets, on_page=lambda fait, a_lire: vues.append((fait, a_lire)))
    assert vues == [(1, 3), (2, 3), (3, 3)] and lu.total == 3 and lu.illisibles == ()
    vues.clear()
    lu = lire_document(octets, max_pages=2, on_page=lambda fait, a_lire: vues.append((fait, a_lire)))
    assert vues == [(1, 2), (2, 2)] and len(lu.pages) == 2 and lu.total == 3


def test_gros_fichier_ouvert_par_pdfium_sans_etre_charge(tmp_path, monkeypatch):
    import builtins

    chemin = ecrire_pdf(tmp_path / "plan.pdf", ["Plan de masse", "Coupe AA"])
    vrai_open = builtins.open
    ouvertures = []

    def ouvrir(fichier, *args, **kwargs):
        if isinstance(fichier, (str, os.PathLike)) and Path(fichier) == chemin:
            ouvertures.append(fichier)
        return vrai_open(fichier, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", ouvrir)
    monkeypatch.setattr(Path, "read_bytes", lambda self: pytest.fail("fichier chargé par read_bytes"))
    assert lire_pages(chemin) == ["Plan de masse\n", "Coupe AA\n"]
    assert len(ouvertures) == 1                 # petit fichier : lu d'un seul tenant
    ouvertures.clear()
    monkeypatch.setattr(pdf_lecture, "SEUIL_LECTURE_EN_UNE_FOIS", 0)   # « gros » fichier
    assert lire_pages(chemin) == ["Plan de masse\n", "Coupe AA\n"]
    assert ouvertures == []                     # ouvert et lu par PDFium, jamais par Python


def test_chemin_qui_ne_designe_pas_un_fichier(tmp_path):
    with pytest.raises(FileNotFoundError):
        lire_pages(tmp_path / "piece_jamais_deposee.pdf")
    with pytest.raises(FileNotFoundError):
        lire_pages(tmp_path)


# ─── Texte masqué, champs et annotations, pages lourdes ──────────────────────

def test_texte_masque_par_un_detourage_non_lu():
    assert lire_pages(pdf_texte_masque("Article 1 — texte visible.", "Texte caché par le détourage.")) \
        == ["Article 1 — texte visible.\n"]


def test_annotation_lue_apres_aplatissement_mais_page_de_liens_seuls_non_aplatie(monkeypatch):
    aplaties = []
    vrai = pdf_lecture.pdfium_c.FPDFPage_Flatten
    monkeypatch.setattr(pdf_lecture.pdfium_c, "FPDFPage_Flatten",
                        lambda *a: (aplaties.append(a), vrai(*a))[1])
    octets = pdf_avec_annotation("Déclaration de travaux.", texte_annotation="Champ rempli : SARL Exemple.",
                                 lien=True)
    assert lire_pages(octets) == ["Déclaration de travaux.\nChamp rempli : SARL Exemple.\n"]
    assert len(aplaties) == 1
    aplaties.clear()
    assert lire_pages(pdf_avec_annotation("Acte d'engagement.", lien=True)) == ["Acte d'engagement.\n"]
    assert aplaties == []


def test_page_lourde_sans_filtre_et_memoire_rendue(monkeypatch):
    rendue = []
    monkeypatch.setattr(pdf_lecture, "_rendre_la_memoire", lambda: rendue.append(True))
    octets = pdf_texte_masque("Texte visible.", "Texte caché.")
    assert lire_pages(octets) == ["Texte visible.\n"]
    assert rendue == []
    monkeypatch.setattr(pdf_lecture, "SEUIL_OBJETS", 1)   # la page compte 2 objets
    assert lire_pages(octets) == ["Texte visible.\nTexte caché.\n"]
    assert rendue == [True]


# ─── n° 4 : threads ──────────────────────────────────────────────────────────

def test_huit_threads_vingt_lectures_memes_textes():
    """PDFium n'est pas thread-safe et pypdfium2 relâche le GIL : sans le verrou global,
    le processus meurt (H §3.1). Avec : mêmes textes, aucune erreur."""
    documents = [pdf_texte([f"Lot {k:02d} — page {p}, façade et ITE." if p != 1 else "" for p in range(4)])
                 for k in range(4)]
    documents.append(pdf_texte_masque("Texte visible.", "Texte caché."))
    attendus = [lire_pages(octets) for octets in documents]
    faux, erreurs = [], []

    def lire_vingt_fois(n: int) -> None:
        try:
            for j in range(20):
                k = (n + j) % len(documents)
                if lire_pages(documents[k]) != attendus[k]:
                    faux.append((n, j))
        except Exception as e:  # noqa: BLE001 — remontée dans l'assertion
            erreurs.append(repr(e))

    fils = [threading.Thread(target=lire_vingt_fois, args=(n,)) for n in range(8)]
    for fil in fils:
        fil.start()
    for fil in fils:
        fil.join(timeout=60)
    assert not any(fil.is_alive() for fil in fils)
    assert erreurs == [] and faux == []


def test_tout_appel_pdfium_se_fait_sous_le_verrou(monkeypatch):
    """Invariant du module, vérifié appel par appel (un plantage, lui, reste aléatoire) :
    chaque fonction PDFium, fermetures et finaliseurs compris, est appelée par un thread
    qui tient VERROU_PDFIUM."""
    documents = [pdf_texte(["Article 1", "", "Article 3"]), pdf_texte_masque("Visible.", "Caché."),
                 pdf_avec_annotation("Page.", texte_annotation="Champ rempli.", lien=True)]
    hors_verrou = []
    for nom in dir(pdf_lecture.pdfium_c):
        fonction = getattr(pdf_lecture.pdfium_c, nom)
        if nom.startswith("FPDF") and isinstance(fonction, ctypes._CFuncPtr):
            def sonde(*args, _fonction=fonction, _nom=nom):
                if not pdf_lecture.VERROU_PDFIUM._is_owned():
                    hors_verrou.append(_nom)
                return _fonction(*args)
            monkeypatch.setattr(pdf_lecture.pdfium_c, nom, sonde)
    for octets in documents:
        lire_pages(octets)
    with pytest.raises(PdfIllisible):
        lire_pages(b"%PDF-1.4 fake")
    gc.collect()   # un objet pdfium oublié serait fermé ici par son finaliseur, hors verrou
    assert hors_verrou == []


# ─── n° 5 : garde, un seul module importe pypdfium2 ──────────────────────────

_IMPORT_PDFIUM = re.compile(r"^\s*(?:import|from)\s+pypdfium2\b", re.MULTILINE)


def test_pypdfium2_importe_seulement_par_pdf_lecture():
    racine = Path(__file__).resolve().parents[1]
    module = racine / "services" / "pdf_lecture.py"
    fautifs = [
        str(p.relative_to(racine))
        for dossier in ("services", "routers", "tasks")
        for p in (racine / dossier).rglob("*.py")
        if p != module and _IMPORT_PDFIUM.search(p.read_text(encoding="utf-8"))
    ]
    assert fautifs == [], f"pypdfium2 importé hors de services/pdf_lecture.py : {fautifs}"
    assert _IMPORT_PDFIUM.search(module.read_text(encoding="utf-8"))


# PyMuPDF (AGPL) ne reste que là, jusqu'à son retrait : le surligneur (remplacé au
# bloc 5 par le sujet A) et la conversion SVG → PNG de l'organigramme et du Gantt (T8).
_FITZ_PERMIS = {
    "services/pdf_highlighter.py": None,               # tout le module
    "services/organigramme.py": "svg_to_png_bytes",    # cette fonction seulement
    "tests/test_pdf_viewer_highlight.py": None,        # test du surligneur
}


def _imports_pymupdf(source: str) -> list[tuple[int, object]]:
    """(ligne, fonction englobante ou None) de chaque import de fitz / pymupdf."""
    import ast

    trouves = []

    def visiter(noeud, fonction):
        for enfant in ast.iter_child_nodes(noeud):
            if isinstance(enfant, ast.Import):
                modules = [alias.name for alias in enfant.names]
            elif isinstance(enfant, ast.ImportFrom):
                modules = [enfant.module or ""]
            else:
                modules = []
            if any(m.split(".")[0] in ("fitz", "pymupdf") for m in modules):
                trouves.append((enfant.lineno, fonction))
            est_fonction = isinstance(enfant, (ast.FunctionDef, ast.AsyncFunctionDef))
            visiter(enfant, enfant.name if est_fonction else fonction)

    visiter(ast.parse(source), None)
    return trouves


def test_pymupdf_ne_reste_que_dans_le_surligneur_et_le_svg_png():
    racine = Path(__file__).resolve().parents[1]
    fichiers = [p for dossier in ("services", "routers", "tasks", "scripts", "tests")
                for p in (racine / dossier).rglob("*.py")] + sorted(racine.glob("*.py"))
    fautifs = []
    for p in fichiers:
        relatif = p.relative_to(racine).as_posix()
        for ligne, fonction in _imports_pymupdf(p.read_text(encoding="utf-8")):
            if relatif not in _FITZ_PERMIS or _FITZ_PERMIS[relatif] not in (None, fonction):
                fautifs.append(f"{relatif}:{ligne}")
    assert fautifs == [], f"PyMuPDF importé hors du surligneur et de svg_to_png_bytes : {fautifs}"
