"""Lecture des tableurs .ods sans odfpy (bloc 2).

odfpy n'est pas installé en production, l'une de ses licences est la GPL, et il
charge tout content.xml en mémoire. Ici, content.xml est lu directement dans
l'archive (zipfile + lxml.iterparse), ligne par ligne : la mémoire reste bornée
(au plus 64 colonnes et 20 000 lignes par onglet, lignes vides répétées non
développées).

Utilisé par la liste des ouvrages (dpgf_ouvrages), le contrôle de forme d'une
DPGF (dpgf_checker) et la détection des lots (lot_detector).
"""
from __future__ import annotations

import zipfile
from typing import Iterator, Tuple

_MAX_COLONNES = 64        # colonnes lues par ligne
_MAX_LIGNES_ODS = 20_000  # lignes lues par onglet

_ODS_T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
_ODS_O = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
_ODS_P = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p"


def _entier(texte, defaut: int = 1) -> int:
    try:
        return max(int(texte), 0)
    except (TypeError, ValueError):
        return defaut


def onglets_ods(chemin) -> Iterator[Tuple[str, Iterator[list]]]:
    """(nom de l'onglet, lignes de valeurs) d'un .ods, lus dans content.xml.

    Valeur d'une cellule : nombre (office:value) ou texte de ses paragraphes.
    Cellules et lignes répétées développées dans des bornes. Bloquant ; la garde
    contre les bombes (garde_archives) est appelée par l'appelant."""
    from lxml import etree

    with zipfile.ZipFile(chemin) as archive, archive.open("content.xml") as flux:
        nom, lignes = None, []
        for evenement, el in etree.iterparse(
                flux, events=("start", "end"), tag=(_ODS_T + "table", _ODS_T + "table-row"),
                resolve_entities=False, no_network=True, load_dtd=False):
            if el.tag == _ODS_T + "table":
                if evenement == "start":
                    nom, lignes = el.get(_ODS_T + "name") or "", []
                else:
                    yield nom, iter(lignes)
                    nom, lignes = None, []
                    el.clear()
                continue
            if evenement != "end" or nom is None:
                continue
            valeurs = _ligne_ods(el)
            place = _MAX_LIGNES_ODS - len(lignes)
            if place > 0:
                if any(v not in (None, "") for v in valeurs):
                    repetitions = _entier(el.get(_ODS_T + "number-rows-repeated"))
                    lignes.extend([valeurs] * min(repetitions, place))
                else:
                    lignes.append([])   # une ligne vide suffit, même répétée
            el.clear()
            parent = el.getparent()
            while parent is not None and el.getprevious() is not None:
                del parent[0]


def _ligne_ods(ligne) -> list:
    valeurs: list = []
    for cellule in ligne:
        if cellule.tag not in (_ODS_T + "table-cell", _ODS_T + "covered-table-cell"):
            continue
        valeur = None
        if cellule.get(_ODS_O + "value-type") in ("float", "percentage", "currency"):
            try:
                valeur = float(cellule.get(_ODS_O + "value"))
            except (TypeError, ValueError):
                valeur = None
        if valeur is None:
            valeur = "\n".join("".join(p.itertext()) for p in cellule.iter(_ODS_P)) or None
        repetitions = _entier(cellule.get(_ODS_T + "number-columns-repeated"))
        valeurs.extend([valeur] * min(repetitions, _MAX_COLONNES - len(valeurs)))
        if len(valeurs) >= _MAX_COLONNES:
            break
    return valeurs
