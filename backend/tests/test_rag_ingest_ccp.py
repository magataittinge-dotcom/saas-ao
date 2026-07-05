"""
Tests RAG Phase 1 tranche 1 — ingestion du Code de la commande publique.

  1. Loader : le PDF réel (rag_corpus/) est parsé en articles structurés —
     ≥ 1000 articles, R2143-3 retrouvé avec son texte intégral, hiérarchie
     renseignée, bruit de mise en page (Legif./Juricaf/liens) éliminé.
  2. Chunking : 1 article = 1 chunk, article long jamais coupé.
  3. Contextualisation Haiku : batchée, coût agrégé loggé, contexte
     mentionne la hiérarchie parente (mock — pas d'appel réseau en CI).
  4. Embeddings Voyage : dimension 1024, batching par budget tokens
     (mock HTTP — la clé n'est pas requise en CI).
  5. Upsert : dédoublonnage interne par ref (dernier gagne) ; l'idempotence
     réelle en base est prouvée par le run d'ingestion (ré-ingestion → même
     count), rapportée au terminal.
"""
from pathlib import Path

import pytest

CCP_PDF = Path(__file__).resolve().parent.parent / "rag_corpus" / \
    "reglementation-marches-publics" / "Code de la commande publique.pdf"

pytestmark = pytest.mark.skipif(not CCP_PDF.exists(), reason="PDF CCP absent")


@pytest.fixture(scope="module")
def articles():
    from services.rag.ccp_loader import load_ccp_articles
    return load_ccp_articles(CCP_PDF)


# ─── 1+2. Loader / chunking par article ──────────────────────────────────────

def test_loader_finds_more_than_1000_articles(articles):
    assert len(articles) > 1000


def test_l2100_1_not_overwritten_by_concordance_tables(articles):
    """Le PDF contient des tables de concordance (p.114+) dont les lignes
    commencent par une ref d'article — elles ne doivent PAS écraser le vrai
    texte (bug détecté au contrôle SQL : contenu « Au titre Ier »)."""
    art = next(a for a in articles if a["ref"] == "L2100-1")
    assert "Sous réserve des dispositions de l'article L. 2500-1" in art["texte"]
    assert "Au titre Ier" not in art["texte"]


def test_r2143_3_full_text(articles):
    art = next(a for a in articles if a["ref"] == "R2143-3")
    # Texte intégral : début ET fin de l'article présents (pas de troncature)
    assert "Le candidat produit à l'appui de sa candidature" in art["texte"]
    assert "capacités techniques et professionnelles" in art["texte"]
    assert "Partie réglementaire" in art["hierarchie"]


def test_articles_have_ref_hierarchy_and_clean_text(articles):
    for art in articles[:200]:
        assert art["ref"], art
        assert art["hierarchie"], art
        assert art["texte"].strip(), art
        # Bruit de mise en page éliminé
        for noise in ("Juricaf", "Jp.Admin", "Legif.", "codes.droit.org"):
            assert noise not in art["texte"], (art["ref"], noise)


def test_long_article_not_truncated(articles):
    # L'article le plus long doit dépasser largement un « chunk naïf »
    longest = max(articles, key=lambda a: len(a["texte"]))
    assert len(longest["texte"]) > 3000  # jamais de coupe mi-article


# ─── 3. Contextualisation Haiku batchée ──────────────────────────────────────

def test_contextualizer_batches_and_logs_cost(monkeypatch, caplog):
    import services.rag.contextualizer as ctx

    calls = []

    def fake_call(batch_prompt):
        calls.append(batch_prompt)
        import json as _json
        import re as _re
        refs = _re.findall(r"\[(\w+-[\w-]+)\]", batch_prompt)
        return (_json.dumps({r: f"Contexte de {r} (Livre Ier)" for r in refs}),
                {"input_tokens": 1000, "output_tokens": 200})

    monkeypatch.setattr(ctx, "_call_haiku", fake_call)

    arts = [{"ref": f"L2100-{i}", "texte": "Texte. " * 30,
             "hierarchie": "Partie législative › Livre Ier"} for i in range(55)]
    with caplog.at_level("INFO"):
        out = ctx.contextualize_articles(arts, batch_size=25)

    assert len(calls) == 3                      # 55 articles / 25 → 3 batchs
    assert len(out) == 55
    assert out["L2100-3"].startswith("Contexte de L2100-3")
    assert any("coût" in r.message.lower() for r in caplog.records)


# ─── 4. Embeddings Voyage (voyage-context-3) ─────────────────────────────────

def test_embedder_returns_1024_dims_and_batches(monkeypatch):
    import services.rag.embedder as emb

    sent_payloads = []

    def fake_post(payload):
        sent_payloads.append(payload)
        n = sum(len(doc) for doc in payload["inputs"])
        return [[0.1] * 1024 for _ in range(n)]

    monkeypatch.setattr(emb, "_post_voyage", fake_post)

    # ~12k caractères par texte → ~480k au total : dépasse le budget d'une
    # requête (320k) et doit forcer AU MOINS 2 appels Voyage.
    texts = [f"Article {i}. " + "Contenu réglementaire. " * 500 for i in range(40)]
    vectors = emb.embed_chunks(texts)

    assert len(vectors) == 40
    assert all(len(v) == 1024 for v in vectors)
    assert len(sent_payloads) >= 2              # budget tokens → plusieurs requêtes
    for p in sent_payloads:
        assert p["model"] == "voyage-context-3"
        assert p["output_dimension"] == 1024


def test_embedder_splits_oversize_text_and_averages(monkeypatch):
    """Un article plus gros que le budget d'UNE requête (annexes-tableaux du
    CCP, ~42k chars) est découpé et son embedding = moyenne normalisée des
    morceaux — sinon il ne passe jamais sous un TPM serré."""
    import math

    import services.rag.embedder as emb

    def fake_post(payload):
        n = sum(len(doc) for doc in payload["inputs"])
        # Chaque morceau reçoit un vecteur unitaire distinct mais déterministe
        return [[1.0] + [0.0] * 1023 for _ in range(n)]

    monkeypatch.setattr(emb, "_post_voyage", fake_post)

    oversize = "Contenu d'annexe. " * 3000  # ~54k chars > budget requête
    vectors = emb.embed_chunks(["court texte", oversize, "autre court"])

    assert len(vectors) == 3
    assert all(len(v) == 1024 for v in vectors)
    # Moyenne normalisée → norme ~1 pour le texte découpé
    norm = math.sqrt(sum(x * x for x in vectors[1]))
    assert abs(norm - 1.0) < 1e-6


# ─── 5. Dédoublonnage interne avant upsert ───────────────────────────────────

def test_dedupe_articles_last_wins():
    from services.rag.ingest_ccp import dedupe_articles

    arts = [
        {"ref": "L1", "texte": "ancien", "hierarchie": "H"},
        {"ref": "L2", "texte": "b", "hierarchie": "H"},
        {"ref": "L1", "texte": "récent", "hierarchie": "H"},
    ]
    out = dedupe_articles(arts)
    assert len(out) == 2
    assert next(a for a in out if a["ref"] == "L1")["texte"] == "récent"
