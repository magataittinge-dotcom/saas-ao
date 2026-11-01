"""Références « particulier » : le nom du client est réduit à ses initiales sur les fiches et dans le mémoire,
sauf si l'entreprise coche « afficher le nom complet » (RGPD, décision du 1er/11).

references.client_nom_complet : booléen, faux par défaut (toutes les lignes existantes passent aux initiales).

Revision ID: 0031
Revises: 0030

Idempotent (colonne ajoutée seulement si absente). Downgrade : la colonne est retirée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

TABLE, COLONNE = "references", "client_nom_complet"


def _colonnes() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    if COLONNE not in _colonnes():
        with op.batch_alter_table(TABLE) as batch:
            batch.add_column(sa.Column(COLONNE, sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    if COLONNE in _colonnes():
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(COLONNE)
