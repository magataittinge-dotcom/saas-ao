"""Assemble les visuels d'un mémoire à partir des données saisies (jamais inventées).

Chaque générateur renvoie None quand il n'a pas de donnée : le bloc disparaît.
Une erreur dans un visuel ne casse jamais l'export : elle est journalisée et le
visuel est omis.
"""
from __future__ import annotations

import logging

from .couleurs import ACCENT_PAR_DEFAUT, Theme, couleur_dominante_logo
from .modele import Visuel

logger = logging.getLogger(__name__)


def _pret(visuel: Visuel | None, nom: str, visuels: list[Visuel]) -> None:
    """Ajoute le visuel à la liste après avoir calculé son PNG de repli : une erreur de
    rastérisation le fait disparaître ici, jamais dans la construction du Word."""
    if visuel is None:
        return
    try:
        visuel.png
    except Exception as exc:       # journal sans donnée personnelle
        logger.warning("Visuel %s omis : %s", nom, type(exc).__name__)
        return
    visuels.append(visuel)


def construire_visuels(variables: dict, cfg, logo_image: bytes | None = None, team_members=None) -> list[Visuel]:
    visuels: list[Visuel] = []

    th = Theme(couleur_dominante_logo(logo_image) if logo_image else ACCENT_PAR_DEFAUT)

    if variables.get("include_organigramme"):
        try:
            from .organigramme import construire
            _pret(construire(cfg, team_members, th), "organigramme", visuels)
        except Exception as exc:
            logger.warning("Organigramme omis : %s", type(exc).__name__)

    if variables.get("gantt_phases"):
        try:
            from .gantt import construire as gantt
            _pret(gantt(variables["gantt_phases"], th), "gantt", visuels)
        except Exception as exc:
            logger.warning("Gantt omis : %s", type(exc).__name__)
    return visuels
