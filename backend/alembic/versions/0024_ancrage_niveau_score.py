"""compliance_items : ancrage de la source mesurable (bloc 2, tranche 4).

source_excerpt_ia : extrait d'origine de l'IA (avant : écrasé par le passage
ancré) ; ancrage_niveau : exact | normalise | segment | recupere | aucun
(NULL = ligne antérieure à cette migration) ; ancrage_score : 1.0 si le texte
est retrouvé tel quel, sinon la part pondérée des termes retrouvés.

Revision ID: 0024
Revises: 0023

Idempotent (colonnes ajoutées seulement si absentes). Downgrade : colonnes
retirées.
"""
import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

_COLONNES = (
    ("source_excerpt_ia", sa.Text()),
    ("ancrage_niveau", sa.String(16)),
    ("ancrage_score", sa.Float()),
)


def upgrade() -> None:
    existantes = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("compliance_items")}
    for nom, type_ in _COLONNES:
        if nom not in existantes:
            op.add_column("compliance_items", sa.Column(nom, type_, nullable=True))


def downgrade() -> None:
    existantes = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("compliance_items")}
    for nom, _type in reversed(_COLONNES):
        if nom in existantes:
            op.drop_column("compliance_items", nom)
