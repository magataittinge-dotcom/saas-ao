"""Filet général de la dépense d'IA (audit de sécurité, S-01) : un budget en euros par organisation et par jour.

La dépense est la somme de `couts_ia.cout_eur` des 24 dernières heures glissantes pour l'organisation (tous usages :
analyse, mémoire, « Refaire », import, reformulation, questions, dépôts, filet des lots), PLUS les réservations des
travaux en cours. Au-delà de `BUDGET_IA_JOUR_EUR` (60 € par défaut ; 0 coupe le filet), plus aucun appel d'IA ne part
pour cette organisation jusqu'à ce que la fenêtre glisse.

Réservation (revue du coordinateur) : une analyse ou un mémoire ne connaît sa dépense qu'à la fin. Au lancement, le
contrôle et une ligne `couts_ia` provisoire (usage « reservation », forfait réglable) sont faits sous un verrou par
organisation (verrou du processus + verrou consultatif Postgres) : dix lancements d'affilée voient chacun les
réservations des précédents. Le travail règle SA réservation (référence exacte et unique, portée de la requête au fil) à la fin, dans la même transaction que l'inscription de
la dépense réelle (`couts_ia.enregistrer_collecte`). Une route synchrone (import, reformulation, questions, réécriture)
inscrit sa dépense pendant la requête et libère sa réservation en sortant ; une route refusée (404, 409, 503…) la
libère aussi. Une réservation orpheline (processus tué) ne compte plus au-delà de `BUDGET_IA_RESERVATION_MINUTES`
(120 par défaut, plus long que le plus long travail) : elle n'est ni réglée au redémarrage ni bloquante.

Forfaits (euros, réglables) : `BUDGET_IA_FORFAIT_ANALYSE_EUR` 3 (une analyse mesurée à 2,30 € le 2/11),
`BUDGET_IA_FORFAIT_MEMOIRE_EUR` 1,5 (0,87 € mesuré), `BUDGET_IA_FORFAIT_REFAIRE_EUR` 0,5, `BUDGET_IA_FORFAIT_APPEL_EUR`
0,2 (un appel synchrone).

Un point commun, deux formes :
- `exiger_budget_ia`, dépendance FastAPI posée sur chaque route qui lance un appel au modèle (429 avant tout travail) ;
- `depasse(db, org_id)`, lu par `depot_budget.raison_de_report` : les lectures des dépôts de Mon entreprise et le filet
  des lots sont reportées au lieu d'être refusées (le dépôt lui-même reste accepté).
Le filet ne voit que ce qui est inscrit dans `couts_ia` : chaque appel payant doit y écrire sa ligne.
"""
from __future__ import annotations

import logging
import os
import threading
import uuid
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, or_, and_, text
from sqlalchemy.orm import Session

from database import get_db
from models.depot_entreprise import CoutIA
from models.user import User
from routers.auth import get_auth_user

logger = logging.getLogger(__name__)

MSG_BUDGET = "Plafond du jour atteint. Il se remet à zéro demain."
USAGE_RESERVATION = "reservation"
# Travaux détachés : la réservation survit à la requête et le travail la règle (référence « <genre>:<projet>:<id> »).
TRAVAUX = ("analyse", "memoire", "refaire")
_FORFAITS = {"analyse": ("BUDGET_IA_FORFAIT_ANALYSE_EUR", 3.0), "memoire": ("BUDGET_IA_FORFAIT_MEMOIRE_EUR", 1.5),
             "refaire": ("BUDGET_IA_FORFAIT_REFAIRE_EUR", 0.5), "appel": ("BUDGET_IA_FORFAIT_APPEL_EUR", 0.2)}

_verrous: dict[str, threading.Lock] = {}
_verrous_garde = threading.Lock()


def _nombre_env(nom: str, defaut: float) -> float:
    brut = os.environ.get(nom)
    if brut is None or not brut.strip():
        return defaut
    try:
        valeur = float(brut)
    except ValueError:
        logger.warning("%s illisible : %s par défaut", nom, defaut)
        return defaut
    return valeur if valeur >= 0 else defaut


def budget_jour_eur() -> float:
    return _nombre_env("BUDGET_IA_JOUR_EUR", 60.0)


def forfait(genre: str) -> float:
    nom, defaut = _FORFAITS.get(genre, _FORFAITS["appel"])
    return _nombre_env(nom, defaut)


