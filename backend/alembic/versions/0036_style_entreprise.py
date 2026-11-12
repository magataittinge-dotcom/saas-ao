"""« Le style de mon entreprise » (C4, éteinte par défaut : STYLE_ENTREPRISE=0).

Table styles_entreprise : une ligne par organisation (style lu dans un ancien mémoire, nom du fichier, modèle, date).
Lecture seule : jamais envoyée au générateur (décision D5). Voir models/style_entreprise.py.

Revision ID: 0036
Revises: 0035

Additive seulement. Idempotent (table créée seulement si absente). SQLite (tests) et PostgreSQL.
Downgrade : la table est retirée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None

TABLE = "styles_entreprise"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if TABLE not in _tables():
        op.create_table(
            "styles_entreprise",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("style", sa.JSON(), nullable=False),
            sa.Column("source_fichier", sa.String(255), nullable=False),
            sa.Column("modele", sa.String(64), nullable=False),
            sa.Column("lu_le", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_styles_entreprise_organization_id", TABLE, ["organization_id"], unique=True)


def downgrade() -> None:
    if TABLE in _tables():
        op.drop_index("ix_styles_entreprise_organization_id", table_name=TABLE)
        op.drop_table(TABLE)
