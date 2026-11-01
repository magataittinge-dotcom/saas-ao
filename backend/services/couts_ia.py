"""Registre du coût réel des appels au modèle (une ligne par appel, par organisation et par usage).

Tarifs Haiku 4.5 en dollars par million de jetons : 1,00 en entrée et 5,00 en sortie (ceux de
`services/ai/profile_structurer.py`, déjà en production), lecture du cache à 10 % de l'entrée et écriture du cache
(5 minutes) à 125 % de l'entrée. Le taux dollar -> euro est INDICATIF (`COUT_USD_EUR`, 0,92 par défaut) : le coût
en dollars est la donnée sûre, l'euro est un affichage.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from sqlalchemy.orm import Session

from models.depot_entreprise import CoutIA

logger = logging.getLogger(__name__)

HAIKU_4_5 = "claude-haiku-4-5-20251001"
# $ / million de jetons : entrée, sortie, lecture du cache, écriture du cache
TARIFS = {HAIKU_4_5: (1.00, 5.00, 0.10, 1.25)}


def taux_usd_eur() -> float:
    try:
        return float(os.environ.get("COUT_USD_EUR", "0.92"))
    except ValueError:
        return 0.92


def calculer(modele: str, usage: dict) -> tuple[float, float]:
    """(coût en dollars, coût en euros) d'un appel ; (0, 0) et une alerte si le modèle n'a pas de tarif."""
    tarif = TARIFS.get(modele)
    if tarif is None:
        logger.warning("couts_ia : aucun tarif pour le modèle %s", modele)
        return 0.0, 0.0
    entree, sortie, lecture, ecriture = tarif
    usd = (
        usage.get("input_tokens", 0) * entree + usage.get("output_tokens", 0) * sortie
        + usage.get("cache_read_input_tokens", 0) * entree * lecture
        + usage.get("cache_creation_input_tokens", 0) * entree * ecriture
    ) / 1_000_000
    return round(usd, 6), round(usd * taux_usd_eur(), 6)


def estimer(modele: str, jetons_entree: int, jetons_sortie: int) -> tuple[float, float]:
    return calculer(modele, {"input_tokens": jetons_entree, "output_tokens": jetons_sortie})


def enregistrer(db: Session, organization_id: str, usage_nom: str, modele: str, usage: dict,
                reference: Optional[str] = None) -> CoutIA:
    """Une ligne par appel. Aucune donnée du fichier, aucun nom : seulement des nombres."""
    usd, eur = calculer(modele, usage)
    ligne = CoutIA(
        organization_id=organization_id, usage=usage_nom, modele=modele,
        jetons_entree=int(usage.get("input_tokens", 0) or 0), jetons_sortie=int(usage.get("output_tokens", 0) or 0),
        jetons_cache_lecture=int(usage.get("cache_read_input_tokens", 0) or 0),
        jetons_cache_ecriture=int(usage.get("cache_creation_input_tokens", 0) or 0),
        cout_usd=usd, cout_eur=eur, reference=reference)
    db.add(ligne)
    db.commit()
    return ligne
