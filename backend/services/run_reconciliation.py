"""Réconciliation des runs orphelins au démarrage (R5, B6).

Un process tué en plein run (déploiement, OOM) laisse un projet coincé en
`processing_status='analyzing'`/`'generating'` : l'unité d'analyse
consommée au lancement n'est jamais remboursée, et — depuis la
réservation atomique T2a — le projet est même BLOQUÉ en relance.

Ce module, appelé au démarrage, rembourse exactement les unités encore
dues et rouvre le projet.

B6 — même sort pour les travaux de dépôt, tués eux aussi par un redémarrage :
  • extracting_zip / extracting_text : les pièces au texte NULL sont relues (lecture
    locale, aucun appel payant) par un fil de reprise ; sans pièce à lire, le projet
    repasse « ready » (ou, sans aucune pièce, « error » avec une consigne positive) ;
  • detecting_lots : retour à « ready », cache de lots vide — GET /lots relance la
    détection à la prochaine visite (elle peut appeler l'IA : jamais lancée au boot) ;
  • phase différée (gros PDF restés en « [document volumineux … ] » après un dépôt
    de moins de 24 h) : remis à lire dans le même fil de reprise.

Hypothèse de déploiement (docs/DEPLOYMENT.md) : service systemd UNIQUE →
tous les workers redémarrent ensemble, donc au boot aucun run n'est
légitimement en vol. Si un jour on passe à un restart ROULANT (worker par
worker), ajouter un heartbeat pour ne pas réconcilier les runs vivants
des autres workers.
"""
import json
import logging
import threading
from datetime import datetime, timedelta
from typing import Callable

from sqlalchemy.orm import Session

from models.project import Project, ProjectDocument
from services import quota

logger = logging.getLogger(__name__)

# Un gros PDF encore en placeholder plus de 24 h après son dépôt n'est pas une phase
# différée interrompue (échec ancien) : on ne le relit pas à chaque démarrage.
FENETRE_PHASE_DIFFEREE = timedelta(hours=24)
_PLACEHOLDER = "[document volumineux"

MSG_DEPOT_INTERROMPU = (
    "Le dépôt de l'archive a été interrompu par une mise à jour du service — "
    "redéposez l'archive."
)
MSG_REPRISE = "Reprise de la lecture des pièces après une mise à jour du service…"
MSG_PIECE_A_REDEPOSER = (
    "La lecture de cette pièce a été interrompue par une mise à jour du service — "
    "redéposez-la."
)


def lancer_extraction_en_fond(project_id: str, docs_info: list) -> None:
    """Fil de reprise : même extraction que le dépôt (``_extract_all_parallel``), mêmes
    noms de fil « synorix-extract-* » que les tests joignent en fin de test."""
    from routers.projects import _extract_all_parallel
    threading.Thread(
        target=_extract_all_parallel, args=(project_id, docs_info),
        daemon=True, name=f"synorix-extract-{project_id}",
    ).start()


def _docs_a_lire(db: Session, project_id: str) -> list:
    """(id, nom, type, taille, url) des pièces au texte NULL — le format de
    ``_extract_all_parallel``."""
    rows = db.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id,
        ProjectDocument.extracted_text.is_(None),
    ).all()
    return [(d.id, d.file_name, d.type, d.file_size or 0, d.file_url or "") for d in rows]


def _reconcilier_depots(db: Session, relancer: Callable | None) -> tuple[int, list]:
    """Réconcilie extracting_zip / extracting_text / detecting_lots et la phase différée.
    Retourne (nombre de projets, reprises à lancer APRÈS le commit)."""
    reprises: list = []
    traites: set = set()

    bloques = db.query(Project).filter(Project.processing_status.in_(
        ["extracting_zip", "extracting_text", "detecting_lots"])).all()
    for p in bloques:
        traites.add(p.id)
        was = p.processing_status
        if was == "detecting_lots":
            p.processing_status = "ready"
            p.processing_progress = 100
            p.processing_detail = ""
            continue
        a_lire = _docs_a_lire(db, p.id)
        if not a_lire:
            if was == "extracting_zip":
                has_docs = db.query(ProjectDocument.id).filter(
                    ProjectDocument.project_id == p.id).first() is not None
                if not has_docs:
                    p.processing_status = "error"       # relançable : l'utilisateur redépose
                    p.processing_progress = 0
                    p.processing_detail = MSG_DEPOT_INTERROMPU
                    continue
            p.processing_status = "ready"
            p.processing_progress = 100
            p.processing_detail = ""
        elif relancer is not None and p.deleted_at is None:
            p.processing_status = "extracting_text"
            p.processing_progress = 0
            p.processing_detail = MSG_REPRISE
            reprises.append((p.id, a_lire))
        else:
            # Pas de fil de reprise (ou projet supprimé) : jamais de texte vide sans
            # explication — chaque pièce dit quoi faire.
            for d in db.query(ProjectDocument).filter(
                    ProjectDocument.project_id == p.id,
                    ProjectDocument.extracted_text.is_(None)).all():
                d.extracted_text = ""
                d.extraction_warning = MSG_PIECE_A_REDEPOSER
            p.processing_status = "ready"
            p.processing_progress = 100
            p.processing_detail = ""

    # Phase différée interrompue : gros PDF resté en placeholder, dépôt récent.
    if relancer is not None:
        depuis = datetime.utcnow() - FENETRE_PHASE_DIFFEREE
        pending = (
            db.query(ProjectDocument)
            .join(Project, Project.id == ProjectDocument.project_id)
            .filter(
                ProjectDocument.extracted_text.like(_PLACEHOLDER + "%"),
                ProjectDocument.uploaded_at >= depuis,
                Project.deleted_at.is_(None),
            ).all()
        )
        par_projet: dict = {}
        for d in pending:
            if d.project_id in traites:
                continue
            d.extracted_text = None       # relu par le fil de reprise (re-placeholder + phase 2)
            par_projet.setdefault(d.project_id, []).append(
                (d.id, d.file_name, d.type, d.file_size or 0, d.file_url or ""))
        for pid, infos in par_projet.items():
            traites.add(pid)
            reprises.append((pid, infos))
    return len(traites), reprises


def reconcile_orphan_runs(db: Session, relancer_extraction: Callable | None = None) -> int:
    """Rembourse (par id, exactement) et rouvre les runs orphelins ; réconcilie aussi les
    dépôts coupés (B6). Retourne le nombre de projets réconciliés. Idempotent :
    `refund_ids` sur des lignes déjà supprimées = no-op, donc deux workers bootant en
    parallèle ne double-remboursent pas.

    ``relancer_extraction(project_id, docs_info)`` : lance la reprise de lecture des pièces
    (``lancer_extraction_en_fond`` au boot ; aucun appel payant). Sans lui, les pièces
    non lues reçoivent un message « redéposez-la » au lieu d'un texte vide muet."""
    orphans = db.query(Project).filter(
        Project.processing_status.in_(["analyzing", "generating"]),
    ).all()
    n_depots, reprises = _reconcilier_depots(db, relancer_extraction)
    if not orphans and not n_depots:
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
    # Les reprises partent APRÈS le commit : le fil relit un état déjà posé.
    for project_id, docs_info in reprises:
        try:
            relancer_extraction(project_id, docs_info)
        except Exception:
            logger.exception("Reprise de la lecture impossible (projet %s)", project_id)
    logger.info(
        "Réconciliation au démarrage : %d run(s) rouvert(s), %d dépôt(s) repris ou libérés",
        len(orphans), n_depots)
    return len(orphans) + n_depots
