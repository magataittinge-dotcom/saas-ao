"""quota_consumptions table + organizations.subscription_started_at (C1)

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-03 04:00:00

Quotas mensuels (PRD v3.0) :
  • quota_consumptions : journal de consommation (1 ligne = 1 unité —
    1 analyse ou 1 mémoire par lot), le reset mensuel est un filtre de fenêtre
  • organizations.subscription_started_at : ancre de la fenêtre mensuelle
    (date de souscription au plan payant ; NULL en free → fallback created_at)

Idempotent: each operation checks whether the column/table already exists.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(name)


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_table("quota_consumptions"):
        op.create_table(
            "quota_consumptions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "organization_id",
                sa.String(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "kind",
                sa.Enum("analysis", "memoire", name="quota_kind"),
                nullable=False,
            ),
            sa.Column("project_id", sa.String(), nullable=True),
            sa.Column("lot", sa.String(50), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_quota_consumptions_organization_id",
            "quota_consumptions",
            ["organization_id"],
        )
        op.create_index(
            "ix_quota_consumptions_created_at",
            "quota_consumptions",
            ["created_at"],
        )

    if not _has_column("organizations", "subscription_started_at"):
        op.add_column(
            "organizations",
            sa.Column("subscription_started_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("organizations", "subscription_started_at"):
        op.drop_column("organizations", "subscription_started_at")
    if _has_table("quota_consumptions"):
        op.drop_index(
            "ix_quota_consumptions_created_at", table_name="quota_consumptions",
        )
        op.drop_index(
            "ix_quota_consumptions_organization_id", table_name="quota_consumptions",
        )
        op.drop_table("quota_consumptions")
        sa.Enum(name="quota_kind").drop(op.get_bind(), checkfirst=True)
