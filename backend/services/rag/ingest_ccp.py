"""
Ingestion du Code de la commande publique dans rag_chunks (Phase 1, tranche 1).

Pipeline : loader (articles) → contextualisation Haiku batchée →
embeddings voyage-context-3 → UPSERT idempotent (ON CONFLICT sur
(source_document, article_ref, version), index unique de la migration 0017).

Ré-ingestion = mise à jour des mêmes lignes, jamais de doublon.
"""
import logging
from pathlib import Path
from typing import List

from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from services.rag.ccp_loader import extract_edition_date, load_ccp_articles
from services.rag.contextualizer import contextualize_articles
from services.rag.embedder import embed_chunks

logger = logging.getLogger(__name__)

SOURCE_DOCUMENT = "Code de la commande publique"
DOMAINE = "marches-publics"

# Upsert SANS toucher l'embedding : un embedding déjà calculé survit à la
# ré-ingestion (recalculé uniquement si le contenu/contexte a changé).
_UPSERT_SQL = sql_text("""
    INSERT INTO rag_chunks
        (source_document, article_ref, domaine, date_publication, version,
         contenu, contexte, metadonnees)
    VALUES
        (:source_document, :article_ref, :domaine, :date_publication, :version,
         :contenu, :contexte, CAST(:metadonnees AS jsonb))
    ON CONFLICT (source_document, article_ref, version)
        WHERE article_ref IS NOT NULL
    DO UPDATE SET
        embedding = CASE
            WHEN rag_chunks.contenu IS DISTINCT FROM EXCLUDED.contenu
              OR rag_chunks.contexte IS DISTINCT FROM EXCLUDED.contexte
            THEN NULL ELSE rag_chunks.embedding END,
        contenu = EXCLUDED.contenu,
        contexte = EXCLUDED.contexte,
        metadonnees = EXCLUDED.metadonnees,
        date_publication = EXCLUDED.date_publication
""")


def dedupe_articles(articles: List[dict]) -> List[dict]:
    """Dédoublonnage interne par ref — le dernier rencontré gagne (le PDF
    répète parfois un article en marge de section)."""
    by_ref = {a["ref"]: a for a in articles}
    return list(by_ref.values())


def ingest_ccp(db: Session, pdf_path: Path, skip_context: bool = False) -> dict:
    """Ingestion complète. Retourne {articles, contextes, version}."""
    version = extract_edition_date(pdf_path) or "inconnue"
    articles = dedupe_articles(load_ccp_articles(pdf_path))
    logger.info("ingest_ccp : %d articles (édition %s)", len(articles), version)

    # Ré-ingestion économe : les contextes déjà en base (même source+version)
    # sont réutilisés — Haiku n'est appelé que pour les articles nouveaux.
    existing = dict(db.execute(sql_text(
        "SELECT article_ref, contexte FROM rag_chunks "
        "WHERE source_document = :src AND version = :v AND contexte IS NOT NULL"
    ), {"src": SOURCE_DOCUMENT, "v": version}).fetchall())
    if existing:
        logger.info("ingest_ccp : %d contextes réutilisés depuis la base", len(existing))

    missing = [a for a in articles if a["ref"] not in existing]
    contexts = dict(existing)
    if missing and not skip_context:
        contexts.update(contextualize_articles(missing))

    # Phase A — persistance IMMÉDIATE contenu+contexte (reprenable : un
    # échec d'embedding ne perd ni le parsing ni le coût Haiku).
    import json
    for art in articles:
        db.execute(_UPSERT_SQL, {
            "source_document": SOURCE_DOCUMENT,
            "article_ref": art["ref"],
            "domaine": DOMAINE,
            "date_publication": version if version != "inconnue" else None,
            "version": version,
            "contenu": art["texte"],
            "contexte": contexts.get(art["ref"]),
            "metadonnees": json.dumps({"hierarchie": art["hierarchie"]}),
        })
    # Purge des refs qui ne sont plus dans le corpus (ex. pollutions d'une
    # ingestion antérieure, articles abrogés d'une nouvelle édition).
    purged = db.execute(sql_text(
        "DELETE FROM rag_chunks WHERE source_document = :src AND version = :v "
        "AND article_ref != ALL(:refs)"
    ), {"src": SOURCE_DOCUMENT, "v": version,
        "refs": [a["ref"] for a in articles]}).rowcount
    db.commit()
    logger.info("ingest_ccp : %d chunks upsertés (%d avec contexte), %d orphelins purgés",
                len(articles), len(contexts), purged)

    # Phase B — embeddings des chunks qui n'en ont pas encore, par lots
    # committés au fil de l'eau (reprise possible après rate limit).
    embedded = _embed_missing(db, version)

    logger.info("ingest_ccp : terminé — %d articles, %d embeddings calculés, version %s",
                len(articles), embedded, version)
    return {"articles": len(articles), "contextes": len(contexts),
            "embedded": embedded, "version": version}


_EMBED_BATCH = 100  # chunks par transaction (≈ 2-3 requêtes Voyage)


def _embed_missing(db: Session, version: str) -> int:
    """Calcule l'embedding (contexte + contenu) des chunks où il manque."""
    rows = db.execute(sql_text(
        "SELECT id, contenu, contexte FROM rag_chunks "
        "WHERE source_document = :src AND version = :v AND embedding IS NULL "
        "ORDER BY id"
    ), {"src": SOURCE_DOCUMENT, "v": version}).fetchall()
    if not rows:
        logger.info("ingest_ccp : aucun embedding manquant")
        return 0
    logger.info("ingest_ccp : %d embeddings à calculer", len(rows))

    done = 0
    for i in range(0, len(rows), _EMBED_BATCH):
        batch = rows[i:i + _EMBED_BATCH]
        texts = [
            (f"{r.contexte}\n\n{r.contenu}" if r.contexte else r.contenu)
            for r in batch
        ]
        vectors = embed_chunks(texts)
        for row, vector in zip(batch, vectors):
            db.execute(sql_text(
                "UPDATE rag_chunks SET embedding = :emb WHERE id = :id"
            ), {"emb": str(vector), "id": row.id})
        db.commit()  # commit par lot → reprenable
        done += len(batch)
        logger.info("ingest_ccp : embeddings %d/%d", done, len(rows))
    return done
