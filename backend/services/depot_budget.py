"""Plafonds de la lecture automatique par entreprise : chaque lecture est un appel payant au modèle.

Trois plafonds, vérifiés AVANT de lancer une lecture (et avant chaque appel d'une lecture longue) :
- appels au modèle par jour et par entreprise (`DEPOT_APPELS_PAR_JOUR`, 60 par défaut) ;
- dépense du mois par entreprise, calculée depuis la table `couts_ia` (`DEPOT_BUDGET_MENSUEL_EUR`, 3 € par défaut) ;
- lectures en attente par entreprise (`DEPOT_LECTURES_EN_ATTENTE`, 10 par défaut) : la file est bornée.
Jours et mois sont comptés en UTC. Au-delà, le fichier entre quand même au coffre-fort, sans lecture : l'état est
« Déposé dans le coffre-fort · lecture automatique reprise demain » (ou « le mois prochain », ou « dès qu'une place se
libère »). La lecture reprend d'elle-même quand la place revient : à la prochaine ouverture de l'écran, au prochain
dépôt, et toutes les heures par la tâche Celery beat `tasks.depot_lectures.reprendre_lectures_differees` (qui lit
jusqu'au bout dans la tâche : `reprendre_differees(..., synchrone=True)`). Une lecture est PRISE par un UPDATE conditionnel
(`etat = 'differee'`) : si l'API et le beat reprennent la même en même temps, un seul la lance. Un redépôt identique ne
compte pas : il ne crée aucune lecture.
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
    from services import budget_ia            # S-01 — filet général : budget d'IA du jour de l'organisation
    if budget_ia.depasse(db, org_id):
        return "jour"
    if avec_file and lectures_en_attente(db, org_id) >= p["lectures_en_attente"]:
        return "file"
    return None


def _prendre(db: Session, lecture_id: str, org_id: str) -> bool:
    """Prise ATOMIQUE d'une lecture différée : l'UPDATE ne touche la ligne que si elle est encore « differee » (et de CETTE
    entreprise). Une seule reprise (API ou beat) voit « 1 ligne touchée » ; l'autre n'a rien à lancer."""
    touchees = db.query(LectureDepot).filter(
        LectureDepot.id == lecture_id, LectureDepot.organization_id == org_id, LectureDepot.etat == "differee",
    ).update({"etat": "en_lecture", "message": None}, synchronize_session=False)
    db.commit()
    return touchees == 1


def _lire_ici(db: Session, lecture_id: str, org_id: str) -> None:
    """Lit dans le fil courant (tâche Celery), une lecture à la fois par entreprise (même verrou que les fils détachés).
    Une erreur inattendue ne laisse pas la lecture « en_lecture » pour toujours : elle passe en « echec », puis remonte."""
    from services import depot_extraction, depot_lecture
    with depot_extraction._verrou(org_id):
        try:
            depot_extraction.traiter_lecture(lecture_id)
        except Exception:
            db.rollback()
            db.query(LectureDepot).filter(LectureDepot.id == lecture_id, LectureDepot.organization_id == org_id,
                                          LectureDepot.etat == "en_lecture").update(
                {"etat": "echec", "message": depot_lecture.MESSAGE_ECHEC, "terminee_le": datetime.utcnow()},
                synchronize_session=False)
            db.commit()
            raise


def reprendre_differees(db: Session, org_id: str, *, synchrone: bool = False) -> int:
    """Relance, dans l'ordre d'arrivée, les lectures différées de CETTE entreprise dont la place est revenue. Rend le nombre
    relancé. ``synchrone=False`` (API) : chaque lecture part dans un fil détaché. ``synchrone=True`` (tâche Celery) : elle
    va jusqu'au bout dans le fil appelant, une à la fois."""
    from services import depot_extraction, depot_lecture
    relancees = 0
    a_voir = db.query(LectureDepot.id, LectureDepot.document_id).filter(
        LectureDepot.organization_id == org_id, LectureDepot.etat == "differee").order_by(LectureDepot.created_at).all()
    for lecture_id, document_id in a_voir:
        doc = db.query(Document).filter(Document.id == document_id, Document.organization_id == org_id).first()
        if doc is None or doc.deleted_at is not None:
            # supprimé du coffre-fort pendant l'attente : jamais relancé, son texte ne part pas
            db.query(LectureDepot).filter(LectureDepot.id == lecture_id, LectureDepot.organization_id == org_id,
                                          LectureDepot.etat == "differee").update(
                {"etat": "ecartee", "message": depot_lecture.MESSAGE_ECARTEE, "terminee_le": datetime.utcnow()},
                synchronize_session=False)
            db.commit()
            continue
        if raison_de_report(db, org_id) is not None:
            break
        if not _prendre(db, lecture_id, org_id):
            continue                                   # l'autre processus (API ou beat) l'a prise entre-temps
        if synchrone:
            _lire_ici(db, lecture_id, org_id)
        else:
            depot_extraction.lancer(lecture_id, org_id)
        relancees += 1
    return relancees


def reprendre_pour_toutes_les_entreprises(db: Session) -> dict:
    """Tâche horaire : pour chaque entreprise ayant des lectures différées, reprend ce que les plafonds permettent.
    Une entreprise en erreur n'arrête pas les autres. Rend des comptes seulement (jamais de texte, de nom ni d'identifiant)."""
    import logging
    journal = logging.getLogger("tasks.depot_lectures")
    organisations = [o for (o,) in db.query(LectureDepot.organization_id).filter(
        LectureDepot.etat == "differee").distinct().order_by(LectureDepot.organization_id).all()]
    relancees = erreurs = 0
    for org_id in organisations:
        try:
            relancees += reprendre_differees(db, org_id, synchrone=True)
        except Exception as exc:                       # le type de l'erreur suffit ; pas de trace (elle pourrait porter du contenu)
            db.rollback()
            erreurs += 1
            journal.error("depot : reprise horaire en échec pour une entreprise (%s)", type(exc).__name__)
    journal.info("depot : reprise horaire (%d entreprise(s), %d lecture(s) relancée(s), %d erreur(s))",
                 len(organisations), relancees, erreurs)
    return {"organisations": len(organisations), "relancees": relancees, "erreurs": erreurs}
