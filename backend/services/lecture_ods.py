"""Lecture des tableurs .ods sans odfpy (bloc 2).

odfpy n'est pas installé en production, l'une de ses licences est la GPL, et il
charge tout content.xml en mémoire. Ici, content.xml est lu directement dans
l'archive (zipfile + lxml.iterparse), ligne par ligne : la mémoire reste bornée
(au plus 64 colonnes et 20 000 lignes par onglet, lignes vides répétées non
développées).

Utilisé par le texte d'une pièce (document_processor), la liste des ouvrages
(dpgf_ouvrages), le contrôle de forme d'une DPGF (dpgf_checker), la détection des
lots (lot_detector) et l'ancre « Voir dans le DCE » (tableur_ancre).
"""
from __future__ import annotations

import zipfile
from typing import Iterator, Tuple

_MAX_COLONNES = 64        # colonnes lues par ligne
_MAX_LIGNES_ODS = 20_000  # lignes lues par onglet
_MAX_CARACTERES_ODS = 50_000_000   # texte développé par fichier (lignes et colonnes répétées comprises)
_MAX_CARACTERES_CELLULE = 10_000   # texte gardé par cellule (revue de sécurité D1 : une cellule de plusieurs Mo)

_ODS_T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
_ODS_O = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
_ODS_P = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p"


def _entier(texte, defaut: int = 1) -> int:
    try:
        return max(int(texte), 0)
    except (TypeError, ValueError):
        return defaut


def texte_cellule(valeur) -> str:
    """Le texte d'une cellule de tableur tel qu'il part vers l'analyse : un nombre entier
    sans « .0 » (un .ods donne 240.0 là où un .xlsx donne 240)."""
    if isinstance(valeur, float) and valeur.is_integer() and abs(valeur) < 1e15:
        return str(int(valeur))
    return str(valeur)


def onglets_ods(chemin, lignes_vides_exactes: bool = False,
                formules_sans_valeur: "list | None" = None,
                lignes_repetees: bool = True) -> Iterator[Tuple[str, Iterator[list]]]:
    """(nom de l'onglet, lignes de valeurs) d'un .ods, lus dans content.xml.

    Valeur d'une cellule : nombre (office:value) ou texte de ses paragraphes.
    Cellules et lignes répétées développées dans des bornes. Bloquant ; la garde
    contre les bombes (garde_archives) est appelée par l'appelant.

    ``lignes_vides_exactes`` : une ligne vide répétée n fois donne n lignes vides (numéros de
    ligne exacts, pour « Voir dans le DCE ») au lieu d'une seule (défaut : économie).

    ``formules_sans_valeur`` : liste à laquelle on ajoute un élément par cellule à formule dont le
    fichier n'a pas enregistré la valeur calculée (tableur jamais recalculé, D2). La cellule est
    lue vide : jamais la formule.

    ``lignes_repetees`` : faux, une ligne répétée n fois n'est donnée qu'une fois (le texte envoyé à
    l'analyse : quelques octets de XML ne deviennent pas des millions de lignes)."""
    from lxml import etree

    developpe = 0     # caractères produits, répétitions comprises
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
            valeurs = _ligne_ods(el, formules_sans_valeur)
            place = _MAX_LIGNES_ODS - len(lignes)
            if developpe > _MAX_CARACTERES_ODS:
                place = 0       # budget de texte épuisé : le reste du fichier n'est plus lu
            if place > 0:
                if any(v not in (None, "") for v in valeurs):
                    repetitions = _entier(el.get(_ODS_T + "number-rows-repeated"))
                    copies = min(repetitions if lignes_repetees else 1, place)
                    poids = max(sum(len(v) for v in valeurs if isinstance(v, str)), 1)
                    copies = max(min(copies, (_MAX_CARACTERES_ODS - developpe) // poids), 1)
                    developpe += copies * poids
                    lignes.extend([valeurs] * copies)
                elif lignes_vides_exactes:
                    lignes.extend([[]] * min(_entier(el.get(_ODS_T + "number-rows-repeated")), place))
                else:
                    lignes.append([])   # une ligne vide suffit, même répétée
            el.clear()
            parent = el.getparent()
            while parent is not None and el.getprevious() is not None:
                del parent[0]


def _ligne_ods(ligne, formules_sans_valeur: "list | None" = None) -> list:
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
            if valeur is not None and len(valeur) > _MAX_CARACTERES_CELLULE:
                valeur = valeur[:_MAX_CARACTERES_CELLULE]
        if (valeur is None and formules_sans_valeur is not None
                and cellule.get(_ODS_T + "formula") and cellule.get(_ODS_O + "value-type") is None):
            formules_sans_valeur.append(1)
        repetitions = _entier(cellule.get(_ODS_T + "number-columns-repeated"))
        valeurs.extend([valeur] * min(repetitions, _MAX_COLONNES - len(valeurs)))
        if len(valeurs) >= _MAX_COLONNES:
            break
    return valeurs
