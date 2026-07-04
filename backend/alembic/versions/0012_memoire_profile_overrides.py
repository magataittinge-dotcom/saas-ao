"""memoires_techniques.profile_overrides — pre-flight preview (C9a)

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-04 18:00:00

Overrides de profil locaux à un mémoire (ARCH §3.7) : édités au pre-flight,
ils n'altèrent le profil org que si « mettre à jour mon profil » est coché.

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("memoires_techniques", "profile_overrides"):
        op.add_column(
            "memoires_techniques",
            sa.Column("profile_overrides", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("memoires_techniques", "profile_overrides"):
        op.drop_column("memoires_techniques", "profile_overrides")
