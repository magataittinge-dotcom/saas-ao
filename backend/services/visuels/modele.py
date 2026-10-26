"""Un visuel prêt à être posé dans le Word : où, quoi, et comment il s'appelle."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import cached_property

from .raster import svg_vers_png


@dataclass
class Visuel:
    section: tuple[str, str]          # (« partie_a », « organigramme »)
    svg: str
    texte_alt: str                    # description lue par les lecteurs d'écran
    legende: str
    largeur_cm: float = 17.0
    paysage: bool = False             # posé sur une page A4 paysage (section dédiée)
    gabarits: tuple[str, ...] = field(default_factory=tuple)   # voir `retirer_gabarits`

    @cached_property
    def png(self) -> bytes:
        return svg_vers_png(self.svg)


# Texte d'instruction que le prompt laisse parfois à la place d'un visuel : si le
# visuel est là, la phrase d'instruction ne doit plus être imprimée.
_GABARITS = {
    "organigramme": re.compile(r"\[\s*À COMPLÉTER[^\]]*organigramme[^\]]*\]", re.IGNORECASE),
}


def retirer_gabarits(texte: str, visuels: list[Visuel]) -> str:
    """Retire du texte les lignes d'instruction remplacées par un visuel présent."""
    for v in visuels:
        for nom in v.gabarits:
            motif = _GABARITS[nom]
            lignes = []
            for ligne in texte.split("\n"):
                reste = motif.sub("", ligne).strip()
                if motif.search(ligne) and not reste:
                    continue          # la ligne n'était que l'instruction
                lignes.append(motif.sub("", ligne) if motif.search(ligne) else ligne)
            texte = "\n".join(lignes)
    return texte
