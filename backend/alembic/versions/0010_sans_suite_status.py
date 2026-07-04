"""project_status : valeur « sans_suite » (B7)

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-04 12:00:00

« Analysé — sans suite » : l'utilisateur a analysé l'AO et décidé en
connaissance de ne pas répondre — état de succès produit, posable en
1 clic depuis le dashboard.

Idempotent. Downgrade : les projets sans_suite reviennent à 'analyzed' ;
sur PostgreSQL la valeur d'enum reste définie (PG ne sait pas la retirer).
"""
import sqlalchemy as sa
from alembic import op


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'sans_suite'")
    # SQLite : la colonne est un VARCHAR — rien à faire.


def downgrade() -> None:
    projects = sa.table("projects", sa.column("status", sa.String))
    op.execute(
        projects.update()
        .where(projects.c.status == "sans_suite")
        .values(status="analyzed")
    )
