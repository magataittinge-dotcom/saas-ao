"""
Enrichissement réglementaire de la génération mémoire (Lot 7 T3, BONUS).

Actif UNIQUEMENT si RAG_ENRICHMENT=true (env, défaut false) : les exigences
du lot alimentent une recherche hybride (retrieve top-3) et les articles
retrouvés sont injectés au prompt de génération avec une consigne stricte :
citer uniquement ces articles, référence exacte, jamais inventer.

Fail-safe : toute erreur (quota Voyage, corpus absent) → None — la
génération n'est JAMAIS bloquée par l'enrichissement. Coût loggé
(latence retrieve + volume injecté).
"""
import logging
import time
from typing import List, Optional

from services.rag.retriever import retrieve

logger = logging.getLogger(__name__)

_MAX_QUERY_CHARS = 400
_MAX_CHUNK_CHARS = 1200

_CONSIGNE = (
    "CONSIGNE RÉGLEMENTAIRE STRICTE : si tu cites la réglementation, cite "
    "UNIQUEMENT les articles ci-dessous, avec leur référence exacte "
    "(ex. R2191-32 du Code de la commande publique). N'invente JAMAIS "
    "d'article, de numéro ou de contenu réglementaire."
)


def build_reglementaire_block(db, compliance_items: List, top_k: int = 3) -> Optional[str]:
    """Exigences du lot → retrieve top-k → bloc prompt, ou None (fail-safe)."""
    if not compliance_items:
        return None

    # Requête = premières exigences administratives/candidature (les plus
    # réglementaires), sinon premières exigences tout court.
    admin = [i for i in compliance_items
             if getattr(i, "category", "") in ("candidature", "offre")]
    seeds = (admin or list(compliance_items))[:3]
    query = " ; ".join(i.exigence_text for i in seeds)[:_MAX_QUERY_CHARS]
    if not query.strip():
        return None

    t0 = time.monotonic()
    try:
        chunks = retrieve(db, query, top_k=top_k)
    except Exception as e:
        logger.warning("enrichment : retrieve indisponible (%s) — génération sans bloc", e)
        return None
    if not chunks:
        return None

    lines = [_CONSIGNE, ""]
    for c in chunks:
        entete = f"[{c['article_ref']}]"
        if c.get("contexte"):
            entete += f" {c['contexte']}"
        lines.append(f"{entete}\n{c['contenu'][:_MAX_CHUNK_CHARS]}")

    block = "\n\n".join(lines)
    logger.info(
        "enrichment : %d articles injectés (%d caractères ≈ %d tokens), "
        "latence retrieve=%.2fs",
        len(chunks), len(block), len(block) // 4, time.monotonic() - t0,
    )
    return block
