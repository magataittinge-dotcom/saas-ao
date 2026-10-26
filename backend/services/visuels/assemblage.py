"""Assemble les visuels d'un mémoire à partir des données saisies (jamais inventées).

Chaque générateur renvoie None quand il n'a pas de donnée : le bloc disparaît.
Une erreur dans un visuel ne casse jamais l'export : elle est journalisée et le
visuel est omis.
"""
from __future__ import annotations

import logging

from .modele import Visuel

logger = logging.getLogger(__name__)


def construire_visuels(variables: dict, cfg, logo_image: bytes | None = None) -> list[Visuel]:
    visuels: list[Visuel] = []

    if variables.get("include_organigramme"):
        try:
            from services.organigramme import generate_organigramme_svg
            svg = generate_organigramme_svg(cfg)
            if svg:
                visuels.append(Visuel(("partie_c", "effectifs"), svg, "Organigramme du chantier",
                                      "Organigramme du chantier", 15.0))
        except Exception:
            logger.warning("Organigramme omis", exc_info=True)

    if variables.get("gantt_phases"):
        try:
            from services.gantt import generate_gantt_svg
            svg = generate_gantt_svg(variables["gantt_phases"])
            if svg:
                visuels.append(Visuel(("partie_c", "methodologie"), svg, "Planning prévisionnel des travaux",
                                      "Planning prévisionnel des travaux", 15.0))
        except Exception:
            logger.warning("Gantt omis", exc_info=True)
    return visuels
