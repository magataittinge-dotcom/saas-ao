"""notifications — infrastructure notifications sobres (C23)

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-04 20:00:00

Table notifications (org, type, titre, corps, lu/non-lu, dedup_key unique
pour l'idempotence du job quotidien).

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(name)


def upgrade() -> None:
    if not _has_table("notifications"):
        op.create_table(
            "notifications",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "organization_id", sa.String(),
                sa.ForeignKey("organizations.id"), nullable=False,
            ),
            sa.Column("type", sa.String(40), nullable=False),
            sa.Column("titre", sa.String(255), nullable=False),
            sa.Column("corps", sa.Text(), nullable=True),
            sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("dedup_key", sa.String(255), nullable=True, unique=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_notifications_organization_id", "notifications", ["organization_id"])
        op.create_index("ix_notifications_read", "notifications", ["read"])
        op.create_index("ix_notifications_created_at", "notifications", ["created_at"])


def downgrade() -> None:
    if _has_table("notifications"):
        op.drop_index("ix_notifications_created_at", table_name="notifications")
        op.drop_index("ix_notifications_read", table_name="notifications")
        op.drop_index("ix_notifications_organization_id", table_name="notifications")
        op.drop_table("notifications")
