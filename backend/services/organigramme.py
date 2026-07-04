"""
Organigramme de chantier en SVG (C8a) — déterministe, 0 € API.

Données : gérant + postes_cles du profil (MemoireConfig). Hiérarchie 2-3
niveaux par mots-clés de poste. Rendu SVG sobre (boîtes nom/poste/rôle),
rasterisé en PNG via PyMuPDF (déjà en dépendance) pour insertion DOCX.

Règle : jamais d'organigramme vide ou à une seule personne → None, et
l'option est grisée au pre-flight avec « compléter mon équipe ».
"""
import html
from typing import List, Optional

# Niveau hiérarchique par mots-clés du poste (déterministe).
_LEVEL_2_KEYWORDS = ("conducteur", "responsable", "directeur travaux", "charge d'affaires", "chargé d'affaires")
_LEVEL_3_KEYWORDS = ("chef de chantier", "chef d'equipe", "chef d'équipe", "compagnon", "ouvrier", "macon", "maçon")

_BOX_W, _BOX_H = 180, 58
_H_GAP, _V_GAP = 24, 46
_MARGIN = 20


def build_hierarchy(memoire_config) -> Optional[List[List[dict]]]:
    """Profil → niveaux [[direction], [encadrement], [terrain]].

    Retourne None si moins de 2 personnes identifiables (jamais
    d'organigramme vide ni à une boîte)."""
    if memoire_config is None:
        return None
    gerant = (getattr(memoire_config, "gerant_nom", None) or "").strip()
    postes = list(getattr(memoire_config, "postes_cles", None) or [])

    people = []
    if gerant:
        people.append({
            "nom": gerant,
            "poste": (getattr(memoire_config, "gerant_titre", None) or "Gérant"),
            "role": "",
            "level": 0,
        })
    for p in postes:
        nom = (p.get("nom") or "").strip()
        poste = (p.get("poste") or "").strip()
        if not nom:
            continue
        poste_lower = poste.lower()
        if any(kw in poste_lower for kw in _LEVEL_2_KEYWORDS):
            level = 1
        elif any(kw in poste_lower for kw in _LEVEL_3_KEYWORDS):
            level = 2
        else:
            level = 1 if not gerant else 2 if len(postes) > 2 else 1
        people.append({"nom": nom, "poste": poste, "role": (p.get("role") or "").strip(), "level": level})

    if len(people) < 2:
        return None

    levels: List[List[dict]] = [[], [], []]
    for person in people:
        levels[person["level"]].append(person)
    # Compacte les niveaux vides (ex. pas de gérant → l'encadrement monte).
    levels = [lvl for lvl in levels if lvl]
    return levels or None


def _box_svg(x: float, y: float, person: dict) -> str:
    nom = html.escape(person["nom"])
    poste = html.escape(person["poste"])
    role = html.escape(person["role"])
    lines = [
        f'<rect x="{x:.0f}" y="{y:.0f}" width="{_BOX_W}" height="{_BOX_H}" rx="6" '
        f'fill="#F8FAFC" stroke="#0EA5E9" stroke-width="1.2"/>',
        f'<text x="{x + _BOX_W / 2:.0f}" y="{y + 20:.0f}" text-anchor="middle" '
        f'font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="bold" fill="#0F172A">{nom}</text>',
        f'<text x="{x + _BOX_W / 2:.0f}" y="{y + 35:.0f}" text-anchor="middle" '
        f'font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#334155">{poste}</text>',
    ]
    if role:
        lines.append(
            f'<text x="{x + _BOX_W / 2:.0f}" y="{y + 49:.0f}" text-anchor="middle" '
            f'font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#64748B">{role}</text>'
        )
    return "\n".join(lines)


def generate_organigramme_svg(memoire_config) -> Optional[str]:
    """SVG de l'organigramme, ou None si les données sont insuffisantes."""
    levels = build_hierarchy(memoire_config)
    if not levels:
        return None

    max_row = max(len(lvl) for lvl in levels)
    width = _MARGIN * 2 + max_row * _BOX_W + (max_row - 1) * _H_GAP
    height = _MARGIN * 2 + len(levels) * _BOX_H + (len(levels) - 1) * _V_GAP

    elements: List[str] = []
    centers: List[List[tuple]] = []
    for row_idx, row in enumerate(levels):
        y = _MARGIN + row_idx * (_BOX_H + _V_GAP)
        row_width = len(row) * _BOX_W + (len(row) - 1) * _H_GAP
        x0 = (width - row_width) / 2
        row_centers = []
        for col_idx, person in enumerate(row):
            x = x0 + col_idx * (_BOX_W + _H_GAP)
            elements.append(_box_svg(x, y, person))
            row_centers.append((x + _BOX_W / 2, y))
        centers.append(row_centers)

    # Connecteurs : chaque boîte d'un niveau est reliée au centre du niveau
    # supérieur (hiérarchie simple 2-3 niveaux, lisible).
    for row_idx in range(1, len(centers)):
        parent_cx = sum(c[0] for c in centers[row_idx - 1]) / len(centers[row_idx - 1])
        parent_bottom = centers[row_idx - 1][0][1] + _BOX_H
        mid_y = parent_bottom + _V_GAP / 2
        for cx, cy in centers[row_idx]:
            elements.append(
                f'<path d="M {parent_cx:.0f} {parent_bottom:.0f} V {mid_y:.0f} '
                f'H {cx:.0f} V {cy:.0f}" fill="none" stroke="#94A3B8" stroke-width="1"/>'
            )

    body = "\n".join(elements)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">\n<rect width="100%" height="100%" fill="#FFFFFF"/>\n'
        f'{body}\n</svg>'
    )


def svg_to_png_bytes(svg: str, scale: float = 2.0) -> bytes:
    """SVG → PNG via PyMuPDF (aucune dépendance supplémentaire)."""
    import fitz

    doc = fitz.open(stream=svg.encode("utf-8"), filetype="svg")
    try:
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        return pix.tobytes("png")
    finally:
        doc.close()


def organigramme_available(memoire_config) -> bool:
    """L'option pre-flight n'est proposée que si un organigramme réel est possible."""
    return build_hierarchy(memoire_config) is not None
