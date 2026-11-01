"""Fiches « Mon entreprise » à télécharger : bordereau modifiable par rubrique.

fiches_entreprise : une ligne par (organization_id, rubrique) — titre, sous-titre, contact, couleur
                    d'accent, lignes libres (JSON), chemin du logo. Les données de la fiche ne sont pas
                    copiées : elles sont relues à chaque aperçu et à chaque génération.

Revision ID: 0030
Revises: 0028

Rattachement : dans la copie de travail de l'agent FICHES la migration 0029 (profil entreprise, agent
PAGE) n'existe pas encore ; le coordinateur remplace ``down_revision`` par « 0029 » à l'intégration
(une seule tête alembic).

Idempotent (table et index créés seulement s'ils sont absents). Downgrade : la table est supprimée.
"""
import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "fiches_entreprise" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "fiches_entreprise",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                      nullable=False),
            sa.Column("rubrique", sa.String(24), nullable=False),
            sa.Column("titre", sa.String(120), nullable=True),
            sa.Column("sous_titre", sa.String(200), nullable=True),
            sa.Column("contact", sa.String(200), nullable=True),
            sa.Column("couleur", sa.String(7), nullable=True),
            sa.Column("lignes_libres", sa.JSON(), nullable=True),
            sa.Column("logo_path", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("organization_id", "rubrique", name="uq_fiches_entreprise_org_rubrique"),
        )
        op.create_index("ix_fiches_entreprise_organization_id", "fiches_entreprise", ["organization_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "fiches_entreprise" in sa.inspect(bind).get_table_names():
        op.drop_table("fiches_entreprise")
