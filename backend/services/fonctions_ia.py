"""Les quatre fonctions à appel d'IA de la mission finale (C1 à C4), chacune derrière son interrupteur, ÉTEINT par défaut.

  C1  RELECTURE_PROPOSER  « Proposer un paragraphe » sur une ligne « À couvrir » de la relecture (Sonnet 5.5, MEMOIRE_MODELE)
  C2  REECRIRE_TROIS      la réécriture d'un passage en trois propositions, avec « Voir les différences » (même modèle)
  C3  FICHE_PROPOSEE      « Ce que vous voulez dire » de chaque fiche du plan, proposé par Haiku 4.5, à valider
  C4  STYLE_ENTREPRISE    « Le style de mon entreprise » lu dans un ancien mémoire (Haiku 4.5), lecture seule (décision D5 :
                          jamais envoyé au générateur)

Éteinte (variable absente, vide ou « 0 »), une fonction n'existe pas : sa route répond 404 AVANT toute autre dépendance
(ni contrôle de budget, ni réservation, ni ligne d'audit), l'écran n'affiche rien (GET /api/fonctions-ia les dit
éteintes) et les routes d'aujourd'hui ne changent pas. Lu à chaque requête : aucun redémarrage de cache à prévoir.

Plafonds par organisation sur 24 heures glissantes, comptés AVANT l'appel par une ligne d'audit posée au départ :
`reserver` contrôle le plafond et pose la ligne sous verrou par organisation, sans attente entre les deux (REVUE-2
P2-1 : contrôlée avant une attente et comptée après, la dernière place passait à plusieurs demandes simultanées). Une
demande qui échoue avant l'appel au modèle rend sa place (`rendre`). C1 et C2 partagent celui de la réécriture d'un passage (`REECRIRE_MAX_PAR_JOUR`,
routers/memoire.py). Échec du fournisseur : la ligne d'audit passe en « <action>.echec », qui ne compte plus — rien
n'est consommé (la réservation du budget d'IA est libérée par `exiger_budget_ia`, aucun jeton n'est inscrit).
"""
from __future__ import annotations

import os
import threading
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from models.audit_log import AuditLog

INTERRUPTEURS: dict[str, str] = {
    "relecture_proposer": "RELECTURE_PROPOSER",   # C1
    "reecrire_trois": "REECRIRE_TROIS",           # C2
    "fiche_proposee": "FICHE_PROPOSEE",           # C3
    "style_entreprise": "STYLE_ENTREPRISE",       # C4
}
_VRAI = frozenset({"1", "true", "oui", "yes", "on"})

# Actions d'audit (une ligne par demande, posée avant l'appel).
ACTION_PROPOSER_PARAGRAPHE = "memoire.proposer_paragraphe"   # C1
ACTION_REECRIRE_TROIS = "memoire.reecrire_trois"             # C2
ACTION_FICHE_PROPOSEE = "plan.fiche_proposee"                # C3
ACTION_STYLE_ENTREPRISE = "entreprise.style_lu"              # C4
SUFFIXE_ECHEC = ".echec"

# Plafonds propres de C3 et C4 (C1 et C2 : REECRIRE_MAX_PAR_JOUR, partagé avec la réécriture d'aujourd'hui).
FICHE_PROPOSEE_MAX_PAR_JOUR = 20     # un appel = un plan entier (toutes les fiches)
STYLE_MAX_PAR_JOUR = 5               # une lecture de style se fait une fois ; 5 laisse corriger un mauvais fichier

MSG_ECHEC_FOURNISSEUR = ("Le service d'IA n'a pas répondu. Rien n'a été décompté ; réessayez dans un instant.")
MSG_SORTIE_ILLISIBLE = ("La proposition reçue n'a pas la forme attendue. Rien n'a été décompté ; réessayez dans un instant.")


def allumee(fonction: str) -> bool:
    """Vrai seulement si la variable de la fonction vaut 1 (ou true, oui, yes, on). Absente, vide ou 0 : éteinte."""
    variable = INTERRUPTEURS[fonction]
    return os.environ.get(variable, "0").strip().lower() in _VRAI


def etat() -> dict[str, bool]:
    """Ce que l'écran lit (GET /api/fonctions-ia) : une clé par fonction, vrai = allumée."""
    return {fonction: allumee(fonction) for fonction in INTERRUPTEURS}


def exiger(fonction: str):
    """Dépendance FastAPI à poser EN PREMIER dans `dependencies=[…]` : 404 si la fonction est éteinte, avant le budget."""
    def _dependance() -> None:
        if not allumee(fonction):
            raise HTTPException(status_code=404, detail="Not Found")
    _dependance.__name__ = f"exiger_{fonction}"
    return _dependance


def demandes_24h(db: Session, org_id: str, actions: tuple[str, ...]) -> int:
    depuis = datetime.utcnow() - timedelta(hours=24)
    return (db.query(AuditLog)
            .filter(AuditLog.organization_id == org_id, AuditLog.action.in_(actions), AuditLog.created_at >= depuis)
            .count())


def compter(db: Session, user, action: str, *, target_type: str, target_id: Optional[str],
            extra: Optional[dict] = None) -> AuditLog:
    """La ligne d'audit qui compte la demande dans le plafond, posée et validée AVANT l'appel."""
    ligne = AuditLog(user_id=user.id, organization_id=user.organization_id, action=action,
                     target_type=target_type, target_id=target_id, extra=extra or {})
    db.add(ligne)
    db.commit()
    return ligne


_verrous: dict[str, threading.Lock] = {}
_verrous_garde = threading.Lock()


def _verrou(org_id: str) -> threading.Lock:
    with _verrous_garde:
        return _verrous.setdefault(org_id, threading.Lock())


def reserver(db: Session, user, action: str, actions_du_plafond: tuple[str, ...], maximum: int, message: str, *,
             target_type: str, target_id: Optional[str], extra: Optional[dict] = None) -> AuditLog:
    """Contrôle du plafond PUIS ligne d'audit qui compte la demande, sous verrou par organisation (et verrou de
    transaction PostgreSQL, pour plusieurs processus), validés ensemble, sans attente entre les deux, comme la
    réservation du budget d'IA (`services/budget_ia.reserver`). 429 (`message`) si le plafond est atteint : rien n'est
    posé. La demande qui échoue ensuite avant l'appel au modèle rend sa place (`rendre`)."""
    org_id = user.organization_id
    with _verrou(org_id):
        try:
            if db.get_bind().dialect.name == "postgresql":
                db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"plafond_ia:{org_id}"})
            if demandes_24h(db, org_id, actions_du_plafond) >= maximum:
                raise HTTPException(status_code=429, detail=message)
            ligne = AuditLog(user_id=user.id, organization_id=org_id, action=action,
                             target_type=target_type, target_id=target_id, extra=extra or {})
            db.add(ligne)
            db.commit()
            return ligne
        except BaseException:
            db.rollback()
            raise


def rendre(db: Session, ligne: AuditLog) -> None:
    """Échec du fournisseur ou sortie illisible : la demande ne compte plus dans le plafond (la ligne reste, marquée)."""
    try:
        db.rollback()
        ligne = db.merge(ligne)
        if not ligne.action.endswith(SUFFIXE_ECHEC):
            ligne.action = ligne.action + SUFFIXE_ECHEC
        db.commit()
    except Exception:
        db.rollback()
