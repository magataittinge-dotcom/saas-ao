"""projects.lots_announced — nombre de lots annoncé dans le RC (C3)

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-04 04:00:00

Référence objective (regex sur le RC) servant à déclencher le filet IA
uniquement quand la détection déterministe a objectivement échoué.

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("projects", "lots_announced"):
        op.add_column("projects", sa.Column("lots_announced", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _has_column("projects", "lots_announced"):
        op.drop_column("projects", "lots_announced")
