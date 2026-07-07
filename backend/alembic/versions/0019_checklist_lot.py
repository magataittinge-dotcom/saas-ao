"""checklist_items.lot — pièce commune (NULL) vs pièce par lot ('lotN').

Revision ID: 0019
Revises: 0018
"""
import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("checklist_items")]
    if "lot" not in cols:
        op.add_column("checklist_items", sa.Column("lot", sa.Text(), nullable=True))


def downgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("checklist_items")]
    if "lot" in cols:
        op.drop_column("checklist_items", "lot")
