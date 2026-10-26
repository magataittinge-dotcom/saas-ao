"""Couleurs des visuels : accent de l'entreprise (tiré de son logo) + neutres sobres.

Règle de contraste : tout texte blanc posé sur l'accent respecte 4,5:1 (WCAG AA) ;
l'accent est assombri jusque-là au besoin. Les catégories se distinguent aussi par
la valeur (clair/foncé) et par la forme, pour rester lisibles en noir et blanc.
"""
from __future__ import annotations

import io

ACCENT_PAR_DEFAUT = "#1E40AF"


def _rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex(r: float, g: float, b: float) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(max(0, min(255, round(v))) for v in (r, g, b)))


def melange(a: str, b: str, t: float) -> str:
    return _hex(*(x + (y - x) * t for x, y in zip(_rgb(a), _rgb(b))))


def luminance(h: str) -> float:
    def canal(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = _rgb(h)
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)


def contraste(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


class Theme:
    def __init__(self, accent: str = ACCENT_PAR_DEFAUT):
        while contraste(accent, "#FFFFFF") < 4.5:
            accent = melange(accent, "#000000", 0.08)
        self.accent = accent
        self.accent_fonce = melange(accent, "#000000", 0.35)
        self.accent_moyen = melange(accent, "#FFFFFF", 0.45)
        self.accent_clair = melange(accent, "#FFFFFF", 0.86)
        self.accent_pale = melange(accent, "#FFFFFF", 0.94)
        self.encre = "#0B1220"
        self.texte = "#2B3543"
        self.discret = "#5D6A79"      # contraste 5,5:1 sur blanc
        self.filet = "#C9D1DB"
        self.filet_clair = "#E2E6EB"
        self.fond = "#F5F6F8"
        self.ambre = "#E9A23B"
        self.ambre_texte = "#8A5700"
        self.ambre_clair = "#FBEBCF"
        self.neutre_barre = "#6B7686"


def couleur_dominante_logo(png: bytes) -> str:
    """Couleur dominante non grise d'un logo (Pillow, déterministe). Défaut si illisible."""
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(png)).convert("RGBA").resize((64, 64))
    except Exception:
        return ACCENT_PAR_DEFAUT
    compte: dict[tuple[int, int, int], int] = {}
    px = im.load()
    for r, g, b, a in (px[x, y] for y in range(64) for x in range(64)):  # type: ignore[index, misc]
        if a < 128:
            continue
        if max(r, g, b) - min(r, g, b) < 40 or max(r, g, b) > 240 or max(r, g, b) < 30:
            continue  # gris, blanc, noir : ignorés
        cle = (r // 16 * 16 + 8, g // 16 * 16 + 8, b // 16 * 16 + 8)
        compte[cle] = compte.get(cle, 0) + 1
    if not compte:
        return ACCENT_PAR_DEFAUT
    return _hex(*max(compte, key=lambda k: compte[k]))
