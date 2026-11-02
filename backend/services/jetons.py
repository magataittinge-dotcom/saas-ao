"""Une ligne de journal par appel au modèle : les jetons facturés, sans aucun texte.

    jetons etape=<étiquette> modele=<id> entree=<n> cache_lecture=<n> cache_ecriture=<n> sortie=<n>

Lue par ``scripts/couts_journal.py`` pour le coût réel d'une analyse ou d'un mémoire (recette du 2/11). Aucune donnée
du DCE ni donnée personnelle : seulement l'étiquette technique de l'étape (nettoyée) et des nombres.
"""
from __future__ import annotations

import re

_NON_SUR = re.compile(r"[^A-Za-z0-9_.+-]+")


def _n(usage: object, nom: str) -> int:
    if usage is None:
        return 0
    valeur = usage.get(nom, 0) if isinstance(usage, dict) else getattr(usage, nom, 0)
    try:
        return int(valeur or 0)
    except (TypeError, ValueError):
        return 0


def ligne_jetons(etape: str, modele: str, usage: object) -> str:
    etiquette = _NON_SUR.sub("_", str(etape or "appel")).strip("_")[:60] or "appel"
    return (
        f"jetons etape={etiquette} modele={_NON_SUR.sub('_', str(modele or 'inconnu'))} "
        f"entree={_n(usage, 'input_tokens')} cache_lecture={_n(usage, 'cache_read_input_tokens')} "
        f"cache_ecriture={_n(usage, 'cache_creation_input_tokens')} sortie={_n(usage, 'output_tokens')}"
    )
