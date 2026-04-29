"""Append-only audit logging — small wrapper around the AuditLog model.

Usage::

    from services.audit_logger import log_action

    log_action(
        db, user, "project.delete",
        target_type="project", target_id=project_id,
        extra={"name": project.name},
    )

Rules:
  • never raises — a failed audit log must never break a user-facing request,
  • commits in its own transaction so a rollback in the caller doesn't lose it,
  • truncates `extra` payloads above 10 KB to keep the table healthy.
"""
import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.audit_log import AuditLog
from models.user import User

logger = logging.getLogger(__name__)

_MAX_EXTRA_BYTES = 10 * 1024


def log_action(
    db: Session,
    user: Optional[User],
    action: str,
    *,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    extra: Optional[dict] = None,
    organization_id: Optional[str] = None,
) -> None:
    """Persist a single audit row. Never raises."""
    try:
        if extra is not None:
            try:
                blob = json.dumps(extra, default=str)
                if len(blob.encode("utf-8")) > _MAX_EXTRA_BYTES:
                    extra = {"_truncated": True, "_keys": list(extra.keys())[:20]}
                else:
                    # Round-trip through json so that any non-trivially
                    # serialisable values (uuid, set, date, custom obj) get
                    # coerced to strings via default=str. Otherwise SQLAlchemy
                    # will re-serialise without that hint and crash.
                    extra = json.loads(blob)
            except Exception:
                extra = {"_serialization_error": True}

        row = AuditLog(
            user_id=user.id if user else None,
            organization_id=(
                organization_id
                or (user.organization_id if user and user.organization_id else None)
            ),
            action=action,
            target_type=target_type,
            target_id=target_id,
            extra=extra,
        )
        db.add(row)
        db.commit()
    except Exception as exc:
        logger.warning("audit_log insert failed for action=%s: %s", action, exc)
        try:
            db.rollback()
        except Exception:
            pass


def log_action_safe(*args: Any, **kwargs: Any) -> None:
    """Alias kept for readability — same as log_action."""
    log_action(*args, **kwargs)
