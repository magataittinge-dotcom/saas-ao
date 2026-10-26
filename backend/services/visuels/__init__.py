"""Visuels du mémoire technique, dessinés en code (0 € d'API) : SVG + PNG de repli.

Règle : un visuel ne montre que des données saisies ou extraites ; sans donnée,
le générateur renvoie None et le bloc disparaît du mémoire (ni place vide, ni
texte d'instruction).
"""
from .couleurs import Theme, couleur_dominante_logo
from .raster import svg_vers_png
from .svg import LARGEUR_PAYSAGE, LARGEUR_PORTRAIT, svg_conforme
from .texte import couper, largeur

__all__ = [
    "Theme", "couleur_dominante_logo", "svg_vers_png", "svg_conforme",
    "LARGEUR_PORTRAIT", "LARGEUR_PAYSAGE", "couper", "largeur",
]
