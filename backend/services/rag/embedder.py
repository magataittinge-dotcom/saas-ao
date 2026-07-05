"""
Embeddings Voyage — voyage-context-3 (contextualized chunk embeddings).

Endpoint : POST https://api.voyageai.com/v1/contextualizedembeddings
Chaque requête porte des « documents » = listes de chunks voisins (le modèle
contextualise chaque chunk par ses voisins). Dimension : 1024 (= VECTOR_DIM
de la migration 0003). Batching par budget de tokens (~4 caractères/token,
budget prudent sous la limite API de 120k tokens/requête).

VOYAGE_API_KEY en variable d'environnement uniquement.
"""
import logging
import time
from typing import List

logger = logging.getLogger(__name__)

VOYAGE_URL = "https://api.voyageai.com/v1/contextualizedembeddings"
MODEL = "voyage-context-3"
OUTPUT_DIM = 1024

# Budget prudent par requête (~4 chars/token). Volontairement très bas :
# les clés Voyage en tier gratuit sont limitées à ~10k tokens/min — de
# petites requêtes + backoff patient passent partout.
_MAX_CHARS_PER_REQUEST = 12_000
# Taille max d'un « document » (groupe de chunks contextualisés ensemble)
_CHUNKS_PER_DOC = 16


def _post_voyage(payload: dict) -> List[List[float]]:
    """Un POST Voyage — isolé pour les tests. Retourne les embeddings à plat."""
    import httpx
    from config import get_settings

    api_key = get_settings().VOYAGE_API_KEY
    if not api_key:
        raise RuntimeError("VOYAGE_API_KEY absente de l'environnement")

    for attempt in range(8):
        resp = httpx.post(
            VOYAGE_URL,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=120,
        )
        if resp.status_code == 429:
            # Tier gratuit : ~3 requêtes/min → backoff patient obligatoire.
            wait = min(15 * (attempt + 1), 60)
            logger.info("Voyage 429 — attente %ds (tentative %d/8)", wait, attempt + 1)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()["data"]
        flat: List[List[float]] = []
        for doc in data:
            for item in doc["data"]:
                flat.append(item["embedding"])
        return flat
    raise RuntimeError("Voyage : rate limit persistant après 8 tentatives")


def _mean_normalized(vectors: List[List[float]]) -> List[float]:
    """Moyenne normalisée (norme 1) — représentation d'un texte découpé."""
    import math
    n = len(vectors)
    mean = [sum(v[i] for v in vectors) / n for i in range(len(vectors[0]))]
    norm = math.sqrt(sum(x * x for x in mean)) or 1.0
    return [x / norm for x in mean]


def embed_chunks(texts: List[str]) -> List[List[float]]:
    """Embeddings (dimension 1024) pour chaque texte, ordre préservé.

    Un texte plus gros que le budget d'UNE requête (annexes-tableaux du CCP)
    est découpé en morceaux embeddés séparément ; son embedding final est la
    moyenne normalisée des morceaux (sinon il ne passe jamais sous un TPM
    serré — et dépasserait de toute façon le contexte du modèle à terme)."""
    pieces: List[str] = []
    spans: List[tuple] = []  # (début, fin) des morceaux de chaque texte
    for text in texts:
        start = len(pieces)
        if len(text) > _MAX_CHARS_PER_REQUEST:
            for i in range(0, len(text), _MAX_CHARS_PER_REQUEST):
                pieces.append(text[i:i + _MAX_CHARS_PER_REQUEST])
        else:
            pieces.append(text)
        spans.append((start, len(pieces)))

    piece_vectors = _embed_pieces(pieces)

    return [
        piece_vectors[a] if b - a == 1 else _mean_normalized(piece_vectors[a:b])
        for a, b in spans
    ]


def _embed_pieces(texts: List[str]) -> List[List[float]]:
    vectors: List[List[float]] = []
    batch_docs: List[List[str]] = []
    batch_chars = 0

    def flush():
        nonlocal batch_docs, batch_chars
        if not batch_docs:
            return
        got = _post_voyage({
            "inputs": batch_docs,
            "model": MODEL,
            "input_type": "document",
            "output_dimension": OUTPUT_DIM,
        })
        vectors.extend(got)
        batch_docs, batch_chars = [], 0

    current_doc: List[str] = []
    for text in texts:
        if len(current_doc) >= _CHUNKS_PER_DOC:
            batch_docs.append(current_doc)
            current_doc = []
        if batch_chars + len(text) > _MAX_CHARS_PER_REQUEST and (batch_docs or current_doc):
            if current_doc:
                batch_docs.append(current_doc)
                current_doc = []
            flush()
        current_doc.append(text)
        batch_chars += len(text)
    if current_doc:
        batch_docs.append(current_doc)
    flush()

    if len(vectors) != len(texts):
        raise RuntimeError(
            f"Voyage : {len(vectors)} embeddings pour {len(texts)} chunks"
        )
    return vectors
