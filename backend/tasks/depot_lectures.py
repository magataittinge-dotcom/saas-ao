"""Tâche Celery : reprise horaire des lectures de dépôt reportées (plafond du jour, du mois ou file pleine), planifiée par
le beat de tasks/check_expiry.py (3600 s). La lecture va jusqu'au bout DANS la tâche (pas de fil détaché qui mourrait avec
le processus enfant) ; la logique, les plafonds et la prise atomique sont dans services/depot_budget.py."""
from tasks.check_expiry import celery_app


@celery_app.task(name="tasks.depot_lectures.reprendre_lectures_differees")
def reprendre_lectures_differees_tache() -> dict:
    from database import SessionLocal
    from services import depot_budget

    db = SessionLocal()
    try:
        return depot_budget.reprendre_pour_toutes_les_entreprises(db)
    finally:
        db.close()
