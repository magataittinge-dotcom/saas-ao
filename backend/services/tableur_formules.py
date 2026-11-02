"""Formules d'un tableur sans valeur enregistrée (D2).

Vers l'analyse et les contrôles, un tableur part en VALEURS : ce que la cellule affiche, jamais
« =SOMME(B2:B9) ». Un classeur écrit par un outil qui n'a rien calculé (script, export, modèle
jamais ouvert dans un tableur) porte des formules sans valeur en cache : ces cellules ne sont pas
lues (ni leur formule, ni un vide silencieux) et le dépôt le dit, avec la marche à suivre.

Ce module compte ces cellules dans un .xlsx / .xlsm, au fil de l'eau (lxml.iterparse, mémoire
bornée), sans rien charger en entier. La garde anti-bombe (``garde_archives``) est appelée par
l'appelant avant toute ouverture. Pour un .ods, le compte se fait dans ``lecture_ods``.

Règle : une cellule est « sans valeur » si elle porte une formule (``<f>``), n'a pas de valeur
(``<v>`` absent ou vide) et n'est pas typée texte (``t="str"``). Un tableur qui calcule une
chaîne vide (``=SI(A1="";"";…)``) écrit ``t="str"`` avec ``<v/>`` : sa valeur calculée est bien
un texte vide, ce n'est pas un classeur à recalculer.
"""
from __future__ import annotations

import re
import zipfile
from typing import BinaryIO, Union

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_FEUILLE = re.compile(r"xl/worksheets/[^/]+\.xml")
_BALISE_FORMULE = re.compile(rb"<(?:\w+:)?f[ />]")
_MORCEAU = 1024 * 1024
_RECOUVREMENT = 16      # une balise coupée entre deux morceaux est retrouvée


def _contient_une_formule(flux: BinaryIO) -> bool:
    """Recherche d'octets, sans analyse XML : écarte vite les feuilles sans aucune formule."""
    fin = b""
    while True:
        morceau = flux.read(_MORCEAU)
        if not morceau:
            return False
        if _BALISE_FORMULE.search(fin + morceau):
            return True
        fin = morceau[-_RECOUVREMENT:]


def compter_formules_sans_valeur(source: Union[str, bytes, "os.PathLike[str]", BinaryIO]) -> int:
    """Nombre de cellules à formule sans valeur enregistrée dans un .xlsx / .xlsm.

    `source` : chemin, octets ou fichier binaire. Un classeur illisible donne 0 (la lecture du
    texte, elle, le signale)."""
    import io
    from lxml import etree

    if isinstance(source, (bytes, bytearray)):
        source = io.BytesIO(source)
    total = 0
    try:
        with zipfile.ZipFile(source) as archive:
            for info in archive.infolist():
                if not _FEUILLE.fullmatch(info.filename):
                    continue
                with archive.open(info) as flux:
                    if not _contient_une_formule(flux):
                        continue
                with archive.open(info) as flux:
                    for _evt, el in etree.iterparse(
                            flux, events=("end",), tag=(_NS + "c", _NS + "row"),
                            resolve_entities=False, no_network=True, load_dtd=False):
                        if el.tag == _NS + "row":
                            el.clear()
                            parent = el.getparent()
                            while parent is not None and el.getprevious() is not None:
                                del parent[0]
                            continue
                        if el.find(_NS + "f") is not None and el.get("t") != "str":
                            valeur = el.find(_NS + "v")
                            if valeur is None or not (valeur.text or "").strip():
                                total += 1
    except (zipfile.BadZipFile, etree.XMLSyntaxError, KeyError, OSError):
        return 0
    return total


def avertissement_formules(nombre: int) -> str:
    """Le message du dépôt : ce qui n'est pas lu, et quoi faire (jamais « manquant »)."""
    cellules = "1 cellule de calcul n'a" if nombre == 1 else f"{nombre} cellules de calcul n'ont"
    return (f"{cellules} pas de valeur enregistrée dans ce classeur (jamais recalculé) — "
            "les montants correspondants ne sont pas lus : ouvrez-le dans votre tableur, "
            "enregistrez-le puis redéposez-le")
