"""Le plan du mémoire : une table, une ligne par dossier et par lot (B1).

plans_memoire (nouvelle table) : project_id, organization_id, lot, parties (JSON ordonné : clé, titre, retirée,
partie annoncée par le dossier, fiche), valide_le, version. Le générateur ne lit que les plans validés.

Revision ID: 0034
Revises: 0033

Additive seulement. Idempotent (table et index créés seulement s'ils sont absents). SQLite (tests) et PostgreSQL.
Downgrade : la table est supprimée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None

TABLE = "plans_memoire"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if TABLE not in _tables():
        op.create_table(
            "plans_memoire",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("lot", sa.String(64), nullable=False, server_default=""),
            sa.Column("parties", sa.JSON(), nullable=False),
            sa.Column("valide_le", sa.DateTime(), nullable=True),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("project_id", "lot", name="uq_plans_memoire_projet_lot"),
        )
        op.create_index("ix_plans_memoire_project_id", TABLE, ["project_id"])
        op.create_index("ix_plans_memoire_organization_id", TABLE, ["organization_id"])


def downgrade() -> None:
    if TABLE in _tables():
        op.drop_table(TABLE)
