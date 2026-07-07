"""checklist_items.document_group — typologie métier (fournir/completer/synorix/workflow).

Revision ID: 0020
Revises: 0019
"""
import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("checklist_items")]
    if "document_group" not in cols:
        op.add_column(
            "checklist_items",
            sa.Column("document_group", sa.String(20), nullable=False,
                      server_default="fournir"),
        )


def downgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("checklist_items")]
    if "document_group" in cols:
        op.drop_column("checklist_items", "document_group")
