"""Index unique (source_document, article_ref, version) sur rag_chunks —
support de l'upsert idempotent de l'ingestion corpus (ré-ingestion = update,
jamais de doublon). Partiel : uniquement quand article_ref est renseigné.

Revision ID: 0017
Revises: 0016
"""
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # rag_chunks n'existe que sur Postgres (0003)
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_rag_chunks_source_article_version
        ON rag_chunks (source_document, article_ref, version)
        WHERE article_ref IS NOT NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP INDEX IF EXISTS ux_rag_chunks_source_article_version")
