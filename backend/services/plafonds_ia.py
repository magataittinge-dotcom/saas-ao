"""Plafonds par organisation et par jour des appels d'IA qui ne décomptent aucune unité (audit de sécurité, S-01).

Même mécanique que « Refaire cette partie » (`routers/memoire.py`) : une ligne d'audit par demande, comptée sur
24 heures glissantes, vérifiée PUIS inscrite avant l'appel au modèle ; un appel qui échoue compte donc quand même.
Les plafonds se règlent par variable d'environnement, lue à chaque demande ; 0 coupe le plafond.

- « Importer un mémoire » (Sonnet 4.6, ~0,10 € l'appel) : `IMPORT_MEMOIRE_MAX_PAR_JOUR`, 5 par défaut ;
- « Reformuler » le texte libre du profil (Haiku 4.5, ~0,01 €) : `REFORMULER_MAX_PAR_JOUR`, 30 par défaut ;
- « Préparer les questions » (Haiku 4.5) : `PLAFOND_JOUR_QUESTIONS`, 10 par défaut (compté et refusé par `routers/points_eclaircir.py`).
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
_verrou_lancements = threading.Lock()

MSG_PLAFOND_ACTION = "Plafond du jour atteint pour cette action. Il se remet à zéro demain."

ACTION_IMPORT = "memoire_config.import"
ACTION_REFORMULER = "memoire_config.reformuler"
# S-04 — lancements d'analyse et de mémoire par organisation et par jour, TOUTES offres (Business compris : plafond
# technique de protection, en plus du quota du mois). Comptés au lancement, refusés et remboursés compris ; l'unité du mois, elle, reste rendue en cas d'échec.
ACTION_LANCER_ANALYSE = "jour.analyse"
ACTION_LANCER_MEMOIRE = "jour.memoire"
MSG_PLAFOND_JOUR = "Plafond du jour atteint, il se remet à zéro demain."
ACTION_QUESTIONS = "analyse.points_a_eclaircir"

_PLAFONDS = {
    ACTION_IMPORT: ("IMPORT_MEMOIRE_MAX_PAR_JOUR", 5),
    ACTION_REFORMULER: ("REFORMULER_MAX_PAR_JOUR", 30),
    ACTION_LANCER_ANALYSE: ("PLAFOND_JOUR_ANALYSES", 20),
    ACTION_LANCER_MEMOIRE: ("PLAFOND_JOUR_MEMOIRES", 20),
    ACTION_QUESTIONS: ("PLAFOND_JOUR_QUESTIONS", 10),
}
_MESSAGES = {ACTION_LANCER_ANALYSE: MSG_PLAFOND_JOUR, ACTION_LANCER_MEMOIRE: MSG_PLAFOND_JOUR}


def entier_env(nom: str, defaut: int) -> int:
    """Entier positif lu dans l'environnement ; une valeur illisible ou négative garde la valeur par défaut."""
    brut = os.environ.get(nom)
    if brut is None or not brut.strip():
        return defaut
    try:
        valeur = int(brut)
    except ValueError:
        logger.warning("%s illisible : valeur par défaut %s", nom, defaut)
        return defaut
    return valeur if valeur >= 0 else defaut


def plafond(action: str) -> int:
    nom, defaut = _PLAFONDS[action]
    return entier_env(nom, defaut)


def compter_24h(db: Session, org_id: str, action: str) -> int:
    from models.audit_log import AuditLog
    depuis = datetime.utcnow() - timedelta(hours=24)
    return (db.query(AuditLog)
            .filter(AuditLog.organization_id == org_id, AuditLog.action == action, AuditLog.created_at >= depuis)
            .count())


def verifier(db: Session, org_id: str, action: str) -> None:
    """429 si le plafond du jour de cette action est atteint pour l'organisation (0 = pas de plafond)."""
    maximum = plafond(action)
    if maximum and compter_24h(db, org_id, action) >= maximum:
        raise HTTPException(status_code=429, detail=_MESSAGES.get(action, MSG_PLAFOND_ACTION))


def compter_lancement(db: Session, user, action: str) -> None:
    """S-04 — contrôle du plafond du jour PUIS inscription du lancement, sans `await` entre les deux (la boucle
    d'événements ne peut pas intercaler un autre lancement) et sous un verrou du processus."""
    with _verrou_lancements:
        verifier(db, user.organization_id, action)
        inscrire(db, user, action)


def inscrire(db: Session, user, action: str) -> None:
    """Compte la demande AVANT l'appel au modèle (comptée même si l'appel échoue ensuite)."""
    from services.audit_logger import log_action
    log_action(db, user, action, target_type="organization", target_id=user.organization_id)
