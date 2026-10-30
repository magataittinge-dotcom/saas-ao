"""checklist_items : « Déposé le … par … » (bloc 9, tranche 3).

depose_le     : DateTime nullable — instant (UTC) où la pièce a été posée (choix au
                coffre, ou formulaire rempli déposé) ; NULL = rien de posé par un geste.
depose_par_id : FK users.id nullable (ON DELETE SET NULL) — auteur du geste.

Revision ID: 0026
Revises: 0025

Idempotent (colonnes ajoutées seulement si absentes). Downgrade : colonnes retirées.
"""
import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def _colonnes() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("checklist_items")}


def upgrade() -> None:
    colonnes = _colonnes()
    if "depose_le" not in colonnes:
        op.add_column("checklist_items", sa.Column("depose_le", sa.DateTime(), nullable=True))
    if "depose_par_id" not in colonnes:
        with op.batch_alter_table("checklist_items") as lot:
            lot.add_column(sa.Column("depose_par_id", sa.String(), nullable=True))
            lot.create_foreign_key("fk_checklist_items_depose_par", "users", ["depose_par_id"], ["id"],
                                   ondelete="SET NULL")


def downgrade() -> None:
    colonnes = _colonnes()
    with op.batch_alter_table("checklist_items") as lot:
        if "depose_par_id" in colonnes:
            lot.drop_constraint("fk_checklist_items_depose_par", type_="foreignkey")
            lot.drop_column("depose_par_id")
        if "depose_le" in colonnes:
            lot.drop_column("depose_le")
