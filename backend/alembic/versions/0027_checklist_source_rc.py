"""checklist_items : source de la lecture dans le RC (bloc 9, tranche 4).

source_document    : Text nullable — document cité par l'exigence dont l'extrait a été retenu.
source_page        : Integer nullable — page citée.
source_article     : String(200) nullable — article qui précède l'extrait dans le texte du
                     document (services/rc_article.py) ; NULL si rien n'est lu.
source_exigence_id : FK compliance_items.id nullable (ON DELETE SET NULL) — exigence d'origine,
                     point d'ancrage du panneau « Voir dans le DCE ».

Revision ID: 0027
Revises: 0026

Idempotent (colonnes ajoutées seulement si absentes). Les lignes existantes restent à NULL :
l'écran ne cite alors aucune source jusqu'au prochain « Actualiser ». Downgrade : colonnes retirées.
"""
import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

_SIMPLES = (
    ("source_document", sa.Text()),
    ("source_page", sa.Integer()),
    ("source_article", sa.String(200)),
)


def _colonnes() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("checklist_items")}


def upgrade() -> None:
    colonnes = _colonnes()
    for nom, type_ in _SIMPLES:
        if nom not in colonnes:
            op.add_column("checklist_items", sa.Column(nom, type_, nullable=True))
    if "source_exigence_id" not in colonnes:
        with op.batch_alter_table("checklist_items") as lot:
            lot.add_column(sa.Column("source_exigence_id", sa.String(), nullable=True))
            lot.create_foreign_key("fk_checklist_items_source_exigence", "compliance_items",
                                   ["source_exigence_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    colonnes = _colonnes()
    with op.batch_alter_table("checklist_items") as lot:
        if "source_exigence_id" in colonnes:
            lot.drop_constraint("fk_checklist_items_source_exigence", type_="foreignkey")
            lot.drop_column("source_exigence_id")
        for nom, _ in _SIMPLES:
            if nom in colonnes:
                lot.drop_column(nom)
