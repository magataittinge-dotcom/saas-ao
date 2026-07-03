"""projects.critical_fields — bandeau critique par lot (C5)

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-04 08:00:00

Champs critiques structurés (deadline, visite, critères, pénalités, délai,
date limite questions) avec sources, stockés PAR LOT analysé.

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("projects", "critical_fields"):
        op.add_column("projects", sa.Column("critical_fields", sa.JSON(), nullable=True))


def downgrade() -> None:
    if _has_column("projects", "critical_fields"):
        op.drop_column("projects", "critical_fields")
