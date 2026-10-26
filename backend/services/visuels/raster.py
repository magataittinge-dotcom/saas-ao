"""SVG des visuels -> PNG de repli, avec Pillow seul (licence HPND, déjà en dépendance).

Le PNG ne sert qu'aux Word qui ne lisent pas le SVG (Word 2016 et avant) : Word 365,
2019, 2021 et LibreOffice prennent le SVG vectoriel. Le rastériseur ne lit donc que
le sous-ensemble SVG que produit `svg.py` (rect, line, path M/L/H/V/Q/Z, circle,
text, g/translate), sans dépendance AGPL/GPL/LGPL (PyMuPDF, CairoSVG, svglib exclus).

Anticrénelage par suréchantillonnage (x2 puis réduction LANCZOS).
"""
from __future__ import annotations

import io
import math
import re
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_POLICES = Path(__file__).resolve().parent / "polices"
_NS = "{http://www.w3.org/2000/svg}"
_SUREC = 2
_PX_MAX = 16_000_000
DPI_DEFAUT = 150
DPI_MIN = 36


class VisuelTropGrand(ValueError):
    """La toile du visuel dépasse le plafond mémoire, même à la résolution minimale."""


@lru_cache(maxsize=8)
def _police(gras: bool, taille_px: int) -> ImageFont.FreeTypeFont:
    nom = "Carlito-Bold.ttf" if gras else "Carlito-Regular.ttf"
    return ImageFont.truetype(str(_POLICES / nom), taille_px)


def _couleur(valeur: str | None):
    if not valeur or valeur == "none":
        return None
    v = valeur.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def _nombre(valeur, defaut=0.0) -> float:
    try:
        return float(valeur)
    except (TypeError, ValueError):
        return defaut


def _dimension(valeur, total: float) -> float:
    """Longueur SVG : nombre, ou pourcentage de la boîte de la vue."""
    if isinstance(valeur, str) and valeur.strip().endswith("%"):
        return _nombre(valeur.strip()[:-1]) / 100.0 * total
    return _nombre(valeur)


_JETON = re.compile(r"([MLHVQZmlhvqz])|(-?\d*\.?\d+(?:e-?\d+)?)")


def _sous_chemins(d: str) -> list[tuple[list[tuple[float, float]], bool]]:
    """Chemin SVG (M L H V Q Z, absolus) -> [(points, fermé)]."""
    jetons = [(m.group(1), m.group(2)) for m in _JETON.finditer(d)]
    res, pts, ferme = [], [], False
    cmd, nombres = None, []
    x = y = 0.0

    def vider():
        nonlocal pts, ferme
        if pts:
            res.append((pts, ferme))
        pts, ferme = [], False

    def appliquer(cmd, n):
        nonlocal x, y, pts, ferme
        if cmd == "M" and len(n) >= 2:
            vider()
            x, y = n[0], n[1]
            pts = [(x, y)]
        elif cmd == "L" and len(n) >= 2:
            x, y = n[0], n[1]
            pts.append((x, y))
        elif cmd == "H" and n:
            x = n[0]
            pts.append((x, y))
        elif cmd == "V" and n:
            y = n[0]
            pts.append((x, y))
        elif cmd == "Q" and len(n) >= 4:
            cx, cy, ex, ey = n[:4]
            for i in range(1, 13):
                u = i / 12
                pts.append(((1 - u) ** 2 * x + 2 * (1 - u) * u * cx + u * u * ex,
                            (1 - u) ** 2 * y + 2 * (1 - u) * u * cy + u * u * ey))
            x, y = ex, ey

    taille = {"M": 2, "L": 2, "H": 1, "V": 1, "Q": 4}
    for lettre, nb in jetons:
        if lettre:
            if cmd and cmd != "Z" and nombres and len(nombres) >= taille.get(cmd, 99):
                appliquer(cmd, nombres)
            nombres = []
            cmd = lettre.upper() if lettre.isupper() else lettre
            if cmd == "Z":
                ferme = True
                if pts:
                    x, y = pts[0]
        else:
            nombres.append(float(nb))
            k = taille.get(cmd or "")
            if k and len(nombres) == k:
                appliquer(cmd, nombres)
                nombres = []
                if cmd == "M":
                    cmd = "L"   # paires suivantes d'un M = segments
    vider()
    return res


def _tirets(points, motif, sw):
    """Découpe une polyligne selon stroke-dasharray (liste de longueurs)."""
    segs, reste, idx, trace = [], motif[0], 0, True
    courant = [points[0]]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        pos = 0.0
        while L - pos > 1e-9:
            pas = min(reste, L - pos)
            pos += pas
            reste -= pas
            px, py = x0 + (x1 - x0) * pos / L, y0 + (y1 - y0) * pos / L
            if trace:
                courant.append((px, py))
            if reste <= 1e-9:
                if trace and len(courant) > 1:
                    segs.append(courant)
                trace = not trace
                idx = (idx + 1) % len(motif)
                reste = motif[idx]
                courant = [(px, py)]
    if trace and len(courant) > 1:
        segs.append(courant)
    return segs


