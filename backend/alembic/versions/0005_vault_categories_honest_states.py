"""documents.category + statuts honnêtes unverified/unclassified

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-03 12:00:00

Coffre-fort — « valide » = document reconnu ET daté, jamais « fichier reçu » :
  • colonne documents.category (6 catégories + unclassified)
  • valeurs d'enum document_status étendues : unverified, unclassified
  • backfill honnête de l'existant :
      - type 'autre'                → status/category unclassified
      - type reconnu sans expiry    → status unverified
      - sinon                       → statut date inchangé, category mappée

Idempotent. Downgrade : retire la colonne et ramène les nouveaux statuts à
'valid' (état antérieur) ; sur PostgreSQL les valeurs d'enum ajoutées restent
en place (inoffensives — PG ne sait pas retirer une valeur d'enum).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

# Mapping type → catégorie (copie figée de services/vault_classifier.py au
# moment de la migration — une migration ne doit pas dépendre du code vivant).
_TYPE_TO_CATEGORY = {
    "urssaf": "attestations_sociales_fiscales",
    "fiscal": "attestations_sociales_fiscales",
    "pro_btp": "attestations_sociales_fiscales",
    "cibtp": "attestations_sociales_fiscales",
    "kbis": "documents_legaux",
    "rib": "documents_legaux",
    "pouvoir": "documents_legaux",
    "declaration_honneur": "documents_legaux",
    "dume": "documents_legaux",
    "decennale": "assurances",
    "rc_civile": "assurances",
    "trc": "assurances",
    "dommages_ouvrage": "assurances",
    "qualibat": "qualifications",
    "rge": "qualifications",
    "caces": "qualifications",
    "amiante_ss4": "qualifications",
    "chiffre_affaires": "references_moyens",
    "effectifs": "references_moyens",
    "organigramme_doc": "references_moyens",
    "attestation_travaux": "references_moyens",
}


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    # ── Nouvelles valeurs d'enum (PostgreSQL uniquement — SQLite = VARCHAR) ──
    if bind.dialect.name == "postgresql":
        for value in ("unverified", "unclassified"):
            op.execute(f"ALTER TYPE document_status ADD VALUE IF NOT EXISTS '{value}'")
        # ADD VALUE doit être commité avant d'être utilisable dans un UPDATE.
        op.execute("COMMIT")

    # ── Colonne category ─────────────────────────────────────────────────────
    if not _has_column("documents", "category"):
        op.add_column(
            "documents",
            sa.Column(
                "category", sa.String(40), nullable=False,
                server_default="unclassified",
            ),
        )
        op.create_index("ix_documents_category", "documents", ["category"])

    # ── Backfill honnête ─────────────────────────────────────────────────────
    documents = sa.table(
        "documents",
        sa.column("type", sa.String),
        sa.column("category", sa.String),
        sa.column("status", sa.String),
        sa.column("expiry_date", sa.Date),
    )
    for doc_type, category in _TYPE_TO_CATEGORY.items():
        op.execute(
            documents.update()
            .where(documents.c.type == doc_type)
            .values(category=category)
        )
    # Type non reconnu → unclassified (jamais de badge de validité)
    op.execute(
        documents.update()
        .where(documents.c.type == "autre")
        .values(category="unclassified", status="unclassified")
    )
    # Type reconnu mais aucune date → unverified (le « valid » d'avant mentait)
    op.execute(
        documents.update()
        .where(
            sa.and_(
                documents.c.type != "autre",
                documents.c.expiry_date.is_(None),
                documents.c.status == "valid",
            )
        )
        .values(status="unverified")
    )


def downgrade() -> None:
    documents = sa.table(
        "documents",
        sa.column("status", sa.String),
    )
    # Retour à l'ancien contrat (sans date = valid) — les valeurs d'enum PG
    # ajoutées restent définies mais inutilisées.
    op.execute(
        documents.update()
        .where(documents.c.status.in_(["unverified", "unclassified"]))
        .values(status="valid")
    )
    if _has_column("documents", "category"):
        op.drop_index("ix_documents_category", table_name="documents")
        op.drop_column("documents", "category")
