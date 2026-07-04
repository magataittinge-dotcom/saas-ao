"""checklist_items.rc_position — ordre du RC pour l'export (C13b)

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-05 04:00:00

Position de l'exigence dans le RC (ordre de l'analyse) : la numérotation
des pièces du ZIP d'export suit cet ordre. NULL pour les checklists
antérieures → elles gardent leur ordre actuel (fin de liste).

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("checklist_items", "rc_position"):
        op.add_column("checklist_items", sa.Column("rc_position", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _has_column("checklist_items", "rc_position"):
        op.drop_column("checklist_items", "rc_position")
