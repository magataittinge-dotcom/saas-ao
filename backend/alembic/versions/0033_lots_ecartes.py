"""Lots cités dans le dossier mais non proposés : leur nombre et leur raison (R9, décision du 2/11).

projects.lots_ecartes : JSON nullable, {"hors_liste": n, "sans_intitule": m}. Écrit à la fin de la détection des lots ;
jamais de nom de lot (aucun nom inventé). NULL = détection antérieure à cette migration ou pas encore faite.

Revision ID: 0033
Revises: 0032

Idempotent (colonne ajoutée seulement si absente). Downgrade : la colonne est retirée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None

TABLE, COLONNE = "projects", "lots_ecartes"


def _colonnes() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    if COLONNE not in _colonnes():
        with op.batch_alter_table(TABLE) as batch:
            batch.add_column(sa.Column(COLONNE, sa.JSON(), nullable=True))


def downgrade() -> None:
    if COLONNE in _colonnes():
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(COLONNE)
