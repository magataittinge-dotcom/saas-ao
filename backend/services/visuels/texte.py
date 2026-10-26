"""Mesure et coupure du texte avec les largeurs réelles de Carlito (= Calibri).

Pourquoi : pour que le texte tienne dans ses cadres, les lignes des visuels sont
coupées côté serveur avec la chasse réelle de la police, la même que Word
(Calibri), LibreOffice (Carlito) et notre rastériseur PNG. Aucune dépendance à
l'exécution : une table de quelques Ko (`carlito-metriques.json`, extraite de
Carlito-Regular et Carlito-Bold, licence OFL 1.1).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_ICI = Path(__file__).resolve().parent


@lru_cache(maxsize=1)
def _metriques() -> dict:
    return json.loads((_ICI / "carlito-metriques.json").read_text(encoding="utf-8"))


def largeur(texte: str, taille: float, gras: bool = False) -> float:
    """Largeur du texte, dans l'unité de `taille` (points si taille en points)."""
    table = _metriques()["bold" if gras else "regular"]
    largeurs, defaut = table["largeurs"], table["defaut"]
    return sum(largeurs.get(c, defaut) for c in texte) * taille


def _couper_mot(mot: str, taille: float, maxi: float, gras: bool) -> list[str]:
    """Mot plus large que la ligne (long identifiant) : coupé au caractère."""
    morceaux, courant = [], ""
    for c in mot:
        if courant and largeur(courant + c, taille, gras) > maxi:
            morceaux.append(courant)
            courant = c
        else:
            courant += c
    if courant:
        morceaux.append(courant)
    return morceaux


def couper(texte: str, taille: float, maxi: float, gras: bool = False,
           lignes_max: int = 9) -> list[str]:
    """Coupe `texte` en lignes de largeur <= `maxi`. Au-delà de `lignes_max`, la
    dernière ligne finit par « … » (jamais de texte qui déborde)."""
    lignes: list[str] = []
    courante = ""
    for mot in str(texte).split():
        if largeur(mot, taille, gras) > maxi:
            if courante:
                lignes.append(courante)
                courante = ""
            *tetes, queue = _couper_mot(mot, taille, maxi, gras)
            lignes.extend(tetes)
            courante = queue
            continue
        essai = f"{courante} {mot}".strip()
        if largeur(essai, taille, gras) <= maxi:
            courante = essai
        else:
            lignes.append(courante)
            courante = mot
    if courante:
        lignes.append(courante)
    if not lignes:
        return [""]
    if len(lignes) > lignes_max:
        lignes = lignes[:lignes_max]
        while lignes[-1] and largeur(lignes[-1] + "…", taille, gras) > maxi:
            lignes[-1] = lignes[-1][:-1]
        lignes[-1] = lignes[-1].rstrip() + "…"
    return lignes


def tenir_sur_une_ligne(texte: str, taille: float, maxi: float, gras: bool = False) -> str:
    """Texte raccourci par « … » s'il dépasse `maxi` (étiquette sur une ligne)."""
    texte = " ".join(str(texte).split())
    if largeur(texte, taille, gras) <= maxi:
        return texte
    while texte and largeur(texte + "…", taille, gras) > maxi:
        texte = texte[:-1]
    return texte.rstrip() + "…"
