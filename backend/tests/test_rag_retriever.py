"""
Tests Lot 7 T1 — retriever hybride (dense + FTS → RRF → rerank Voyage).

Unitaires (mocks — pas de réseau ni de Postgres) :
  • fusion RRF k=60 : un doc bien classé dans LES DEUX listes bat un doc
    premier d'une seule liste ; les scores sont décroissants.
  • orchestration : dense + FTS interrogés, candidats RRF passés au rerank,
    top 5 final dans l'ordre du reranker, latence loggée.
  • endpoint GET /api/rag/retrieve : auth requise, q vide → 422, réponse
    structurée {article_ref, contenu, contexte, score}.

La preuve réelle (« retenue de garantie » → R2191-32, hybride ≥ dense)
tourne contre le Postgres dev — rapportée au terminal, cf. golden set T2.
"""
import pytest


# ─── Fusion RRF ──────────────────────────────────────────────────────────────

def test_rrf_rewards_presence_in_both_lists():
    from services.rag.retriever import rrf_fuse

    dense = ["A", "B", "C", "D"]
    fts = ["B", "E", "A", "F"]
    fused = rrf_fuse([dense, fts], k=60)

    refs = [ref for ref, _ in fused]
    # B (2e + 1er) et A (1er + 3e) devant les présents d'une seule liste
    assert set(refs[:2]) == {"A", "B"}
    scores = [s for _, s in fused]
    assert scores == sorted(scores, reverse=True)
    # Doc d'une seule liste : score = 1/(60+rang)
    assert dict(fused)["E"] == pytest.approx(1 / 62)


def test_rrf_empty_lists():
    from services.rag.retriever import rrf_fuse
    assert rrf_fuse([[], []], k=60) == []


def test_rrf_weights_favor_dense():
    """Le FTS français (websearch AND) est bruyant sur les requêtes longues :
    pondéré 0.5, un doc FTS-only 1er ne doit plus battre un doc dense 8e."""
    from services.rag.retriever import rrf_fuse

    dense = [f"D{i}" for i in range(1, 9)] + ["CIBLE"]   # CIBLE 9e en dense
    fts = ["BRUIT1", "BRUIT2", "BRUIT3"]                   # absents du dense
    fused = dict(rrf_fuse([dense, fts], k=60, weights=[1.0, 0.5]))
    assert fused["CIBLE"] > fused["BRUIT1"]                # 1/69 > 0.5/61


# ─── Orchestration (mocks) ───────────────────────────────────────────────────

@pytest.fixture
def fake_db(monkeypatch):
    import services.rag.retriever as ret

    chunks = {
        "R2191-32": "La retenue de garantie a pour seul objet...",
        "R2191-33": "Le montant de la retenue de garantie...",
        "L2141-1": "Sont exclues de la procédure...",
        "R2192-10": "Le délai de paiement...",
    }
    monkeypatch.setattr(ret, "_dense_search",
                        lambda db, vec, limit: ["R2191-32", "R2191-33", "L2141-1"])
    monkeypatch.setattr(ret, "_fts_search",
                        lambda db, q, limit: ["R2191-33", "R2192-10", "R2191-32"])
    monkeypatch.setattr(ret, "_embed_query", lambda q: [0.1] * 1024)
    monkeypatch.setattr(ret, "_fetch_chunks", lambda db, refs: [
        {"article_ref": r, "contenu": chunks[r], "contexte": f"ctx {r}"}
        for r in refs if r in chunks
    ])
    return chunks


def test_retrieve_pipeline_order_from_reranker(fake_db, monkeypatch, caplog):
    import services.rag.retriever as ret

    def fake_rerank(query, documents, top_k):
        # Le reranker inverse volontairement l'ordre RRF → l'ordre FINAL
        # doit venir du reranker.
        return list(reversed(range(len(documents))))[:top_k], [0.9, 0.5, 0.3, 0.1][:top_k]

    monkeypatch.setattr(ret, "_rerank", fake_rerank)

    with caplog.at_level("INFO"):
        results = ret.retrieve(None, "retenue de garantie", top_k=3)

    assert len(results) == 3
    assert all({"article_ref", "contenu", "contexte", "score"} <= r.keys() for r in results)
    assert results[0]["score"] == 0.9
    assert any("latence" in r.message.lower() for r in caplog.records)


def test_retrieve_survives_rerank_failure(fake_db, monkeypatch):
    """Rerank indisponible (429 persistant) → fallback ordre RRF, jamais 500."""
    import services.rag.retriever as ret

    def broken(*a, **k):
        raise RuntimeError("Voyage : rate limit persistant")
    monkeypatch.setattr(ret, "_rerank", broken)

    results = ret.retrieve(None, "retenue de garantie", top_k=3)
    assert len(results) == 3
    # Ordre RRF conservé : R2191-32 et R2191-33 (présents 2 fois) devant
    assert {results[0]["article_ref"], results[1]["article_ref"]} == {"R2191-32", "R2191-33"}


# ─── Endpoint ────────────────────────────────────────────────────────────────

def test_endpoint_requires_query(client, db_session, test_org):
    assert client.get("/api/rag/retrieve").status_code == 422
    assert client.get("/api/rag/retrieve?q=").status_code == 422


def test_endpoint_returns_results(client, db_session, test_org, monkeypatch):
    import routers.rag as rag_router

    monkeypatch.setattr(rag_router, "retrieve", lambda db, q, top_k=5: [
        {"article_ref": "R2191-32", "contenu": "...", "contexte": "...", "score": 0.91},
    ])
    resp = client.get("/api/rag/retrieve?q=retenue de garantie")
    assert resp.status_code == 200
    body = resp.json()
    assert body["results"][0]["article_ref"] == "R2191-32"
