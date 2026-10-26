"""Gantt du phasage — façade de services.visuels.gantt (v2 : lisible imprimé, A4 paysage si besoin).

Rendu SVG des phases SAISIES par l'utilisateur au pre-flight ([{nom, duree_semaines}]),
mises bout à bout. Aucune donnée inventée : pas de phases exploitables -> None.
Rasterisation PNG : services.visuels.raster (Pillow).
"""
from typing import List, Optional

from services.visuels.couleurs import Theme
from services.visuels.gantt import gantt_svg


def generate_gantt_svg(phases: Optional[List[dict]]) -> Optional[str]:
    """[{nom, duree_semaines}] -> SVG du planning, ou None si rien d'exploitable."""
    res = gantt_svg(phases, Theme())
    return res[0] if res else None
