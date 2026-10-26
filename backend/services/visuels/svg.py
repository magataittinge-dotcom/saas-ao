"""Primitives SVG des visuels du mémoire.

Unité du viewBox = 1 point typographique : un texte de 9 unités s'imprime à 9 pt
quand l'image est posée à sa largeur nominale (LARGEUR_PORTRAIT = 17 cm,
LARGEUR_PAYSAGE = 25,7 cm).

Seulement des attributs SVG de base, ce que Word et LibreOffice savent lire :
jamais de <pattern> (LibreOffice le transforme en milliers de petites images),
de <foreignObject>, de filtre ni de <style>. Les hachures sont dessinées en traits.
"""
from __future__ import annotations

import html
import math

from .couleurs import Theme
from .texte import largeur

POLICE = "Carlito, Calibri, 'Liberation Sans', Arial, sans-serif"
LARGEUR_PORTRAIT = 482.0   # 17 cm
LARGEUR_PAYSAGE = 728.0    # 25,7 cm
BALISES_INTERDITES = ("<pattern", "<foreignobject", "<filter", "<style", "<image", "<script")


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def t(x, y, s, taille=9, gras=False, fill="#2B3543", ancre="start", extra=""):
    poids = ' font-weight="bold"' if gras else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{taille}"{poids} fill="{fill}" '
            f'text-anchor="{ancre}"{extra}>{esc(s)}</text>')


def r(x, y, w, h, fill="none", stroke="none", sw=0.75, rx=0, extra=""):
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>')


def ligne(x1, y1, x2, y2, stroke="#C9D1DB", sw=0.75, extra=""):
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{stroke}" stroke-width="{sw}"{extra}/>')


def chemin(d, stroke="#C9D1DB", sw=0.75, fill="none", extra=""):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>'


def cercle(cx, cy, rr, fill="none", stroke="none", sw=0.75, extra=""):
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{rr:.1f}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"{extra}/>')


def document_svg(w: float, h: float, corps: str, titre: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" '
            f'width="{w:.0f}pt" height="{h:.0f}pt" font-family="{POLICE}">'
            f'<title>{esc(titre)}</title>'
            f'<rect width="{w:.0f}" height="{h:.0f}" fill="#FFFFFF"/>{corps}</svg>')


def pastille(x, y, s, th: Theme, fond=None, texte=None, taille=7):
    """Petite étiquette arrondie ; renvoie (svg, largeur)."""
    w = largeur(s, taille, True) + 9
    fond = fond or th.accent_clair
    texte = texte or th.accent_fonce
    return (r(x, y, w, taille + 5, fill=fond, rx=(taille + 5) / 2)
            + t(x + w / 2, y + taille + 1.2, s, taille, True, texte, "middle"), w)


def initiales(nom: str) -> str:
    parties = [p for p in nom.replace("-", " ").split() if p[:1].isalpha()]
    if not parties:
        return "?"
    return (parties[0][0] + (parties[-1][0] if len(parties) > 1 else "")).upper()


def hachures_rect(x, y, w, h, pas, angle, couleur, sw=0.8, fond=None):
    """Hachures dessinées en traits (et non en <pattern>), découpées dans le rectangle."""
    out = r(x, y, w, h, fill=fond) if fond else ""
    a = math.radians(angle)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    coins = [(x, y), (x + w, y), (x, y + h), (x + w, y + h)]
    proj = [cx * nx + cy * ny for cx, cy in coins]
    segments = []
    k = math.floor(min(proj) / pas) * pas
    while k <= max(proj):
        px, py = nx * k, ny * k
        t0, t1 = -1e9, 1e9
        ok = True
        for p_, q_ in ((-dx, px - x), (dx, x + w - px), (-dy, py - y), (dy, y + h - py)):
            if abs(p_) < 1e-12:
                if q_ < 0:
                    ok = False
                    break
            else:
                tt = q_ / p_
                if p_ < 0:
                    t0 = max(t0, tt)
                else:
                    t1 = min(t1, tt)
        if ok and t0 < t1:
            segments.append(f"M{px + dx * t0:.1f},{py + dy * t0:.1f} L{px + dx * t1:.1f},{py + dy * t1:.1f}")
        k += pas
    if segments:
        out += f'<path d="{" ".join(segments)}" stroke="{couleur}" stroke-width="{sw}" fill="none"/>'
    return out


def svg_conforme(svg: str) -> list[str]:
    """Balises interdites présentes dans le SVG (liste vide = conforme)."""
    bas = svg.lower()
    return [b for b in BALISES_INTERDITES if b in bas]
