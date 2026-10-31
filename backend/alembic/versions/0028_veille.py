"""Veille des appels d'offres : avis publics BOAMP et préférences par utilisateur.

avis_veille         : table GLOBALE (données publiques, aucune organization_id) — id_boamp unique,
                      index B-tree sur date_limite / date_parution / synchronise_at ; en PostgreSQL
                      seulement, index GIN sur departements et metiers (colonnes converties en jsonb
                      dans l'index) pour les filtres par département et par métier.
preferences_veille  : une ligne par utilisateur (user_id unique), organization_id indexée.

Revision ID: 0028
Revises: 0027

Idempotent (tables et index créés seulement s'ils sont absents). SQLite (tests) : pas de GIN, les
colonnes JSON y sont simplement lues. Downgrade : les deux tables sont supprimées.
"""
import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _index(table: str) -> set[str]:
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    tables = _tables()
    if "avis_veille" not in tables:
        op.create_table(
            "avis_veille",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("id_boamp", sa.String(40), nullable=False),
            sa.Column("objet", sa.Text(), nullable=False),
            sa.Column("acheteur", sa.String(500), nullable=False, server_default=""),
            sa.Column("departements", sa.JSON(), nullable=False),
            sa.Column("date_parution", sa.Date(), nullable=False),
            sa.Column("date_limite", sa.Date(), nullable=True),
            sa.Column("nature", sa.String(40), nullable=False, server_default="APPEL_OFFRE"),
            sa.Column("procedure", sa.String(20), nullable=False, server_default="autre"),
            sa.Column("procedure_libelle", sa.String(120), nullable=True),
            sa.Column("famille", sa.String(20), nullable=True),
            sa.Column("descripteurs", sa.JSON(), nullable=False),
            sa.Column("codes_cpv", sa.JSON(), nullable=False),
            sa.Column("url_avis", sa.String(500), nullable=False),
            sa.Column("url_dossier", sa.String(1000), nullable=True),
            sa.Column("metiers", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("synchronise_at", sa.DateTime(), nullable=False),
        )
    existants = _index("avis_veille")
    for nom, colonnes, unique in (
        ("ix_avis_veille_id_boamp", ["id_boamp"], True),
        ("ix_avis_veille_date_parution", ["date_parution"], False),
        ("ix_avis_veille_date_limite", ["date_limite"], False),
        ("ix_avis_veille_synchronise_at", ["synchronise_at"], False),
    ):
        if nom not in existants:
            op.create_index(nom, "avis_veille", colonnes, unique=unique)
    if op.get_bind().dialect.name == "postgresql":
        for colonne in ("departements", "metiers"):
            op.execute(
                f"CREATE INDEX IF NOT EXISTS ix_avis_veille_{colonne}_gin "
                f"ON avis_veille USING gin ((({colonne})::jsonb))"
            )

    if "preferences_veille" not in tables:
        op.create_table(
            "preferences_veille",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False, unique=True),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("departements", sa.JSON(), nullable=False),
            sa.Column("ville", sa.JSON(), nullable=True),
            sa.Column("filtres", sa.JSON(), nullable=False),
            sa.Column("tri", sa.String(20), nullable=False, server_default="date_limite"),
            sa.Column("derniere_visite", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if "ix_preferences_veille_organization_id" not in _index("preferences_veille"):
        op.create_index("ix_preferences_veille_organization_id", "preferences_veille", ["organization_id"])


def downgrade() -> None:
    tables = _tables()
    if "preferences_veille" in tables:
        op.drop_table("preferences_veille")
    if "avis_veille" in tables:
        op.drop_table("avis_veille")