def duree_reservation() -> timedelta:
    return timedelta(minutes=_nombre_env("BUDGET_IA_RESERVATION_MINUTES", 120.0))


def depense_24h(db: Session, org_id: str) -> float:
    """Dépense réelle des 24 dernières heures + réservations encore vivantes."""
    maintenant = datetime.utcnow()
    return float(db.query(func.coalesce(func.sum(CoutIA.cout_eur), 0.0)).filter(
        CoutIA.organization_id == org_id,
        or_(and_(CoutIA.usage != USAGE_RESERVATION, CoutIA.created_at >= maintenant - timedelta(hours=24)),
            and_(CoutIA.usage == USAGE_RESERVATION, CoutIA.created_at >= maintenant - duree_reservation())),
    ).scalar() or 0.0)


def depasse(db: Session, org_id: str) -> bool:
    budget = budget_jour_eur()
    return bool(budget) and depense_24h(db, org_id) >= budget


def verifier(db: Session, org_id: str) -> None:
    if depasse(db, org_id):
        logger.warning("Budget d'IA du jour atteint pour l'organisation %s", org_id)
        raise HTTPException(status_code=429, detail=MSG_BUDGET)


def _verrou(org_id: str) -> threading.Lock:
    with _verrous_garde:
        return _verrous.setdefault(org_id, threading.Lock())


def reserver(db: Session, org_id: str, genre: str, reference: str) -> None:
    """Contrôle du budget PUIS réservation du forfait, sous verrou par organisation, validés ensemble. 429 si le budget
    est atteint (rien n'est réservé). Filet coupé (0) : ni contrôle ni réservation."""
    if not budget_jour_eur():
        return
    with _verrou(org_id):
        try:
            if db.get_bind().dialect.name == "postgresql":
                db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"budget_ia:{org_id}"})
            verifier(db, org_id)
            db.add(CoutIA(organization_id=org_id, usage=USAGE_RESERVATION, modele=genre, cout_usd=0.0,
                          cout_eur=forfait(genre), reference=reference))
            db.commit()
        except BaseException:
            db.rollback()
            raise


def liberer(db: Session, org_id: str, reference: str) -> None:
    """Retire UNE réservation, par sa référence exacte et unique (jamais par préfixe : deux travaux sur le même projet
    ont chacun la leur). Sans commit. Les réservations orphelines ne sont pas effacées : elles cessent de compter à
    expiration (`duree_reservation`)."""
    if not reference:
        return
    db.query(CoutIA).filter(CoutIA.organization_id == org_id, CoutIA.usage == USAGE_RESERVATION,
                            CoutIA.reference == reference).delete(synchronize_session=False)


def _liberer_seule(org_id: str, reference: str) -> None:
    from database import SessionLocal
    db = SessionLocal()
    try:
        liberer(db, org_id, reference)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Budget d'IA : réservation non libérée (elle expirera)")
    finally:
        db.close()


def reference_de_travail(genre: str, project_id: str) -> str:
    return f"{genre}:{project_id}:"


def reservation_de(request: Request) -> str | None:
    """Référence de la réservation posée par `exiger_budget_ia` pour cette requête (à passer au travail détaché)."""
    return getattr(request.state, "reservation_ia", None)


def _genre(request: Request) -> str:
    chemin = request.url.path
    if chemin.endswith("/analyze"):
        return "analyse"
    if chemin.endswith("/memoire/generate"):
        return "memoire"
    if chemin.endswith("/refaire"):
        return "refaire"
    return "appel"


def exiger_budget_ia(request: Request, user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """Dépendance des routes d'IA : contrôle + réservation (429 si le budget du jour de l'organisation est atteint).
    Route synchrone : réservation libérée en sortant (sa dépense réelle est déjà inscrite). Travail détaché lancé : la
    réservation reste, le travail la règle. Route refusée (exception) : réservation libérée."""
    genre = _genre(request)
    project_id = request.path_params.get("project_id", "")
    base = reference_de_travail(genre, project_id) if genre in TRAVAUX else "appel:"
    reference = base + uuid.uuid4().hex[:12]
    org_id = user.organization_id
    reserver(db, org_id, genre, reference)
    request.state.reservation_ia = reference      # portée jusqu'au travail détaché, qui ne libère qu'elle
    try:
        yield
    except BaseException:
        _liberer_seule(org_id, reference)
        raise
    if genre not in TRAVAUX:
        _liberer_seule(org_id, reference)
