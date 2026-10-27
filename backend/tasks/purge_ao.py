"""Tâche Celery : purge des AO supprimés depuis plus de N jours (B18).

Planifiée par le beat (tasks/check_expiry.py). Réglages : ``SYNORIX_PURGE_AO_JOURS`` (30) et
``SYNORIX_PURGE_AO_ACTIVE`` (0 = simulation : compte et journalise, ne supprime rien)."""
from tasks.check_expiry import celery_app


@celery_app.task(name="tasks.purge_ao.purger_ao_supprimes")
def purger_ao_supprimes_tache() -> dict:
    from database import SessionLocal
    from services.purge_ao import purger_ao_supprimes

    db = SessionLocal()
    try:
        return purger_ao_supprimes(db).en_dict()
    finally:
        db.close()
