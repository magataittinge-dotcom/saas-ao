"""checklist_items.signature_confirmed — confirmations de signature (C12)

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-04 23:00:00

« Je confirme avoir signé » par document à signer (AE, DC1, DC2) — persisté,
reflété dans le score de conformité.

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("checklist_items", "signature_confirmed"):
        op.add_column(
            "checklist_items",
            sa.Column(
                "signature_confirmed", sa.Boolean(),
                nullable=False, server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    if _has_column("checklist_items", "signature_confirmed"):
        op.drop_column("checklist_items", "signature_confirmed")
