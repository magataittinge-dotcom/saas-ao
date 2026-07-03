"""organizations : vérification Sirene (C2)

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-04 02:00:00

  • siret_verified    : SIRET confirmé au répertoire Sirene
  • trial_granted     : 1 SIRET = 1 essai gratuit (False si doublon)
  • naf_code          : code NAF/APE pré-rempli depuis Sirene
  • effectif_tranche  : libellé tranche d'effectif INSEE

Idempotent (chaque colonne vérifie son existence).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("siret_verified", sa.Column(
        "siret_verified", sa.Boolean(), nullable=False, server_default=sa.text("false"),
    )),
    ("trial_granted", sa.Column(
        "trial_granted", sa.Boolean(), nullable=False, server_default=sa.text("true"),
    )),
    ("naf_code", sa.Column("naf_code", sa.String(10), nullable=True)),
    ("effectif_tranche", sa.Column("effectif_tranche", sa.String(80), nullable=True)),
]


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    for name, column in _COLUMNS:
        if not _has_column("organizations", name):
            op.add_column("organizations", column)


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        if _has_column("organizations", name):
            op.drop_column("organizations", name)
