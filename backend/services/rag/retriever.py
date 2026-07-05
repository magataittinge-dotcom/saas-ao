"""
Retriever hybride du corpus réglementaire (Lot 7, TASKS RAG item 6).

Pipeline : dense (pgvector cosine, index HNSW) + FTS français
(websearch_to_tsquery sur le tsvector généré) → fusion RRF (k=60) →
rerank Voyage (rerank-2.5) → top 5 {article_ref, contenu, contexte, score}.

Robustesse : le rerank est un raffinement — s'il est indisponible (quota
Voyage), on retombe sur l'ordre RRF, jamais d'erreur utilisateur.
Latence loggée à chaque appel.
"""
import logging
import time
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

RERANK_URL = "https://api.voyageai.com/v1/rerank"
RERANK_MODEL = "rerank-2.5"
_CANDIDATES_PER_SOURCE = 20  # profondeur dense / FTS avant fusion
_RRF_K = 60


# ─── Fusion RRF ──────────────────────────────────────────────────────────────

def rrf_fuse(
    ranked_lists: Sequence[Sequence[str]],
    k: int = _RRF_K,
    weights: Optional[Sequence[float]] = None,
) -> List[Tuple[str, float]]:
    """Reciprocal Rank Fusion pondérée : score(doc) = Σ w·1/(k + rang).
    Décroissant. Poids par défaut : 1.0 partout."""
    if weights is None:
        weights = [1.0] * len(ranked_lists)
    scores: Dict[str, float] = {}
    for ranked, weight in zip(ranked_lists, weights):
        for rank, ref in enumerate(ranked, start=1):
            scores[ref] = scores.get(ref, 0.0) + weight / (k + rank)
    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)


# ─── Sous-requêtes (isolées pour les tests) ──────────────────────────────────

def _embed_query(query: str) -> List[float]:
    from services.rag.embedder import _post_voyage, MODEL, OUTPUT_DIM
    return _post_voyage({
        "inputs": [[query]],
        "model": MODEL,
        "input_type": "query",
        "output_dimension": OUTPUT_DIM,
    })[0]


def _dense_search(db: Session, vector: List[float], limit: int) -> List[str]:
    rows = db.execute(sql_text(
        "SELECT article_ref FROM rag_chunks "
        "ORDER BY embedding <=> CAST(:vec AS vector) LIMIT :lim"
    ), {"vec": str(vector), "lim": limit}).fetchall()
    return [r[0] for r in rows]


def _fts_search(db: Session, query: str, limit: int) -> List[str]:
    rows = db.execute(sql_text(
        "SELECT article_ref FROM rag_chunks "
        "WHERE fts @@ websearch_to_tsquery('french', :q) "
        "ORDER BY ts_rank(fts, websearch_to_tsquery('french', :q)) DESC "
        "LIMIT :lim"
    ), {"q": query, "lim": limit}).fetchall()
    return [r[0] for r in rows]


def _fetch_chunks(db: Session, refs: List[str]) -> List[dict]:
    if not refs:
        return []
    rows = db.execute(sql_text(
        "SELECT article_ref, contenu, contexte FROM rag_chunks "
        "WHERE article_ref = ANY(:refs)"
    ), {"refs": refs}).fetchall()
    by_ref = {r[0]: {"article_ref": r[0], "contenu": r[1], "contexte": r[2]} for r in rows}
    return [by_ref[r] for r in refs if r in by_ref]


def _rerank(query: str, documents: List[str], top_k: int) -> Tuple[List[int], List[float]]:
    """Rerank Voyage → (indices dans l'ordre final, scores). Backoff 429."""
    import httpx
    from config import get_settings

    api_key = get_settings().VOYAGE_API_KEY
    if not api_key:
        raise RuntimeError("VOYAGE_API_KEY absente")

    for attempt in range(4):
        resp = httpx.post(
            RERANK_URL,
            json={"query": query, "documents": documents,
                  "model": RERANK_MODEL, "top_k": top_k},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )
        if resp.status_code == 429:
            wait = 10 * (attempt + 1)
            logger.info("Voyage rerank 429 — attente %ds", wait)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        results = resp.json()["data"]
        return ([r["index"] for r in results],
                [float(r["relevance_score"]) for r in results])
    raise RuntimeError("Voyage rerank : rate limit persistant")


# ─── Pipeline ────────────────────────────────────────────────────────────────

def retrieve(db: Optional[Session], query: str, top_k: int = 5) -> List[dict]:
    """Recherche hybride → top_k chunks {article_ref, contenu, contexte, score}."""
    t0 = time.monotonic()

    dense_refs = _dense_search(db, _embed_query(query), _CANDIDATES_PER_SOURCE)
    fts_refs = _fts_search(db, query, _CANDIDATES_PER_SOURCE)
    # FTS pondéré 0.5 : websearch AND est bruyant sur les requêtes longues
    fused = rrf_fuse([dense_refs, fts_refs], weights=[1.0, 0.5])

    candidates = _fetch_chunks(db, [ref for ref, _ in fused[:top_k * 3]])
    if not candidates:
        logger.info("retrieve(%r) : 0 résultat, latence=%.2fs", query, time.monotonic() - t0)
        return []

    rrf_by_ref = dict(fused)
    try:
        docs = [
            (f"{c['contexte']}\n\n{c['contenu']}" if c["contexte"] else c["contenu"])
            for c in candidates
        ]
        order, scores = _rerank(query, docs, top_k=min(top_k, len(candidates)))
        results = [{**candidates[i], "score": s} for i, s in zip(order, scores)]
    except Exception as e:
        # Rerank = raffinement : l'ordre RRF reste un bon résultat.
        logger.warning("retrieve : rerank indisponible (%s) — fallback ordre RRF", e)
        results = [
            {**c, "score": rrf_by_ref.get(c["article_ref"], 0.0)}
            for c in candidates[:top_k]
        ]

    logger.info("retrieve(%r) : %d résultats, latence=%.2fs",
                query, len(results), time.monotonic() - t0)
    return results
