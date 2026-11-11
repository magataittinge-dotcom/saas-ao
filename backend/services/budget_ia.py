"""Filet général de la dépense d'IA (audit de sécurité, S-01) : un budget en euros par organisation et par jour.

La dépense est la somme de `couts_ia.cout_eur` des 24 dernières heures glissantes pour l'organisation (tous usages :
analyse, mémoire, « Refaire », import, reformulation, questions, dépôts, filet des lots). Au-delà de
`BUDGET_IA_JOUR_EUR` (60 € par défaut ; 0 coupe le filet), plus aucun appel d'IA ne part pour cette organisation
jusqu'à ce que la fenêtre glisse.

Un point commun, deux formes :
- `exiger_budget_ia`, dépendance FastAPI posée sur chaque route qui lance un appel au modèle (429 avant tout travail) ;
- `depasse(db, org_id)`, lu par `depot_budget.raison_de_report` : les lectures des dépôts de Mon entreprise et le filet
  des lots sont reportées au lieu d'être refusées (le dépôt lui-même reste accepté).
Le filet ne voit que ce qui est inscrit dans `couts_ia` : chaque appel payant doit y écrire sa ligne.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.depot_entreprise import CoutIA
from models.user import User
from routers.auth import get_auth_user

logger = logging.getLogger(__name__)

MSG_BUDGET = "Plafond du jour atteint. Il se remet à zéro demain."


def budget_jour_eur() -> float:
    brut = os.environ.get("BUDGET_IA_JOUR_EUR", "60")
    try:
        valeur = float(brut)
    except ValueError:
        logger.warning("BUDGET_IA_JOUR_EUR illisible : 60 € par défaut")
        return 60.0
    return valeur if valeur >= 0 else 60.0


def depense_24h(db: Session, org_id: str) -> float:
    depuis = datetime.utcnow() - timedelta(hours=24)
    return float(db.query(func.coalesce(func.sum(CoutIA.cout_eur), 0.0)).filter(
        CoutIA.organization_id == org_id, CoutIA.created_at >= depuis).scalar() or 0.0)


def depasse(db: Session, org_id: str) -> bool:
    budget = budget_jour_eur()
    return bool(budget) and depense_24h(db, org_id) >= budget


def verifier(db: Session, org_id: str) -> None:
    if depasse(db, org_id):
        logger.warning("Budget d'IA du jour atteint pour l'organisation %s", org_id)
        raise HTTPException(status_code=429, detail=MSG_BUDGET)


def exiger_budget_ia(user: User = Depends(get_auth_user), db: Session = Depends(get_db)) -> None:
    """Dépendance des routes d'IA : 429 si le budget du jour de l'organisation est atteint."""
    verifier(db, user.organization_id)
