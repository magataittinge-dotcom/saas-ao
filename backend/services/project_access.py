"""Accès projet — source UNIQUE (R11).

Sept routers dupliquaient `_get_project_or_404`, dont cinq SANS le filtre
`deleted_at` : on pouvait lancer une analyse, générer un mémoire, exporter
ou modifier la compliance d'un projet SOFT-SUPPRIMÉ (quota + coût API
réels). Ce helper unique garantit l'invariant « supprimé = inaccessible »
partout, tout en préservant l'isolation multi-tenant (org_id).
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.project import Project


def get_owned_project(
    project_id: str,
    org_id: str,
    db: Session,
    *,
    include_deleted: bool = False,
) -> Project:
    """Récupère un projet de l'org (404 sinon). Écarte les soft-supprimés
    sauf `include_deleted=True` (réservé à la restauration)."""
    q = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    )
    if not include_deleted:
        q = q.filter(Project.deleted_at.is_(None))
    project = q.first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
