"""Réconciliation des runs orphelins au démarrage (R5).

Un process tué en plein run (déploiement, OOM) laisse un projet coincé en
`processing_status='analyzing'`/`'generating'` : l'unité d'analyse
consommée au lancement n'est jamais remboursée, et — depuis la
réservation atomique T2a — le projet est même BLOQUÉ en relance.

Ce module, appelé au démarrage, rembourse exactement les unités encore
dues et rouvre le projet.

Hypothèse de déploiement (docs/DEPLOYMENT.md) : service systemd UNIQUE →
tous les workers redémarrent ensemble, donc au boot aucun run n'est
légitimement en vol. Si un jour on passe à un restart ROULANT (worker par
worker), ajouter un heartbeat pour ne pas réconcilier les runs vivants
des autres workers.
"""
import json
import logging

from sqlalchemy.orm import Session

from models.project import Project
from services import quota

logger = logging.getLogger(__name__)


def reconcile_orphan_runs(db: Session) -> int:
    """Rembourse (par id, exactement) et rouvre les runs orphelins. Retourne
    le nombre de projets réconciliés. Idempotent : `refund_ids` sur des
    lignes déjà supprimées = no-op, donc deux workers bootant en parallèle
    ne double-remboursent pas."""
    orphans = db.query(Project).filter(
        Project.processing_status.in_(["analyzing", "generating"]),
    ).all()
    if not orphans:
        return 0

    for p in orphans:
        was = p.processing_status
        ids = []
        if p.active_run_consumptions:
            try:
                ids = json.loads(p.active_run_consumptions) or []
            except (ValueError, TypeError):
                ids = []
        if ids:
            quota.refund_ids(db, ids)          # analyse : recrédite l'unité
        p.active_run_consumptions = None
        p.processing_status = "error"
        p.processing_detail = (
            "Analyse interrompue par un redémarrage du serveur — relancez "
            "(l'unité a été recréditée)."
            if was == "analyzing" else
            "Génération interrompue par un redémarrage du serveur — relancez."
        )

    db.commit()
    logger.info("Réconciliation runs orphelins : %d projet(s) rouvert(s)", len(orphans))
    return len(orphans)
