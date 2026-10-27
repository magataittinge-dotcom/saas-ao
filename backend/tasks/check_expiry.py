"""
Celery task: daily check of document expirations for all organizations.
"""
from celery import Celery
from config import get_settings

from services.durcissement import interdire_lecture_memoire

interdire_lecture_memoire()   # environ du worker illisible par les processus du même utilisateur (hérité par les enfants prefork)

settings = get_settings()

celery_app = Celery("saas_ao", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

celery_app.conf.beat_schedule = {
    "check-expiry-daily": {
        "task": "tasks.check_expiry.check_all_expirations",
        "schedule": 86400,  # 24 hours
    },
    # B18 — purge des AO supprimés depuis plus de N jours. Simulation tant que
    # SYNORIX_PURGE_AO_ACTIVE n'est pas à 1 (comptes journalisés, rien supprimé).
    "purge-ao-supprimes-daily": {
        "task": "tasks.purge_ao.purger_ao_supprimes",
        "schedule": 86400,
    },
}


@celery_app.task
def check_all_expirations():
    from database import SessionLocal
    from models.organization import Organization
    from services.expiry_checker import refresh_organization_statuses
    from services.notifications import run_daily_scan

    db = SessionLocal()
    try:
        orgs = db.query(Organization).all()
        for org in orgs:
            refresh_organization_statuses(org.id, db)
        # C23 — notifications quotidiennes (deadlines J-3/J-1, docs expirants,
        # relance 30 j). Idempotent via dedup_key : peut tourner plusieurs fois.
        run_daily_scan(db)
    finally:
        db.close()
