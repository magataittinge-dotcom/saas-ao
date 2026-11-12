"""Tâche Celery : filet de la suppression du compte programmée (D23).

Planifiée chaque jour par le beat (tasks/check_expiry.py). Une demande de suppression dont la date (fin de la période
payée) est passée est exécutée si le webhook `customer.subscription.deleted` n'est jamais arrivé, après vérification
chez le fournisseur de paiement qu'aucun abonnement payant ne vit encore (services/resiliation_compte.py)."""
from tasks.check_expiry import celery_app


@celery_app.task(name="tasks.suppression_comptes.executer_suppressions_echues")
def executer_suppressions_echues_tache() -> int:
    from database import SessionLocal
    from services.resiliation_compte import executer_suppressions_echues

    db = SessionLocal()
    try:
        return executer_suppressions_echues(db)
    finally:
        db.close()
