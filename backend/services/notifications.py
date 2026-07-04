"""
Notifications sobres (C23) — in-app + email.

  • notify() : émission avec dedup_key (idempotence) ; l'appelant committe.
  • Email via SMTP configuré en env vars (SMTP_HOST/PORT/USER/PASSWORD/FROM).
    SMTP absent → in-app seul + warning loggé. Un échec d'envoi ne perd
    JAMAIS la notification in-app et ne fait JAMAIS crasher l'appelant.
  • run_daily_scan() : deadlines J-3/J-1 (colonne projects.deadline),
    documents expirants (30 j), relance à J+30 après dépôt.

Ton : sobre, factuel, jamais marketing (CLAUDE.md).
"""
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from config import get_settings
from models.document import Document
from models.notification import NOTIFICATION_TYPES, Notification
from models.project import Project
from models.user import User

logger = logging.getLogger(__name__)

_EXPIRING_WINDOW_DAYS = 30
_RELANCE_DAYS = 30


# ─── Email ────────────────────────────────────────────────────────────────────

def _smtp_configured() -> bool:
    s = get_settings()
    return bool(getattr(s, "SMTP_HOST", "") and getattr(s, "SMTP_FROM", ""))


def _send_email(to: List[str], subject: str, body: str) -> None:
    """Envoi SMTP texte sobre. Lève en cas d'échec — l'appelant absorbe."""
    import smtplib
    from email.message import EmailMessage

    s = get_settings()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = s.SMTP_FROM
    msg["To"] = ", ".join(to)
    msg.set_content(body + "\n\n— Synorix")

    with smtplib.SMTP(s.SMTP_HOST, int(s.SMTP_PORT or 587), timeout=10) as smtp:
        smtp.starttls()
        if s.SMTP_USER:
            smtp.login(s.SMTP_USER, s.SMTP_PASSWORD)
        smtp.send_message(msg)


# ─── Émission ─────────────────────────────────────────────────────────────────

def notify(
    db: Session,
    organization_id: str,
    type: str,
    *,
    titre: str,
    corps: str = "",
    dedup_key: Optional[str] = None,
    send_email: bool = False,
) -> Optional[Notification]:
    """Émet une notification in-app (+ email si demandé et SMTP configuré).

    Retourne None si la dedup_key a déjà été émise (idempotence).
    L'appelant est responsable du commit."""
    if type not in NOTIFICATION_TYPES:
        raise ValueError(f"Type de notification inconnu : {type!r}")

    if dedup_key:
        exists = db.query(Notification).filter(
            Notification.dedup_key == dedup_key,
        ).first()
        if exists:
            return None

    notification = Notification(
        organization_id=organization_id,
        type=type, titre=titre, corps=corps, dedup_key=dedup_key,
    )
    db.add(notification)

    if send_email:
        if not _smtp_configured():
            logger.warning(
                "SMTP non configuré — notification %s émise in-app seulement", type,
            )
        else:
            try:
                recipients = [
                    u.email for u in db.query(User).filter(
                        User.organization_id == organization_id,
                    ).all() if u.email
                ]
                if recipients:
                    _send_email(recipients, titre, corps)
            except Exception as exc:
                # L'email est best-effort : l'in-app est déjà en base.
                logger.warning("Envoi email notification %s échoué : %s", type, exc)

    return notification


# ─── Scan quotidien ───────────────────────────────────────────────────────────

def run_daily_scan(db: Session, today: Optional[date] = None) -> int:
    """Deadlines J-3/J-1, documents expirants, relance 30 j après dépôt.

    Idempotent via dedup_key — peut tourner plusieurs fois par jour sans
    doublon. Retourne le nombre de notifications émises."""
    today = today or date.today()
    emitted = 0

    # ── Deadlines J-3 / J-1 (AO actifs) ──────────────────────────────────────
    active = db.query(Project).filter(
        Project.status.in_(("brouillon", "en_cours", "analyzed")),
        Project.deadline.isnot(None),
        Project.deleted_at.is_(None),
    ).all()
    for p in active:
        days_left = (p.deadline - today).days
        if days_left == 3:
            n = notify(
                db, p.organization_id, "deadline_j3",
                titre=f"AO {p.name} — remise dans 3 jours",
                corps=f"La date limite de remise des offres de « {p.name} » est le "
                      f"{p.deadline.strftime('%d/%m/%Y')}.",
                dedup_key=f"deadline_j3:{p.id}:{p.deadline.isoformat()}",
                send_email=True,
            )
            emitted += 1 if n else 0
        elif days_left == 1:
            n = notify(
                db, p.organization_id, "deadline_j1",
                titre=f"AO {p.name} — remise demain",
                corps=f"La date limite de remise des offres de « {p.name} » est demain "
                      f"({p.deadline.strftime('%d/%m/%Y')}). Les plateformes saturent "
                      "le dernier jour : déposez dès que possible.",
                dedup_key=f"deadline_j1:{p.id}:{p.deadline.isoformat()}",
                send_email=True,
            )
            emitted += 1 if n else 0

    # ── Documents du coffre expirant sous 30 jours ────────────────────────────
    docs = db.query(Document).filter(
        Document.expiry_date.isnot(None),
        Document.expiry_date >= today,
        Document.expiry_date <= today + timedelta(days=_EXPIRING_WINDOW_DAYS),
        Document.deleted_at.is_(None),
    ).all()
    for doc in docs:
        n = notify(
            db, doc.organization_id, "doc_expiring",
            titre=f"{doc.file_name} expire le {doc.expiry_date.strftime('%d/%m/%Y')}",
            corps=f"Le document « {doc.file_name} » de votre coffre-fort expire le "
                  f"{doc.expiry_date.strftime('%d/%m/%Y')}. Pensez à le renouveler "
                  "avant votre prochaine candidature.",
            dedup_key=f"doc_expiring:{doc.id}:{doc.expiry_date.isoformat()}",
            send_email=True,
        )
        emitted += 1 if n else 0

    # ── Relance 30 j après dépôt (statut soumis, une seule fois par AO) ──────
    # C14 affinera avec une date de dépôt dédiée ; en attendant, updated_at
    # du passage en 'soumis' fait référence.
    cutoff = datetime.utcnow() - timedelta(days=_RELANCE_DAYS)
    deposited = db.query(Project).filter(
        Project.status == "soumis",
        Project.deleted_at.is_(None),
    ).all()
    for p in deposited:
        depose_at = getattr(p, "depose_at", None) or p.updated_at
        if depose_at and depose_at <= cutoff:
            n = notify(
                db, p.organization_id, "relance_30j",
                titre=f"AO {p.name} — un retour ?",
                corps=f"Votre AO {p.name} déposé il y a 30 jours — avez-vous eu un retour ?",
                dedup_key=f"relance_30j:{p.id}",
                send_email=True,
            )
            emitted += 1 if n else 0

    db.commit()
    return emitted
