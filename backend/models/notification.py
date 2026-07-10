import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from database import Base

# Types de notifications V1 — ton sobre, jamais marketing (CLAUDE.md).
NOTIFICATION_TYPES = [
    "analysis_ready",
    "memoire_ready",
    "deadline_j3",
    "deadline_j1",
    "doc_expiring",
    "relance_30j",
]


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(
        String, ForeignKey("organizations.id"), nullable=False, index=True,
    )
    type = Column(String(40), nullable=False)
    titre = Column(String(255), nullable=False)
    corps = Column(Text, nullable=True)
    read = Column(Boolean, nullable=False, default=False, server_default="false", index=True)
    # Idempotence : le job quotidien peut tourner N fois — une notification
    # portant une dedup_key déjà émise n'est jamais recréée.
    dedup_key = Column(String(255), nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
