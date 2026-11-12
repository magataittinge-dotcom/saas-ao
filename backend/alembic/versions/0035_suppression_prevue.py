"""La suppression du compte attend la fin de la période payée (D23).

organizations.suppression_prevue_le (DateTime, nullable) : date de fin de la période payée à laquelle toutes les données
de l'organisation seront supprimées ; NULL = aucune demande. Voir services/resiliation_compte.py.

Revision ID: 0035
Revises: 0034

Additive seulement. Idempotent (colonne ajoutée seulement si absente). SQLite (tests) et PostgreSQL.
Downgrade : la colonne est retirée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None

TABLE = "organizations"
COLONNE = "suppression_prevue_le"


def _colonnes() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    if COLONNE not in _colonnes():
        with op.batch_alter_table(TABLE) as batch:
            batch.add_column(sa.Column(COLONNE, sa.DateTime(), nullable=True))


def downgrade() -> None:
    if COLONNE in _colonnes():
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(COLONNE)
