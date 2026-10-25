"""Référence du texte PDF AVANT la bascule PyMuPDF → pypdfium2 (plan H, tranche T0).

``tests/donnees/pdf_reference_gueux.json`` : pour chaque pièce analysée du DCE de
démonstration Gueux (RC, CCAP, AE, CCTP : 27 fichiers, 616 pages), le nombre de pages
et, page par page, l'empreinte SHA-256 du « flux alphanumérique » du texte PyMuPDF
(NFKD, sans accents, minuscules, lettres et chiffres). La clé est le SHA-256 du fichier ;
un fichier déposé deux fois (mêmes octets) compte dans ``occurrences``.

Ces tests gardent la forme du fichier (aucun nom de fichier ni texte du client n'y entre,
totaux mesurés par H : 27 fichiers, 616 pages) et comparent l'extraction de l'appli à la
référence (plan H §4.4 n° 10) : mêmes nombres de pages, au moins 570 pages identiques sur
616 (574 mesurées avec pypdfium2). Ce dernier test est sauté si le DCE de Gueux est absent :
il le cherche dans ``uploads/projects/<projet Gueux>/dce`` du backend, ou dans le dossier
donné par ``SYNORIX_DCE_GUEUX`` ; les pièces y sont retrouvées par leur SHA-256.
"""
import hashlib
import json
import os
import re
import unicodedata
from pathlib import Path

import pytest

REFERENCE = Path(__file__).parent / "donnees" / "pdf_reference_gueux.json"
_GUEUX = "dfc6ceb2-e944-4249-af92-d146b1b20b2b"
_DCE_GUEUX = Path(os.environ.get("SYNORIX_DCE_GUEUX")
                  or Path(__file__).resolve().parents[1] / "uploads" / "projects" / _GUEUX / "dce")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_TYPES_ANALYSES = {"rc", "ccap", "cctp", "acte_engagement"}
_TYPES_ANALYSES |= {t + "_template" for t in _TYPES_ANALYSES}


def _reference() -> dict:
    return json.loads(REFERENCE.read_text(encoding="utf-8"))


def test_reference_sans_nom_de_fichier_ni_texte_du_client():
    ref = _reference()
    assert set(ref) == {"description", "lecteur", "flux", "empreinte", "cle",
                        "types", "fichiers", "pages", "pieces"}
    assert ".pdf" not in REFERENCE.read_text(encoding="utf-8").lower()
    for cle, piece in ref["pieces"].items():
        assert _SHA256.fullmatch(cle)
        assert set(piece) == {"type", "occurrences", "pages", "flux"}
        assert all(_SHA256.fullmatch(e) for e in piece["flux"])


def test_reference_totaux_des_pieces_analysees():
    ref = _reference()
    pieces = list(ref["pieces"].values())
    assert set(ref["types"]) <= _TYPES_ANALYSES
    assert {p["type"] for p in pieces} == set(ref["types"])
    assert all(p["pages"] == len(p["flux"]) and p["occurrences"] >= 1 for p in pieces)
    assert sum(p["occurrences"] for p in pieces) == ref["fichiers"] == 27
    assert sum(p["occurrences"] * p["pages"] for p in pieces) == ref["pages"] == 616


_FORMES: dict = {}


def _flux(texte: str) -> str:
    """Le « flux » de la référence : NFKD, accents retirés, minuscules, lettres et chiffres."""
    out = []
    for ch in texte:
        forme = _FORMES.get(ch)
        if forme is None:
            sans_accent = "".join(x for x in unicodedata.normalize("NFKD", ch)
                                  if not unicodedata.combining(x)).lower()
            forme = _FORMES[ch] = "".join(x for x in sans_accent if x.isalnum())
        out.append(forme)
    return "".join(out)


def _empreinte_fichier(chemin: Path) -> str:
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def test_echantillon_fige_gueux_au_moins_570_pages_identiques_sur_616():
    from services.document_processor import DocumentProcessor

    ref = _reference()
    trouvees = {}
    if _DCE_GUEUX.is_dir():
        for chemin in sorted(_DCE_GUEUX.glob("*.pdf")):
            cle = _empreinte_fichier(chemin)
            if cle in ref["pieces"]:
                trouvees.setdefault(cle, chemin)
    if set(trouvees) != set(ref["pieces"]):
        pytest.skip("DCE de démonstration Gueux absent (voir SYNORIX_DCE_GUEUX)")
    identiques = 0
    for cle, chemin in sorted(trouvees.items()):
        piece = ref["pieces"][cle]
        pages: list = []
        DocumentProcessor().extract_ex(chemin, "piece.pdf", on_pages=pages.extend)
        assert len(pages) == piece["pages"], (piece["type"], len(pages), piece["pages"])
        identiques += piece["occurrences"] * sum(
            hashlib.sha256(_flux(p).encode("utf-8")).hexdigest() == attendu
            for p, attendu in zip(pages, piece["flux"]))
    assert identiques >= 570, f"{identiques} pages identiques sur {ref['pages']}"
