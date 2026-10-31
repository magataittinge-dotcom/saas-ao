"""Tâche Celery : synchronisation de la veille BOAMP (toutes les 6 h, planifiée par le beat de
tasks/check_expiry.py). Les avis sont des données publiques partagées : aucune organisation en jeu."""
from tasks.check_expiry import celery_app


@celery_app.task(name="tasks.veille_boamp.synchroniser_veille")
def synchroniser_veille_tache() -> dict:
    from database import SessionLocal
    from services.veille.boamp_sync import synchroniser

    db = SessionLocal()
    try:
        return synchroniser(db).en_dict()
    finally:
        db.close()
