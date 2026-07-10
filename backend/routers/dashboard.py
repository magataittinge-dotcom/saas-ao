from datetime import datetime, date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from database import get_db
from models.user import User
from models.project import Project
from models.document import Document
from routers.auth import get_auth_user
from services.cache import org_cache

router = APIRouter()


@router.get("/stats")
def get_dashboard_stats(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """Aggregated counters for the dashboard.

    Cached per-org for 60 s. Status-change endpoints invalidate via
    `org_cache.invalidate(org_id, "dashboard_stats")` (cf. project status updates).
    """
    org_id = user.organization_id
    cache_key = f"dashboard_stats:{org_id}"
    cached = org_cache.get(cache_key)
    if cached is not None:
        return cached

    now = date.today()
    first_of_month = now.replace(day=1)

    # ── 1 query, 4 aggregates: avoids 4 round-trips against the same scan ───
    p_row = db.query(
        func.sum(case((Project.status.in_(["brouillon", "en_cours"]), 1), else_=0)),
        # Audit #11 — « soumis ce mois » = DÉPOSÉ ce mois (depose_at) : un AO
        # gagné/perdu reste compté ; un vieux dépôt encore « soumis » ne l'est pas.
        func.sum(case((Project.depose_at >= first_of_month, 1), else_=0)),
        func.sum(case((Project.status == "gagné", 1), else_=0)),
        func.sum(case((Project.status.in_(["gagné", "perdu"]), 1), else_=0)),
    ).filter(
        Project.organization_id == org_id,
        Project.deleted_at.is_(None),
    ).one()

    en_cours = int(p_row[0] or 0)
    soumis_ce_mois = int(p_row[1] or 0)
    gagnes = int(p_row[2] or 0)
    total_decided = int(p_row[3] or 0)
    taux_succes = round(gagnes / total_decided * 100) if total_decided > 0 else 0

    # ── Single query for both document counters ────────────────────────────
    d_row = db.query(
        func.sum(case((Document.status == "expired", 1), else_=0)),
        func.sum(case((Document.status == "expiring_soon", 1), else_=0)),
    ).filter(
        Document.organization_id == org_id,
        Document.deleted_at.is_(None),
    ).one()

    payload = {
        "projects_en_cours": en_cours,
        "projects_soumis_ce_mois": soumis_ce_mois,
        "projects_gagnes": gagnes,
        "taux_succes": taux_succes,
        "documents_expires": int(d_row[0] or 0),
        "documents_expirant_bientot": int(d_row[1] or 0),
    }
    org_cache.set(cache_key, payload, ttl=60)
    return payload
