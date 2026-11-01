"""Profil de l'entreprise : informations demandées par les pièces et critères courants (T4, « Mon entreprise »).

Additive seulement : aucune colonne ni table existante n'est supprimée, renommée ni retypée ; toutes les
colonnes ajoutées sont nullables, sans valeur par défaut imposée.

organizations   (5)  : forme_juridique, capital_social, greffe_rcs, email_contact, telephone
memoire_configs (9)  : metiers, departements_intervention, effectifs_par_categorie, habilitations,
                       materiel_liste, vehicules_liste, sous_traitance_partenaires,
                       sous_traitance_part_pct, sav_garantie
references      (4)  : description, client_type, client_adresse, mode_intervention
team_members    (1)  : experience_resume
qualifications  (nouvelle table, 12 colonnes) : qualifications, labels, certifications de management et
                       assurances déclarés (date de fin à surveiller, justificatif du coffre-fort).

Revision ID: 0029
Revises: 0028

Idempotent (une colonne ou une table n'est créée que si elle est absente). SQLite (tests) et PostgreSQL.
Downgrade : drop_column des 19 colonnes, drop_table qualifications (les autres données restent).
"""
import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

# (table, colonne, type)
COLONNES: list[tuple[str, str, sa.types.TypeEngine]] = [
    ("organizations", "forme_juridique", sa.String(80)),
    ("organizations", "capital_social", sa.BigInteger()),
    ("organizations", "greffe_rcs", sa.String(80)),
    ("organizations", "email_contact", sa.String(255)),
    ("organizations", "telephone", sa.String(30)),
    ("memoire_configs", "metiers", sa.JSON()),
    ("memoire_configs", "departements_intervention", sa.JSON()),
    ("memoire_configs", "effectifs_par_categorie", sa.JSON()),
    ("memoire_configs", "habilitations", sa.JSON()),
    ("memoire_configs", "materiel_liste", sa.JSON()),
    ("memoire_configs", "vehicules_liste", sa.JSON()),
    ("memoire_configs", "sous_traitance_partenaires", sa.String()),
    ("memoire_configs", "sous_traitance_part_pct", sa.Integer()),
    ("memoire_configs", "sav_garantie", sa.String()),
    ("references", "description", sa.Text()),
    ("references", "client_type", sa.String(16)),
    ("references", "client_adresse", sa.String(500)),
    ("references", "mode_intervention", sa.String(16)),
    ("team_members", "experience_resume", sa.String(1000)),
]


def _colonnes(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _index(table: str) -> set[str]:
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    for table, nom, type_ in COLONNES:
        if nom not in _colonnes(table):
            with op.batch_alter_table(table) as batch:
                batch.add_column(sa.Column(nom, type_, nullable=True))

    if "qualifications" not in _tables():
        op.create_table(
            "qualifications",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("famille", sa.String(24), nullable=False),
            sa.Column("intitule", sa.String(200), nullable=False),
            sa.Column("organisme", sa.String(120), nullable=True),
            sa.Column("numero", sa.String(80), nullable=True),
            sa.Column("perimetre", sa.String(500), nullable=True),
            sa.Column("date_obtention", sa.Date(), nullable=True),
            sa.Column("date_fin", sa.Date(), nullable=True),
            sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )
    existants = _index("qualifications")
    for nom, colonnes in (
        ("ix_qualifications_organization_id", ["organization_id"]),
        ("ix_qualifications_date_fin", ["date_fin"]),
        ("ix_qualifications_deleted_at", ["deleted_at"]),
    ):
        if nom not in existants:
            op.create_index(nom, "qualifications", colonnes)


def downgrade() -> None:
    if "qualifications" in _tables():
        op.drop_table("qualifications")
    for table, nom, _type in reversed(COLONNES):
        if nom in _colonnes(table):
            with op.batch_alter_table(table) as batch:
                batch.drop_column(nom)
