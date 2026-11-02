"""« Refaire cette partie » (E2) : estimation du coût, avant de cliquer — déterministe, sans IA.

Un « Refaire » renvoie au modèle le même préfixe que la génération (système, référentiels, profil, marché), puis la
seule sous-section. Le cache du préfixe dure 5 minutes : à la main d'un patron il a presque toujours expiré, donc
le préfixe est ÉCRIT dans le cache (125 % du prix d'entrée), puis la sortie est facturée.

- taille du préfixe : les jetons réels de la dernière génération, gardés dans le mémoire (`_generation_meta`) ;
  à défaut, une valeur typique mesurée sur les mémoires de Gueux (84 000 à 129 000 jetons) ;
- sortie : la longueur actuelle de la sous-section × le ratio jetons/caractère mesuré sur sa partie ;
- prix : `services/couts_ia.py` (un seul endroit).
"""
from __future__ import annotations

import math
from typing import Any

from services import couts_ia

JETONS_PREFIXE_TYPIQUE = 105_000
RATIO_JETONS_PAR_CARACTERE = 0.44          # mesuré : 15 900 jetons pour 36 200 caractères (partie B de Gueux)
CARACTERES_MINIMUM = 4_000                 # une sous-section vide ou très courte est refaite plus longue
_MARQUE_PLACEHOLDER = "[SECTION À RÉGÉNÉRER"


def _segments(contenu: Any) -> list[dict]:
    meta = contenu.get("_generation_meta") if isinstance(contenu, dict) else None
    segs = meta.get("segments") if isinstance(meta, dict) else None
    return [s for s in segs if isinstance(s, dict)] if isinstance(segs, list) else []


def _entier(valeur: Any) -> int:
    try:
        return max(int(valeur or 0), 0)
    except (TypeError, ValueError):
        return 0


def estimer(contenu: Any, part: str, cle: str, modele: str) -> dict:
    """Jetons et coût estimés pour refaire ``part.cle``. ``base`` = « reel » (jetons de la dernière génération)
    ou « typique » (aucun jeton gardé : ancien mémoire)."""
    segments = _segments(contenu)
    prefixes = [_entier(s.get("input_tokens")) + _entier(s.get("cache_read")) + _entier(s.get("cache_write"))
                for s in segments]
    jetons_prefixe = max(prefixes, default=0)
    base = "reel" if jetons_prefixe > 0 else "typique"
    if base == "typique":
        jetons_prefixe = JETONS_PREFIXE_TYPIQUE

    texte = ((contenu or {}).get(part) or {}).get(cle) if isinstance(contenu, dict) else None
    caracteres = len(texte) if isinstance(texte, str) and not texte.lstrip().startswith(_MARQUE_PLACEHOLDER) else 0
    ratio = RATIO_JETONS_PAR_CARACTERE
    propre = next((s for s in segments if s.get("segment") == part), None)
    if propre and _entier(propre.get("chars")) > 0 and _entier(propre.get("output_tokens")) > 0:
        ratio = _entier(propre["output_tokens"]) / _entier(propre["chars"])
    jetons_sortie = math.ceil(max(caracteres, CARACTERES_MINIMUM) * ratio)

    usd, eur = couts_ia.estimer_ecriture_cache(modele, jetons_prefixe, jetons_sortie)
    return {
        "modele": modele, "base": base, "jetons_prefixe": jetons_prefixe, "jetons_sortie": jetons_sortie,
        "cout_usd": round(usd, 4), "cout_eur": math.ceil(eur * 100) / 100,
    }
