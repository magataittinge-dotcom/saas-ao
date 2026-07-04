"""
Celery task: daily check of document expirations for all organizations.
"""
from celery import Celery
from config import get_settings

settings = get_settings()

celery_app = Celery("saas_ao", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

celery_app.conf.beat_schedule = {
    "check-expiry-daily": {
        "task": "tasks.check_expiry.check_all_expirations",
        "schedule": 86400,  # 24 hours
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
