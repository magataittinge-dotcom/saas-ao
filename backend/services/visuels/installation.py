"""Plan d'installation de chantier : schéma de PRINCIPE, uniquement avec les installations
que l'entreprise a elle-même écrites (matériel, véhicules, précisions du mémoire).

Rien n'est dessiné qui ne soit dans ces champs : un élément n'apparaît que si son mot
(« base vie », « benne », « échafaudage »...) est écrit. Il faut au moins deux éléments pour
qu'il y ait un schéma. La mention « Schéma de principe, non à l'échelle... » est imprimée
dans l'image elle-même, toujours.
"""
from __future__ import annotations

import re

from .couleurs import Theme
from .modele import Visuel
from .organigramme import _norme
from .svg import LARGEUR_PORTRAIT, chemin, cercle, document_svg, hachures_rect, ligne, r, t
from .texte import couper, nettoyer

MENTION = ("Schéma de principe, non à l'échelle, à arrêter en période de préparation avec la maîtrise "
           "d'œuvre et le coordonnateur SPS.")

# élément -> (libellé, mots écrits qui le déclenchent)
ELEMENTS = {
    "base_vie": ("Base vie", ("base vie", "base-vie", "bungalow", "vestiaire", "cantonnement", "algeco", "refectoire")),
    "sanitaires": ("Sanitaires", ("sanitaire", "toilette", " wc", "wc ")),
    "stockage": ("Stockage", ("stockage", "conteneur", "container", "aire de stockage")),
    "gachage": ("Aire de gâchage", ("malaxeur", "betonniere", "gachage")),
    "benne": ("Bennes de tri", ("benne", "tri des dechets")),
    "echafaudage": ("Échafaudage", ("echafaud",)),
    "levage": ("Nacelle / grue", ("nacelle", "grue", "plateforme elevatrice")),
    "cloture": ("Clôture de chantier", ("cloture", "palissade", "barriere")),
}


def elements_declares(*champs: str | None) -> list[str]:
    texte = " " + _norme(" \n ".join(nettoyer(c or "") for c in champs)) + " "
    return [cle for cle, (_, mots) in ELEMENTS.items() if any(m in texte for m in mots)]


def plan_svg(elements: list[str], th: Theme) -> tuple[str, str] | None:
    if len(elements) < 2:
        return None
    W = LARGEUR_PORTRAIT
    H = 262.0
    c: list[str] = []
    x0, y0, w0, h0 = 6, 8, W - 12, H - 40
    clot = "cloture" in elements
    c.append(r(x0, y0, w0, h0, fill="#FAFBFC", stroke=th.accent_fonce if clot else "#9AA4B1", sw=1.8 if clot else 0.9,
               extra=' stroke-dasharray="7 3"' if clot else ' stroke-dasharray="6 2 1 2"'))
    c.append(t(x0 + 6, y0 + 12, "EMPRISE DU CHANTIER", 8, True, th.discret))
    # ouvrage + échafaudage / levage au centre, modules autour (positions de principe)
    cx, cy, cw, ch = 165.0, 62.0, 150.0, 84.0
    if "echafaudage" in elements or "levage" in elements:
        c.append(hachures_rect(cx, cy, cw, ch, 4, 45, "#9AA4B1", 0.7, fond="#E6E9EE"))
        c.append(r(cx, cy, cw, ch, stroke="#6B7686", sw=0.9))
        c.append(r(cx + cw / 2 - 40, cy + ch / 2 - 8, 80, 16, fill="#FFFFFF", rx=2))
        c.append(t(cx + cw / 2, cy + ch / 2 + 3, "Ouvrage", 8.5, True, th.encre, "middle"))
        if "echafaudage" in elements:
            c.append(hachures_rect(cx - 12, cy - 12, cw + 24, 12, 3, 90, th.accent, 0.9, fond="#FFFFFF"))
            c.append(r(cx - 12, cy - 12, cw + 24, 12, stroke=th.accent, sw=0.9))
            c.append(t(cx + cw / 2, cy - 17, "Échafaudage", 8, True, th.accent_fonce, "middle"))
        if "levage" in elements:
            lx, ly = cx + cw / 2 - 40, cy + ch + 12
            c.append(r(lx, ly, 80, 18, fill="#FFFFFF", stroke=th.accent, sw=1, rx=3))
            c.append(t(lx + 40, ly + 12.5, "Nacelle / grue", 8, True, th.encre, "middle"))
    modules = [e for e in ("base_vie", "sanitaires", "stockage", "gachage", "benne") if e in elements]
    slots = [(16, 28), (16, 92), (16, 156), (352, 28), (352, 92), (352, 156)]
    for cle, (sx, sy) in zip(modules, slots):
        libelle = ELEMENTS[cle][0]
        c.append(r(sx, sy + 8, 112, 46, fill="#FFFFFF", stroke=th.accent, sw=1, rx=3))
        for k, ligne_ in enumerate(couper(libelle, 9, 100, True, 2)):
            c.append(t(sx + 56, sy + 36 + k * 10.5 - (5 if len(libelle) > 14 else 0), ligne_, 9, True, th.encre, "middle"))
    if not any(e in elements for e in ("echafaudage", "levage")) and not modules:
        return None
    # mention de principe, toujours ; coupée large pour rester entière même avec une police de repli plus large
    mention = couper(MENTION, 8, W * 0.78, False, 3)
    yy = y0 + h0 + 16
    for i, ligne_ in enumerate(mention):
        c.append(t(2, yy + i * 10, ligne_, 8, False, th.discret))
    hauteur = yy + len(mention) * 10 + 2
    svg = document_svg(W, hauteur, "".join(c), "Plan d'installation de chantier (schéma de principe)")
    noms = [ELEMENTS[e][0] for e in elements]
    alt = "Plan d'installation de chantier, schéma de principe non à l'échelle : " + ", ".join(noms) + "."
    return svg, alt


def construire(materiel: str | None, vehicules: str | None, precisions: str | None, th: Theme) -> Visuel | None:
    res = plan_svg(elements_declares(materiel, vehicules, precisions), th)
    if not res:
        return None
    svg, alt = res
    return Visuel(("partie_b", "demarrage"), svg, alt,
                  "Plan d'installation de chantier — schéma de principe, d'après le matériel et les installations déclarés",
                  17.0)
