"""Package Celery — expose l'application pour `celery -A tasks worker|beat`.

R13 : ce fichier était vide (0 octet), donc `celery -A tasks ...` (commande
documentée dans docs/DEPLOYMENT.md §9.2) ne trouvait aucune application et le
scan quotidien (expirations coffre, deadlines J-3/J-1, relances) ne tournait
jamais. On ré-exporte ici l'app et la tâche définies dans tasks.check_expiry.

`app` est l'attribut qu'inspecte Celery lors de la découverte `-A tasks`.
"""
from tasks.check_expiry import celery_app, check_all_expirations

# Nom conventionnel scruté par `celery -A tasks` (find_app).
app = celery_app

__all__ = ["app", "celery_app", "check_all_expirations"]
