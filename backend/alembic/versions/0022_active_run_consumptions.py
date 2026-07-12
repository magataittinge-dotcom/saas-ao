"""projects.active_run_consumptions — réconciliation des runs orphelins (R5).

Stocke (JSON list) les ids des consommations de quota du run d'analyse en
cours ; permet, au redémarrage, de rembourser EXACTEMENT un run laissé
'analyzing' par un crash process puis de rouvrir le projet.

Revision ID: 0022
Revises: 0021
"""
import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    return sa.inspect(bind).has_table(name)


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "projects"):
        return
    cols = [c["name"] for c in sa.inspect(bind).get_columns("projects")]
    if "active_run_consumptions" not in cols:
        op.add_column(
            "projects",
            sa.Column("active_run_consumptions", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "projects"):
        return
    cols = [c["name"] for c in sa.inspect(bind).get_columns("projects")]
    if "active_run_consumptions" in cols:
        op.drop_column("projects", "active_run_consumptions")