def svg_vers_png(svg: str, dpi: int = DPI_DEFAUT) -> bytes:
    """Rastérise un SVG de visuel en PNG (RVB) à `dpi` points par pouce."""
    racine = ET.fromstring(svg)
    vb = [float(v) for v in racine.attrib["viewBox"].replace(",", " ").split()]
    largeur_u, hauteur_u = vb[2], vb[3]
    # Plafond mémoire : pas plus de ~16 Mpx sur la toile suréchantillonnée (48 Mo en RVB).
    # Trop grand même à la résolution minimale : pas de PNG (le visuel est omis par l'appelant).
    if not (0 < largeur_u * hauteur_u < float("inf")):
        raise VisuelTropGrand("dimensions de visuel invalides")
    dpi_max = int(72 * math.sqrt(_PX_MAX / (largeur_u * hauteur_u)) / _SUREC)
    if dpi_max < DPI_MIN:
        raise VisuelTropGrand(f"visuel trop grand ({largeur_u:.0f} x {hauteur_u:.0f})")
    dpi = min(dpi, dpi_max)
    echelle = dpi / 72.0 * _SUREC
    W, H = max(1, round(largeur_u * echelle)), max(1, round(hauteur_u * echelle))
    image = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(image)

    def px(p):
        return (p[0] * echelle, p[1] * echelle)

    def tracer_polyligne(points, couleur, sw, ferme=False, motif=None):
        pts = [px(p) for p in points]
        if ferme and pts and pts[0] != pts[-1]:
            pts.append(pts[0])
        largeur_px = max(1, round(sw * echelle))
        if motif:
            morceaux = _tirets(pts, [m * echelle for m in motif], sw)
        else:
            morceaux = [pts]
        for m in morceaux:
            if len(m) >= 2:
                d.line(m, fill=couleur, width=largeur_px, joint="curve")
                if largeur_px >= 3:  # extrémités arrondies : pas de bec aux jonctions
                    for (cx, cy) in (m[0], m[-1]):
                        r_ = largeur_px / 2
                        d.ellipse((cx - r_, cy - r_, cx + r_, cy + r_), fill=couleur)

    def visiter(noeud, dx=0.0, dy=0.0):
        for el in noeud:
            tag = el.tag.replace(_NS, "")
            a = el.attrib
            if tag == "g":
                m = re.match(r"translate\(([-\d.]+)[ ,]+([-\d.]+)\)", a.get("transform", ""))
                visiter(el, dx + (float(m.group(1)) if m else 0), dy + (float(m.group(2)) if m else 0))
                continue
            fill = _couleur(a.get("fill", "#000000" if tag == "text" else "none"))
            stroke = _couleur(a.get("stroke"))
            sw = _nombre(a.get("stroke-width"), 1.0)
            motif = [float(v) for v in a["stroke-dasharray"].replace(",", " ").split()] \
                if a.get("stroke-dasharray") else None
            if tag == "rect":
                x, y = _nombre(a.get("x")) + dx, _nombre(a.get("y")) + dy
                w = _dimension(a.get("width"), largeur_u)
                h = _dimension(a.get("height"), hauteur_u)
                if w <= 0 or h <= 0:
                    continue
                rx = min(_nombre(a.get("rx")), w / 2, h / 2)
                if fill:
                    if rx > 0:
                        d.rounded_rectangle((x * echelle, y * echelle, (x + w) * echelle - 1, (y + h) * echelle - 1),
                                            radius=rx * echelle, fill=fill)
                    else:
                        d.rectangle((x * echelle, y * echelle, (x + w) * echelle - 1, (y + h) * echelle - 1), fill=fill)
                if stroke and sw > 0:
                    e = sw / 2
                    boite = ((x - e) * echelle, (y - e) * echelle, (x + w + e) * echelle - 1, (y + h + e) * echelle - 1)
                    d.rounded_rectangle(boite, radius=(rx + e) * echelle, outline=stroke,
                                        width=max(1, round(sw * echelle)))
            elif tag == "line" and stroke:
                pts = [(_nombre(a.get("x1")) + dx, _nombre(a.get("y1")) + dy),
                       (_nombre(a.get("x2")) + dx, _nombre(a.get("y2")) + dy)]
                tracer_polyligne(pts, stroke, sw, motif=motif)
            elif tag == "path":
                for pts, ferme in _sous_chemins(a.get("d", "")):
                    pts = [(p[0] + dx, p[1] + dy) for p in pts]
                    if fill and len(pts) >= 3:
                        d.polygon([px(p) for p in pts], fill=fill)
                    if stroke and sw > 0:
                        tracer_polyligne(pts, stroke, sw, ferme=ferme, motif=motif)
            elif tag == "circle":
                cx, cy, rr = _nombre(a.get("cx")) + dx, _nombre(a.get("cy")) + dy, _nombre(a.get("r"))
                boite = ((cx - rr) * echelle, (cy - rr) * echelle, (cx + rr) * echelle, (cy + rr) * echelle)
                d.ellipse(boite, fill=fill, outline=stroke,
                          width=max(1, round(sw * echelle)) if stroke else 0)
            elif tag == "text" and fill:
                taille = _nombre(a.get("font-size"), 9.0)
                police = _police(a.get("font-weight") == "bold", max(1, round(taille * echelle)))
                ancre = {"middle": "ms", "end": "rs"}.get(a.get("text-anchor", "start"), "ls")
                d.text(((_nombre(a.get("x")) + dx) * echelle, (_nombre(a.get("y")) + dy) * echelle),
                       "".join(el.itertext()), font=police, fill=fill, anchor=ancre)

    visiter(racine)
    sortie_w = max(1, round(largeur_u * dpi / 72.0))
    sortie_h = max(1, round(hauteur_u * dpi / 72.0))
    image = image.resize((sortie_w, sortie_h), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True, dpi=(dpi, dpi))
    return buf.getvalue()
