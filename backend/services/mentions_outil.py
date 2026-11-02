"""Le mémoire remis à l'acheteur ne nomme jamais l'outil qui l'a préparé.

Recette du 2/11 (mémoire réel, lot 05 de Gueux) : le modèle a recopié la consigne du prompt sur les visuels
(« … sera dessiné par Synorix … »). Toute phrase qui nomme l'outil est retirée à l'export (Word, donc PDF) ;
le reste de la ligne, les listes et les cellules de tableau gardent leur forme. Une ligne qui n'était que
cela disparaît.
"""
from __future__ import annotations

import re

_OUTIL_RE = re.compile(r"\bsynorix\b", re.IGNORECASE)
_FIN_DE_PHRASE_RE = re.compile(r"(?<=[.!?…])\s+")


def _nettoyer_morceau(morceau: str) -> str:
    if not _OUTIL_RE.search(morceau):
        return morceau
    debut = morceau[: len(morceau) - len(morceau.lstrip())]
    fin = morceau[len(morceau.rstrip()):]
    phrases = [p for p in _FIN_DE_PHRASE_RE.split(morceau.strip()) if not _OUTIL_RE.search(p)]
    return debut + " ".join(phrases) + fin if phrases else debut + fin


def retirer_mentions_outil(texte: str) -> str:
    """Retire chaque phrase qui nomme l'outil ; cellule de tableau Markdown par cellule."""
    if not texte or not _OUTIL_RE.search(texte):
        return texte
    lignes: list[str] = []
    for ligne in texte.split("\n"):
        if not _OUTIL_RE.search(ligne):
            lignes.append(ligne)
            continue
        nette = "|".join(_nettoyer_morceau(m) for m in ligne.split("|"))
        if nette.strip():
            lignes.append(nette.rstrip() if not nette.rstrip().endswith("|") else nette)
    return "\n".join(lignes)
