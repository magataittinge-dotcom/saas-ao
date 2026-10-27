"""compliance_items : ancre de la source dans le PDF (sujet A, « Voir dans le DCE »).

ancre : JSON nullable — {version, doc_id, page, rotation, rects, niveau, citation[, suite]},
calculé à la fin de l'analyse (ou au premier clic pour un ancien AO) par
services/pdf_ancre.py. NULL = pas encore calculé, ou pièce sans PDF lisible (l'écran
retombe sur la page citée par l'analyse).

Revision ID: 0025
Revises: 0024

Idempotent (colonne ajoutée seulement si absente). Downgrade : colonne retirée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def _colonnes() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("compliance_items")}


def upgrade() -> None:
    if "ancre" not in _colonnes():
        op.add_column("compliance_items", sa.Column("ancre", sa.JSON(), nullable=True))


def downgrade() -> None:
    if "ancre" in _colonnes():
        op.drop_column("compliance_items", "ancre")
