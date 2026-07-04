"""
Gantt visuel du phasage (BONUS Lot 5) — déterministe, 0 € API.

Rendu SVG des phases SAISIES par l'utilisateur au pre-flight
([{nom, duree_semaines}]) : barres séquentielles sur une échelle en
semaines. Aucune donnée inventée : pas de phases exploitables → None.
Rasterisation PNG via services.organigramme.svg_to_png_bytes (PyMuPDF).
"""
import html
from typing import List, Optional

_ROW_H = 34
_BAR_H = 20
_LABEL_W = 210
_WEEK_W = 42
_MARGIN = 16
_HEADER_H = 26

_BAR_COLORS = ["#0EA5E9", "#0369A1", "#38BDF8", "#0284C7", "#7DD3FC"]


def generate_gantt_svg(phases: Optional[List[dict]]) -> Optional[str]:
    """[{nom, duree_semaines}] → SVG Gantt, ou None si rien d'exploitable."""
    cleaned = []
    for p in phases or []:
        nom = (p.get("nom") or "").strip()
        try:
            duree = int(p.get("duree_semaines") or 0)
        except (TypeError, ValueError):
            duree = 0
        if nom and duree > 0:
            cleaned.append({"nom": nom, "duree": duree})
    if not cleaned:
        return None

    total_weeks = sum(p["duree"] for p in cleaned)
    width = _MARGIN * 2 + _LABEL_W + total_weeks * _WEEK_W
    height = _MARGIN * 2 + _HEADER_H + len(cleaned) * _ROW_H

    parts: List[str] = []
    # Graduations semaines (S1..SN) + lignes verticales
    for w in range(total_weeks + 1):
        x = _MARGIN + _LABEL_W + w * _WEEK_W
        parts.append(
            f'<line x1="{x}" y1="{_MARGIN + _HEADER_H}" x2="{x}" y2="{height - _MARGIN}" '
            f'stroke="#E2E8F0" stroke-width="1"/>'
        )
        if w > 0:
            parts.append(
                f'<text x="{x - _WEEK_W / 2:.0f}" y="{_MARGIN + 16}" text-anchor="middle" '
                f'font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#64748B">S{w}</text>'
            )

    cursor = 0
    for i, phase in enumerate(cleaned):
        y = _MARGIN + _HEADER_H + i * _ROW_H
        parts.append(
            f'<text x="{_MARGIN}" y="{y + _BAR_H:.0f}" '
            f'font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#0F172A">'
            f'{html.escape(phase["nom"][:40])}</text>'
        )
        bar_x = _MARGIN + _LABEL_W + cursor * _WEEK_W
        bar_w = phase["duree"] * _WEEK_W
        color = _BAR_COLORS[i % len(_BAR_COLORS)]
        parts.append(
            f'<rect class="gantt-bar" x="{bar_x}" y="{y + 6}" width="{bar_w}" height="{_BAR_H}" '
            f'rx="4" fill="{color}" fill-opacity="0.85"/>'
        )
        parts.append(
            f'<text x="{bar_x + bar_w / 2:.0f}" y="{y + 6 + _BAR_H - 6}" text-anchor="middle" '
            f'font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#FFFFFF">'
            f'{phase["duree"]} sem.</text>'
        )
        cursor += phase["duree"]

    body = "\n".join(parts)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">\n<rect width="100%" height="100%" fill="#FFFFFF"/>\n'
        f'{body}\n</svg>'
    )
