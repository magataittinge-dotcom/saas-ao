"""T4 — R13 : le beat Celery n'était jamais branché.

`tasks/__init__.py` était vide (0 octet) → `celery -A tasks worker/beat`
(documenté dans DEPLOYMENT.md §9.2) ne trouvait aucune application Celery,
donc le scan quotidien (expirations coffre, deadlines J-3/J-1, relances)
ne tournait jamais en production.

Fix : `tasks/__init__.py` expose l'app (découverte par `-A tasks`) + le
beat_schedule déclare la tâche quotidienne, réellement enregistrée.
"""
from datetime import date, timedelta

from models.project import Project
from models.notification import Notification


def test_celery_app_discoverable_via_dash_A_tasks():
    """`celery -A tasks ...` doit résoudre l'app — c'est exactement ce que
    fait find_app('tasks'). Avant fix : AttributeError (package vide)."""
    from celery.app.utils import find_app
    from tasks.check_expiry import celery_app

    resolved = find_app("tasks")
    assert resolved is celery_app


def test_beat_schedule_declares_registered_daily_scan():
    from tasks import celery_app

    sched = celery_app.conf.beat_schedule
    assert "check-expiry-daily" in sched, "entrée beat quotidienne absente"
    entry = sched["check-expiry-daily"]
    assert entry["task"] == "tasks.check_expiry.check_all_expirations"
    # la tâche référencée par le beat doit être RÉELLEMENT enregistrée,
    # sinon le beat émet vers un nom mort.
    assert entry["task"] in celery_app.tasks


def test_daily_scan_task_executes_and_notifies(db_session, test_org):
    """Exécution réelle de la tâche (apply = synchrone, sans broker) :
    un AO à J-3 doit produire une notification deadline_j3."""
    from tasks.check_expiry import check_all_expirations

    db_session.add(Project(
        id="proj-r13", organization_id=test_org.id, name="AO Beat",
        status="en_cours", deadline=date.today() + timedelta(days=3),
    ))
    db_session.commit()

    result = check_all_expirations.apply()
    assert result.successful(), getattr(result, "traceback", None)

    db_session.expire_all()
    n = db_session.query(Notification).filter_by(
        organization_id=test_org.id, type="deadline_j3",
    ).count()
    assert n >= 1, "le scan quotidien n'a émis aucune notification deadline_j3"
