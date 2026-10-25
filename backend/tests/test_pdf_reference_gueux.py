"""Référence du texte PDF AVANT la bascule PyMuPDF → pypdfium2 (plan H, tranche T0).

``tests/donnees/pdf_reference_gueux.json`` : pour chaque pièce analysée du DCE de
démonstration Gueux (RC, CCAP, AE, CCTP : 27 fichiers, 616 pages), le nombre de pages
et, page par page, l'empreinte SHA-256 du « flux alphanumérique » du texte PyMuPDF
(NFKD, sans accents, minuscules, lettres et chiffres). La clé est le SHA-256 du fichier ;
un fichier déposé deux fois (mêmes octets) compte dans ``occurrences``.

Ce test garde la forme du fichier : aucun nom de fichier ni texte du client n'y entre,
et les totaux restent ceux mesurés par H (27 fichiers, 616 pages).
"""
import json
import re
from pathlib import Path

REFERENCE = Path(__file__).parent / "donnees" / "pdf_reference_gueux.json"
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
