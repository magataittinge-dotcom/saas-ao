"""projects.depose_at — cycle de vie post-export (C14)

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-04 22:00:00

Date de dépôt réelle (posée au passage en 'soumis') : base du taux de
réussite et de la relance à J+30. Backfill : les projets déjà soumis
prennent leur updated_at comme date de dépôt.

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("projects", "depose_at"):
        op.add_column("projects", sa.Column("depose_at", sa.DateTime(), nullable=True))
        projects = sa.table(
            "projects",
            sa.column("status", sa.String),
            sa.column("depose_at", sa.DateTime),
            sa.column("updated_at", sa.DateTime),
        )
        op.execute(
            projects.update()
            .where(projects.c.status == "soumis")
            .values(depose_at=projects.c.updated_at)
        )


def downgrade() -> None:
    if _has_column("projects", "depose_at"):
        op.drop_column("projects", "depose_at")
