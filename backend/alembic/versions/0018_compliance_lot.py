"""compliance_items.lot — mutualisation multi-lots.

'_commun' = tronc commun (RC/CCAP/AE, analysé une fois, partagé entre lots) ;
'lotN'    = exigences spécifiques du lot (CCTP/DPGF filtrés) ;
NULL      = lignes antérieures à la migration (traitées comme le lot courant).

Revision ID: 0018
Revises: 0017
"""
import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("compliance_items")]
    if "lot" not in cols:
        op.add_column("compliance_items", sa.Column("lot", sa.Text(), nullable=True))
        op.create_index("ix_compliance_items_lot", "compliance_items", ["project_id", "lot"])


def downgrade() -> None:
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("compliance_items")]
    if "lot" in cols:
        op.drop_index("ix_compliance_items_lot", table_name="compliance_items")
        op.drop_column("compliance_items", "lot")
