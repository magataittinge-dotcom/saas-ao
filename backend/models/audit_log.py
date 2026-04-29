"""Audit log — append-only trail of sensitive actions.

Used for compliance (RGPD, soc2-light), debugging, security forensics, and
later for product analytics ("how often do users hit feature X").

Volume estimate: ~5-30 rows / user / day → at 100 paying customers ~30k rows/day
~10M rows/year. Keep indexes tight (organization_id + created_at).
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Index
from database import Base
import uuid


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Actor — both nullable because some actions (system cron, webhook) have no user.
    user_id = Column(String, nullable=True, index=True)
    organization_id = Column(String, nullable=True, index=True)

    # What was done.
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(32), nullable=True)
    target_id = Column(String, nullable=True)

    # Free-form context (file_name, plan changed, ip address, …).
    extra = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_audit_logs_org_created", "organization_id", "created_at"),
        Index("ix_audit_logs_user_created", "user_id", "created_at"),
    )
