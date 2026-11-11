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
SONNET_4_6 = "claude-sonnet-4-6"
SONNET_5_5 = "claude-sonnet-5-5"
# $ / million de jetons : entrée, sortie, lecture du cache, écriture du cache. Sonnet 4.6 : 3 / 15 ; Sonnet 5.5 : 2 / 10
# (le tarif de la mesure du 26/10). Mêmes valeurs que scripts/couts_journal.py (un test les compare).
TARIFS = {
    HAIKU_4_5: (1.00, 5.00, 0.10, 1.25),
    SONNET_4_6: (3.00, 15.00, 0.10, 1.25),
    SONNET_5_5: (2.00, 10.00, 0.10, 1.25),
}


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


def estimer_ecriture_cache(modele: str, jetons_prefixe: int, jetons_sortie: int) -> tuple[float, float]:
    """(dollars, euros) d'un appel dont le préfixe est ÉCRIT dans le cache (cache de 5 minutes expiré : le cas
    courant pour « Refaire cette partie »), plus la sortie. Déterministe ; (0, 0) si le modèle n'a pas de tarif."""
    return calculer(modele, {"cache_creation_input_tokens": jetons_prefixe, "output_tokens": jetons_sortie})


_CLES_USAGE = ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")


def en_dict(usage: object) -> dict:
    """Les comptes de jetons d'un `usage` du SDK (objet) ou d'un dict, en dict d'entiers (0 si absent)."""
    if usage is None:
        return {cle: 0 for cle in _CLES_USAGE}
    lire = usage.get if isinstance(usage, dict) else (lambda cle, d=0: getattr(usage, cle, d))
    sortie = {}
    for cle in _CLES_USAGE:
        try:
            sortie[cle] = int(lire(cle, 0) or 0)
        except (TypeError, ValueError):
            sortie[cle] = 0
    return sortie


def enregistrer_collecte(organization_id: str, usage_nom: str, collecte: list,
                         reference: Optional[str] = None, reservation: Optional[str] = None) -> None:
    """Inscrit les jetons collectés pendant un travail (`services.jetons.collecter`) : une ligne par modèle, dans une
    session à part (celle du travail peut être dans un état d'erreur), et RÈGLE la réservation du budget d'IA
    (`reservation` : sa référence exacte, `services.budget_ia`) dans la même transaction, même sans dépense.
    Ne lève jamais : le registre ne fait pas échouer une analyse ou un mémoire."""
    par_modele: dict[str, dict] = {}
    for modele, usage in collecte or []:
        total = par_modele.setdefault(modele, {cle: 0 for cle in _CLES_USAGE})
        for cle in _CLES_USAGE:
            total[cle] += int(usage.get(cle, 0) or 0)
    if not par_modele and not reservation:
        return
    from database import SessionLocal
    db = SessionLocal()
    try:
        for modele, usage in par_modele.items():
            db.add(_ligne(organization_id, usage_nom, modele, usage, reference))
        if reservation:
            from services import budget_ia
            budget_ia.liberer(db, organization_id, reservation)
        db.commit()
    except Exception:
        logger.exception("couts_ia : inscription impossible (%s)", usage_nom)
        db.rollback()
    finally:
        db.close()


def enregistrer(db: Session, organization_id: str, usage_nom: str, modele: str, usage: dict,
                reference: Optional[str] = None) -> CoutIA:
    """Une ligne par appel. Aucune donnée du fichier, aucun nom : seulement des nombres."""
    ligne = _ligne(organization_id, usage_nom, modele, usage, reference)
    db.add(ligne)
    db.commit()
    return ligne


def _ligne(organization_id: str, usage_nom: str, modele: str, usage: dict, reference: Optional[str]) -> CoutIA:
    usd, eur = calculer(modele, usage)
    return CoutIA(
        organization_id=organization_id, usage=usage_nom, modele=modele,
        jetons_entree=int(usage.get("input_tokens", 0) or 0), jetons_sortie=int(usage.get("output_tokens", 0) or 0),
        jetons_cache_lecture=int(usage.get("cache_read_input_tokens", 0) or 0),
        jetons_cache_ecriture=int(usage.get("cache_creation_input_tokens", 0) or 0),
        cout_usd=usd, cout_eur=eur, reference=reference)
