"""checklist_status : valeur « warning » (C10)

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-04 14:00:00

⚠️ « présente mais problème » : document du coffre expiré, non vérifié
(unverified) ou non classé, matché sur une exigence — distinct de
présent/manquant.

Idempotent. Downgrade : les items warning reviennent à 'present' ; sur
PostgreSQL la valeur d'enum reste définie (PG ne sait pas la retirer).
"""
import sqlalchemy as sa
from alembic import op


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE checklist_status ADD VALUE IF NOT EXISTS 'warning'")


def downgrade() -> None:
    items = sa.table("checklist_items", sa.column("status", sa.String))
    op.execute(
        items.update()
        .where(items.c.status == "warning")
        .values(status="present")
    )
