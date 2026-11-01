"""Plafonds de la lecture automatique par entreprise : chaque lecture est un appel payant au modèle.

Trois plafonds, vérifiés AVANT de lancer une lecture (et avant chaque appel d'une lecture longue) :
- appels au modèle par jour et par entreprise (`DEPOT_APPELS_PAR_JOUR`, 60 par défaut) ;
- dépense du mois par entreprise, calculée depuis la table `couts_ia` (`DEPOT_BUDGET_MENSUEL_EUR`, 3 € par défaut) ;
- lectures en attente par entreprise (`DEPOT_LECTURES_EN_ATTENTE`, 10 par défaut) : la file est bornée.
Jours et mois sont comptés en UTC. Au-delà, le fichier entre quand même au coffre-fort, sans lecture : l'état est
« Déposé dans le coffre-fort · lecture automatique reprise demain » (ou « le mois prochain », ou « dès qu'une place se
libère »). La lecture reprend d'elle-même quand la place revient, à la prochaine ouverture de l'écran ou au prochain dépôt
(aucun planificateur : rien ne tourne la nuit). Un redépôt identique ne compte pas : il ne crée aucune lecture.
Les valeurs par défaut sont des décisions à valider par Mohamed.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.depot_entreprise import CoutIA, LectureDepot
from models.document import Document

USAGE = "depot_entreprise"
MESSAGES = {
    "jour": "lecture automatique reprise demain",
    "mois": "lecture automatique reprise le mois prochain",
    "file": "lecture automatique reprise dès qu'une place se libère",
}


def _nombre(nom: str, defaut: float, cast=int):
    try:
        v = cast(os.environ.get(nom, ""))
        return v if v >= 0 else defaut
    except ValueError:
        return defaut


def plafonds() -> dict:
    return {
        "appels_par_jour": _nombre("DEPOT_APPELS_PAR_JOUR", 60),
        "budget_mensuel_eur": _nombre("DEPOT_BUDGET_MENSUEL_EUR", 3.0, float),
        "lectures_en_attente": _nombre("DEPOT_LECTURES_EN_ATTENTE", 10),
    }


def appels_du_jour(db: Session, org_id: str) -> int:
    debut = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return db.query(func.count(CoutIA.id)).filter(
        CoutIA.organization_id == org_id, CoutIA.usage == USAGE, CoutIA.created_at >= debut).scalar() or 0


def depense_du_mois(db: Session, org_id: str) -> float:
    debut = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return float(db.query(func.coalesce(func.sum(CoutIA.cout_eur), 0.0)).filter(
        CoutIA.organization_id == org_id, CoutIA.usage == USAGE, CoutIA.created_at >= debut).scalar() or 0.0)


def lectures_en_attente(db: Session, org_id: str) -> int:
    return db.query(func.count(LectureDepot.id)).filter(
        LectureDepot.organization_id == org_id, LectureDepot.etat == "en_lecture").scalar() or 0


def raison_de_report(db: Session, org_id: str, avec_file: bool = True) -> Optional[str]:
    """None : la lecture peut partir. Sinon « mois », « jour » ou « file » (voir MESSAGES)."""
    p = plafonds()
    if depense_du_mois(db, org_id) >= p["budget_mensuel_eur"]:
        return "mois"
    if appels_du_jour(db, org_id) >= p["appels_par_jour"]:
        return "jour"
    if avec_file and lectures_en_attente(db, org_id) >= p["lectures_en_attente"]:
        return "file"
    return None


def reprendre_differees(db: Session, org_id: str) -> int:
    """Relance, dans l'ordre d'arrivée, les lectures différées dont la place est revenue. Rend le nombre relancé."""
    from services import depot_extraction, depot_lecture
    relancees = 0
    for lecture in db.query(LectureDepot).filter(
            LectureDepot.organization_id == org_id, LectureDepot.etat == "differee").order_by(LectureDepot.created_at).all():
        doc = db.query(Document).filter(Document.id == lecture.document_id, Document.organization_id == org_id).first()
        if doc is None or doc.deleted_at is not None:
            # supprimé du coffre-fort pendant l'attente : jamais relancé, son texte ne part pas
            lecture.etat, lecture.message, lecture.terminee_le = "ecartee", depot_lecture.MESSAGE_ECARTEE, datetime.utcnow()
            db.commit()
            continue
        if raison_de_report(db, org_id) is not None:
            break
        lecture.etat, lecture.message = "en_lecture", None
        db.commit()
        depot_extraction.lancer(lecture.id, org_id)
        relancees += 1
    return relancees
