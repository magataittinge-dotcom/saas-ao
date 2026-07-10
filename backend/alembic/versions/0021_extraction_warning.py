"""project_documents.extraction_warning — plus d'échec d'extraction silencieux
(document scanné / corrompu / .doc ancien : warning UI par fichier).

Revision ID: 0021
Revises: 0020
"""
import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("project_documents")]
    if "extraction_warning" not in cols:
        op.add_column(
            "project_documents",
            sa.Column("extraction_warning", sa.String(300), nullable=True),
        )


def downgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("project_documents")]
    if "extraction_warning" in cols:
        op.drop_column("project_documents", "extraction_warning")
