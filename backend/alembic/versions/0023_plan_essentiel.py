"""plan_type : valeur « essentiel » (offre Essentiel, 149 €/mois — 1.1)

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-22 14:00:00

Grille du 2026-10-22 : Essentiel (5 analyses + 5 mémoires/mois), Pro
(40 + 40), Business (illimité, usage raisonnable). Les quotas sont dans
services/quota.py (PLAN_LIMITS).

Idempotent. Downgrade : les organisations « essentiel » repassent en
« free » ; sur PostgreSQL la valeur d'enum reste définie (PG ne sait pas la
retirer).
"""
import sqlalchemy as sa
from alembic import op


revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'essentiel'")
    # SQLite : la colonne est un VARCHAR — rien à faire.


def downgrade() -> None:
    organizations = sa.table("organizations", sa.column("plan", sa.String))
    op.execute(
        organizations.update()
        .where(organizations.c.plan == "essentiel")
        .values(plan="free")
    )
