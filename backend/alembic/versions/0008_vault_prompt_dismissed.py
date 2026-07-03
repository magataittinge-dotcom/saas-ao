"""project_documents.vault_prompt_dismissed — coffre-fort progressif (C16)

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-04 06:00:00

Flag no-repropose : une fois le bandeau « enregistrer au coffre-fort »
refusé (ou accepté) pour un document, il n'est plus jamais re-proposé.

Idempotent.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("project_documents", "vault_prompt_dismissed"):
        op.add_column(
            "project_documents",
            sa.Column(
                "vault_prompt_dismissed", sa.Boolean(),
                nullable=False, server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    if _has_column("project_documents", "vault_prompt_dismissed"):
        op.drop_column("project_documents", "vault_prompt_dismissed")
