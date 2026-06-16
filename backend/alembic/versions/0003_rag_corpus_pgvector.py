"""RAG corpus : extension pgvector + table rag_chunks (embeddings + FTS français)

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-16

⚠️ NE PAS LANCER tant que le paquet pgvector n'est pas installé côté serveur
PostgreSQL (CREATE EXTENSION vector échoue sinon). Cf.
docs/rag/PHASE0-* : sur la DB locale (PG 16.14) 'vector' n'est pas encore
dans pg_available_extensions ; la prod doit être vérifiée séparément.

Crée le socle du corpus RAG réglementaire BTP :
  • extension `vector` (pgvector)
  • table `rag_chunks` : contenu + contexte + embedding vector(N) + FTS français
  • index HNSW (cosine) sur l'embedding + index GIN sur le tsvector
  • index btree de filtrage (domaine, source_document, date_publication)

Idempotent : IF NOT EXISTS partout → coexiste avec un éventuel state existant.
"""
from alembic import op
from sqlalchemy import inspect


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


# ⚠️ DIMENSION À CONFIRMER selon le modèle Voyage retenu :
#   - voyage-context-3 : 1024 (défaut) | 256 | 512 | 2048   ← recommandé (voir reco)
#   - voyage-law-2      : 1024 (fixe)
#   - voyage-3.5        : 1024 (défaut) | 256 | 512 | 2048
# pgvector indexe `vector` jusqu'à 2000 dims (au-delà : halfvec). 1024 = sûr + HNSW OK.
VECTOR_DIM = 1024


def _has_table(name: str) -> bool:
    return inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    # 1) Extension pgvector (nécessite le paquet serveur déjà installé).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 2) Table corpus RAG.
    if not _has_table("rag_chunks"):
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS rag_chunks (
                id                BIGSERIAL PRIMARY KEY,
                source_document   TEXT        NOT NULL,          -- ex: "CCAG-Travaux 2021", "CCP", "DTU 43.1"
                article_ref       TEXT,                          -- ex: "Art. 19.1" / section / numéro
                domaine           TEXT,                          -- ex: "marches-publics", "etancheite", "transversal"
                date_publication  DATE,                          -- date de publication/version du texte source
                version           TEXT,                          -- ex: "2021", "Ind. A", "rév. 3"
                contenu           TEXT        NOT NULL,           -- texte du chunk (verbatim source)
                contexte          TEXT,                          -- blurb de contextualisation (contextual retrieval)
                embedding         vector({VECTOR_DIM}),          -- ⚠️ dimension = modèle Voyage retenu
                metadonnees       JSONB       NOT NULL DEFAULT '{{}}'::jsonb,
                -- FTS français généré (contenu + contexte), pour la recherche hybride lexicale
                fts               tsvector GENERATED ALWAYS AS (
                                      to_tsvector(
                                        'french',
                                        coalesce(contenu, '') || ' ' || coalesce(contexte, '')
                                      )
                                  ) STORED,
                created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )

    # 3) Index vectoriel HNSW (cosine) — recherche sémantique.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding_hnsw
        ON rag_chunks USING hnsw (embedding vector_cosine_ops)
        """
    )

    # 4) Index GIN sur le tsvector — recherche plein-texte française (hybride).
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rag_chunks_fts ON rag_chunks USING gin (fts)"
    )

    # 5) Index btree de filtrage (pré-filtre avant ANN / FTS).
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_chunks_domaine ON rag_chunks (domaine)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_chunks_source ON rag_chunks (source_document)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_chunks_date ON rag_chunks (date_publication)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_date")
    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_source")
    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_domaine")
    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_fts")
    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_embedding_hnsw")
    op.execute("DROP TABLE IF EXISTS rag_chunks")
    # On NE drop PAS l'extension `vector` (peut servir à d'autres tables).
