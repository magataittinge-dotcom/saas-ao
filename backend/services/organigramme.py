"""Organigramme de chantier — façade historique de services.visuels.organigramme.

Données : gérant + postes_cles du profil (MemoireConfig) et membres de l'équipe
(`team_members`), fusionnés sans doublon. Règle : jamais d'organigramme vide ou à une
seule personne -> None, et l'option est grisée au pre-flight.
"""
from typing import Optional

from services.visuels.couleurs import Theme
from services.visuels.organigramme import organigramme_possible, organigramme_svg, personnes_depuis


def generate_organigramme_svg(memoire_config, team_members=None) -> Optional[str]:
    """SVG de l'organigramme, ou None si les données sont insuffisantes."""
    res = organigramme_svg(personnes_depuis(memoire_config, team_members), Theme())
    return res[0] if res else None


def organigramme_available(memoire_config, team_members=None) -> bool:
    """L'option pre-flight n'est proposée que si un organigramme réel est possible."""
    return organigramme_possible(memoire_config, team_members)
