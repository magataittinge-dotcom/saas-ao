"""
Quotas mensuels (C1) — compteurs + enforcement.

Unité produit : 1 analyse = 1 unité ; 1 mémoire (par lot généré) = 1 unité.

Limites par plan (PRD v3.0) :
  • free     : 1 AO d'essai offert à la création — 1 analyse + 1 mémoire, À VIE
               (pas de fenêtre mensuelle : l'essai ne se recharge pas).
  • pro      : 40 analyses + 40 mémoires par mois (fenêtre ancrée sur la date
               d'abonnement). Dépassement → blocage doux 402 + upgrade.
  • business : illimité (fair-use) — jamais bloqué.

Le décompte s'appuie sur le journal QuotaConsumption : compter = filtrer la
fenêtre courante ; le « reset mensuel » n'est donc jamais un job à exécuter.
"""
import calendar
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.organization import Organization
from models.quota_consumption import QuotaConsumption

# limit None = illimité ; monthly False = décompte à vie (essai free)
PLAN_LIMITS: dict = {
    "free": {"analysis": 1, "memoire": 1, "monthly": False},
    "pro": {"analysis": 40, "memoire": 40, "monthly": True},
    "business": {"analysis": None, "memoire": None, "monthly": True},
}

_UPGRADE_MESSAGES = {
    "free": (
        "Votre AO d'essai gratuit est utilisé. "
        "Passez au plan Pro (40 analyses + 40 mémoires/mois) pour continuer."
    ),
    "pro": (
        "Quota mensuel atteint ({used}/{limit} {label}). "
        "Passez au plan Business (illimité) ou attendez le renouvellement "
        "de votre période le {reset_date}."
    ),
}

_KIND_LABELS = {"analysis": "analyses", "memoire": "mémoires"}


def current_period_start(anchor: datetime, now: Optional[datetime] = None) -> datetime:
    """Début de la fenêtre mensuelle courante, ancrée sur `anchor`.

    La fenêtre démarre chaque mois au jour/heure anniversaire de l'ancre ;
    un jour d'ancrage inexistant (ex. 31 en février) est ramené au dernier
    jour du mois."""
    now = now or datetime.utcnow()

    def _anniversary(year: int, month: int) -> datetime:
        day = min(anchor.day, calendar.monthrange(year, month)[1])
        return anchor.replace(year=year, month=month, day=day)

    candidate = _anniversary(now.year, now.month)
    if candidate > now:
        year, month = (now.year - 1, 12) if now.month == 1 else (now.year, now.month - 1)
        candidate = _anniversary(year, month)
    return candidate


def _next_reset(anchor: datetime, now: Optional[datetime] = None) -> datetime:
    now = now or datetime.utcnow()
    start = current_period_start(anchor, now)
    year, month = (start.year + 1, 1) if start.month == 12 else (start.year, start.month + 1)
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def _plan_limits(org: Organization) -> dict:
    limits = PLAN_LIMITS.get(org.plan or "free", PLAN_LIMITS["free"])
    # 1 SIRET = 1 essai gratuit (C2) : essai non accordé → free à zéro unité.
    if (org.plan or "free") == "free" and getattr(org, "trial_granted", True) is False:
        return {**limits, "analysis": 0, "memoire": 0}
    return limits


def _quota_anchor(org: Organization) -> datetime:
    return org.subscription_started_at or org.created_at or datetime.utcnow()


def _used(db: Session, org: Organization, kind: str, now: Optional[datetime] = None) -> int:
    limits = _plan_limits(org)
    q = db.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == org.id,
        QuotaConsumption.kind == kind,
    )
    if limits["monthly"]:
        q = q.filter(QuotaConsumption.created_at >= current_period_start(_quota_anchor(org), now))
    return q.count()


def get_quota_status(db: Session, org: Organization, now: Optional[datetime] = None) -> dict:
    """Statut des deux compteurs pour l'org — consommé par GET /billing/quota."""
    limits = _plan_limits(org)
    anchor = _quota_anchor(org)
    return {
        "plan": org.plan or "free",
        "period_start": current_period_start(anchor, now).isoformat() if limits["monthly"] else None,
        "period_end": _next_reset(anchor, now).isoformat() if limits["monthly"] else None,
        "analyses": {"used": _used(db, org, "analysis", now), "limit": limits["analysis"]},
        "memoires": {"used": _used(db, org, "memoire", now), "limit": limits["memoire"]},
    }


def check_quota(db: Session, org: Organization, kind: str) -> None:
    """Blocage doux : 402 avec message d'upgrade explicite si le quota est
    atteint. Business (limite None) ne lève jamais."""
    limits = _plan_limits(org)
    limit = limits[kind]
    if limit is None:
        return
    used = _used(db, org, kind)
    if used < limit:
        return

    plan = org.plan or "free"
    if plan == "free":
        if getattr(org, "trial_granted", True) is False:
            detail = (
                "L'essai gratuit a déjà été utilisé pour ce SIRET. "
                "Passez au plan Pro (40 analyses + 40 mémoires/mois) pour continuer."
            )
        else:
            detail = _UPGRADE_MESSAGES["free"]
    else:
        detail = _UPGRADE_MESSAGES["pro"].format(
            used=used, limit=limit, label=_KIND_LABELS[kind],
            reset_date=_next_reset(_quota_anchor(org)).strftime("%d/%m/%Y"),
        )
    raise HTTPException(status_code=402, detail=detail)


def consume(
    db: Session,
    org: Organization,
    kind: str,
    project_id: Optional[str] = None,
    lot: Optional[str] = None,
) -> QuotaConsumption:
    """Décompte 1 unité (l'appelant committe avec sa transaction)."""
    row = QuotaConsumption(
        organization_id=org.id, kind=kind, project_id=project_id, lot=lot,
    )
    db.add(row)
    return row


def refund(
    db: Session,
    org: Organization,
    kind: str,
    project_id: Optional[str] = None,
    lot: Optional[str] = None,
) -> int:
    """Rembourse 1 unité après un échec TECHNIQUE (panne API/5xx/crédit
    épuisé) : supprime la consommation la plus récente correspondante — la
    relance ne re-paie donc pas. Jamais appelé pour un DCE vide/illisible
    (l'IA a tourné : l'unité reste due). Retourne 1 si remboursé, 0 sinon
    (idempotent : rien à rembourser → no-op)."""
    q = db.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == org.id,
        QuotaConsumption.kind == kind,
    )
    if project_id is not None:
        q = q.filter(QuotaConsumption.project_id == project_id)
    if lot is not None:
        q = q.filter(QuotaConsumption.lot == lot)
    row = q.order_by(QuotaConsumption.created_at.desc()).first()
    if row is None:
        return 0
    db.delete(row)
    return 1
