"""Schéma de méthodologie : les étapes sont les sous-titres du texte de la méthodologie.

Aucun appel IA et aucune étape inventée : seuls les intertitres du texte (titres Markdown,
lignes entièrement en gras, « Étape 2 : … », « 3. … ») deviennent des cartes, dans l'ordre
du texte. Moins de trois ou plus de douze intertitres : pas de schéma (le texte seul vaut mieux).
"""
from __future__ import annotations

import math
import re

from .couleurs import Theme
from .modele import Visuel
from .svg import LARGEUR_PORTRAIT, cercle, chemin, document_svg, ligne, r, t
from .texte import couper, nettoyer

MIN_ETAPES, MAX_ETAPES = 3, 12

_TITRE_MD = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")
_GRAS = re.compile(r"^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*[:：]?\s*$")
_NUMEROTE = re.compile(r"^\s*(?:(?:étape|phase)\s+)?(\d{1,2})\s*[.):–—-]\s*(?:[:–—-]\s*)?(\S.*)$", re.IGNORECASE)


def _propre(titre: str) -> str:
    titre = re.sub(r"[*_`]+", "", titre)
    titre = re.sub(r"^\s*(?:(?:étape|phase)\s+)?\d{1,2}\s*[.):–—-]+\s*", "", titre, flags=re.IGNORECASE)
    return " ".join(titre.strip(" :：.\t").split())


def etapes_depuis_texte(texte: str) -> list[str]:
    """Intertitres du texte, dans l'ordre ; vide si le nombre d'étapes n'est pas exploitable."""
    etapes: list[str] = []
    for brut in nettoyer(texte or "").split("\n"):
        ligne_ = brut.rstrip()
        if not ligne_.strip() or "[" in ligne_ or "|" in ligne_:
            continue
        titre = None
        if (m := _TITRE_MD.match(ligne_)):
            titre = m.group(1)
        elif (m := _GRAS.match(ligne_)):
            titre = m.group(1)
        elif (m := _NUMEROTE.match(ligne_)) and len(ligne_) <= 90 and not ligne_.rstrip().endswith((".", ";", ",")):
            titre = m.group(2)
        if titre:
            t_ = _propre(titre)
            if 3 <= len(t_) <= 100 and t_.lower() not in {e.lower() for e in etapes}:
                etapes.append(t_)
    return etapes if MIN_ETAPES <= len(etapes) <= MAX_ETAPES else []


def schema_svg(etapes: list[str], th: Theme) -> tuple[str, str] | None:
    if not etapes:
        return None
    W = LARGEUR_PORTRAIT
    cols = 3 if len(etapes) > 4 else min(len(etapes), 4)
    gap, saut = 18.0, 30.0
    cw = (W - 4 - (cols - 1) * gap) / cols
    corps: list[str] = []
    rangs = [etapes[i:i + cols] for i in range(0, len(etapes), cols)]
    y = 6.0
    centres: list[tuple[float, float, float, float]] = []
    for rang in rangs:
        lignes = [couper(e, 9.5, cw - 38, True, 4) for e in rang]
        h = max(44.0, max(len(lg) for lg in lignes) * 11.5 + 18)
        for c, lg in enumerate(lignes):
            x = 2 + c * (cw + gap)
            corps.append(r(x, y, cw, h, fill="#FFFFFF", stroke=th.filet, rx=5))
            corps.append(r(x, y, cw, 4, fill=th.accent))
            n = len(centres) + 1
            corps.append(cercle(x + 16, y + 20, 9.5, fill=th.accent))
            corps.append(t(x + 16, y + 23.4, str(n), 10, True, "#FFFFFF", "middle"))
            yy = y + 21
            for ligne_ in lg:
                corps.append(t(x + 32, yy, ligne_, 9.5, True, th.encre))
                yy += 11.5
            centres.append((x, y, cw, h))
        y += h + saut
    # Flèches : dans une rangée vers la droite ; retour à la ligne : coude sous la rangée
    def pointe(x, y_, sens):
        if sens == "droite":
            return chemin(f"M{x - 6:.1f},{y_ - 3.5:.1f} L{x:.1f},{y_:.1f} L{x - 6:.1f},{y_ + 3.5:.1f} Z", "none", 0, fill=th.accent)
        return chemin(f"M{x - 3.5:.1f},{y_ - 6:.1f} L{x:.1f},{y_:.1f} L{x + 3.5:.1f},{y_ - 6:.1f} Z", "none", 0, fill=th.accent)
    for (x, y0, w, h), (x2, y2, _, _) in zip(centres, centres[1:]):
        if y2 == y0:
            corps.append(ligne(x + w + 1, y0 + h / 2, x2 - 3, y0 + h / 2, th.accent, 1.4))
            corps.append(pointe(x2 - 1, y0 + h / 2, "droite"))
        else:
            ym = y0 + h + saut / 2
            corps.append(chemin(f"M{x + w / 2:.1f},{y0 + h + 1:.1f} V{ym:.1f} H{x2 + w / 2:.1f} V{y2 - 3:.1f}", th.accent, 1.4))
            corps.append(pointe(x2 + w / 2, y2 - 1, "bas"))
    bas = y - saut + 4
    corps.append(t(0, bas + 8, "Étapes : intertitres de la méthodologie rédigée ci-dessus.", 8, False, th.discret))
    svg = document_svg(W, bas + 14, "".join(corps), "Schéma de la méthodologie")
    alt = "Schéma de la méthodologie en " + str(len(etapes)) + " étapes : " + " ; ".join(
        f"{i}. {e}" for i, e in enumerate(etapes, 1)) + "."
    return svg, alt


def construire(texte_methodologie: str, th: Theme) -> Visuel | None:
    res = schema_svg(etapes_depuis_texte(texte_methodologie), th)
    if not res:
        return None
    svg, alt = res
    return Visuel(("partie_c", "methodologie"), svg, alt, "Schéma de la méthodologie", 17.0)
