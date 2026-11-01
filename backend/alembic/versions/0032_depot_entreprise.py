"""Dépôt de documents par rubrique de « Mon entreprise » : lectures, propositions, coûts IA.

Additive seulement : rien n'est supprimé, renommé ni retypé.

documents            (2 colonnes nullables) : rubrique_entreprise, case_depot
lectures_depot       (nouvelle table) : un fichier déposé dans une case, état de sa lecture, empreinte sha256
propositions_profil  (nouvelle table) : informations proposées à partir d'un fichier, validées ou écartées par l'entreprise
couts_ia             (nouvelle table) : coût réel de chaque appel au modèle (jetons, dollars, euros)

Revision ID: 0032
Revises: 0031

Idempotent (une colonne, une table ou un index n'est créé que s'il est absent). SQLite (tests) et PostgreSQL.
Downgrade : les trois tables et les deux colonnes sont retirées ; le reste ne bouge pas.
"""
import sqlalchemy as sa
from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None

COLONNES_DOCUMENTS = [("rubrique_entreprise", sa.String(16)), ("case_depot", sa.String(24))]


def _colonnes(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _index(table: str) -> set[str]:
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def _indexer(table: str, colonnes: list[str]) -> None:
    existants = _index(table)
    for col in colonnes:
        nom = f"ix_{table}_{col}"
        if nom not in existants:
            op.create_index(nom, table, [col])


def upgrade() -> None:
    for nom, type_ in COLONNES_DOCUMENTS:
        if nom not in _colonnes("documents"):
            with op.batch_alter_table("documents") as batch:
                batch.add_column(sa.Column(nom, type_, nullable=True))

    if "lectures_depot" not in _tables():
        op.create_table(
            "lectures_depot",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=False),
            sa.Column("case_depot", sa.String(24), nullable=False),
            sa.Column("rubrique", sa.String(16), nullable=False),
            sa.Column("sha256", sa.String(64), nullable=False),
            sa.Column("etat", sa.String(16), nullable=False),
            sa.Column("message", sa.String(300), nullable=True),
            sa.Column("nb_propositions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("pages_lues", sa.Integer(), nullable=True),
            sa.Column("pages_total", sa.Integer(), nullable=True),
            sa.Column("plafond_atteint", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("terminee_le", sa.DateTime(), nullable=True),
        )
    _indexer("lectures_depot", ["organization_id", "document_id", "sha256", "created_at"])

    if "propositions_profil" not in _tables():
        op.create_table(
            "propositions_profil",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("lecture_id", sa.String(), sa.ForeignKey("lectures_depot.id"), nullable=False),
            sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=False),
            sa.Column("case_depot", sa.String(24), nullable=False),
            sa.Column("rubrique", sa.String(16), nullable=False),
            sa.Column("champ", sa.String(48), nullable=False),
            sa.Column("libelle", sa.String(200), nullable=False),
            sa.Column("valeur", sa.Text(), nullable=False),
            sa.Column("affichage", sa.String(300), nullable=True),
            sa.Column("remplace", sa.Text(), nullable=True),
            sa.Column("source_fichier", sa.String(255), nullable=False),
            sa.Column("source_page", sa.Integer(), nullable=True),
            sa.Column("source_lieu", sa.String(80), nullable=True),
            sa.Column("extrait", sa.String(200), nullable=True),
            sa.Column("statut", sa.String(12), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("decidee_le", sa.DateTime(), nullable=True),
        )
    _indexer("propositions_profil", ["organization_id", "lecture_id", "rubrique", "statut"])

    if "couts_ia" not in _tables():
        op.create_table(
            "couts_ia",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("usage", sa.String(40), nullable=False),
            sa.Column("modele", sa.String(60), nullable=False),
            sa.Column("jetons_entree", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("jetons_sortie", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("jetons_cache_lecture", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("jetons_cache_ecriture", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cout_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("cout_eur", sa.Float(), nullable=False, server_default="0"),
            sa.Column("reference", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
    _indexer("couts_ia", ["organization_id", "usage", "created_at"])


def downgrade() -> None:
    for table in ("couts_ia", "propositions_profil", "lectures_depot"):
        if table in _tables():
            op.drop_table(table)
    for nom, _type in reversed(COLONNES_DOCUMENTS):
        if nom in _colonnes("documents"):
            with op.batch_alter_table("documents") as batch:
                batch.drop_column(nom)
