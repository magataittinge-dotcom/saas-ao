"""
Contextualisation des chunks (contextual retrieval) — Haiku 4.5, BATCHÉE.

Chaque article reçoit un contexte court (1-2 lignes) qui situe l'article
dans sa hiérarchie (partie/livre/titre) et résume son objet — stocké dans
`rag_chunks.contexte`, concaténé au contenu pour le FTS et l'embedding.

Batché : N articles par appel (réponse JSON ref → contexte) pour limiter
le nombre d'appels. Coût agrégé loggé (Haiku ≈ 1 $/M in, 5 $/M out).
"""
import json
import logging
import re
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"
_PRICE_IN = 1.00   # USD / Mtok
_PRICE_OUT = 5.00

_SYSTEM = """Tu contextualises des articles du Code de la commande publique pour un moteur de recherche.

Pour CHAQUE article fourni (identifié par [REF]), écris un contexte de 1 à 2 lignes qui :
- situe l'article dans sa hiérarchie (partie, livre, thème parent fournis),
- résume son objet en langage clair (de quoi il traite, pour qui).
Tu ne recopies pas l'article, tu ne cites pas d'autres articles, tu n'inventes rien.

Réponds UNIQUEMENT avec un objet JSON : {"REF": "contexte", ...} — une entrée par article fourni."""


def _call_haiku(batch_prompt: str) -> Tuple[str, dict]:
    """Un appel Haiku — isolé pour les tests. Retourne (texte, usage)."""
    import anthropic
    from config import get_settings

    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=_MODEL,
        max_tokens=4000,
        system=_SYSTEM,
        messages=[{"role": "user", "content": batch_prompt}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    usage = getattr(response, "usage", None)
    return raw, {
        "input_tokens": getattr(usage, "input_tokens", 0) if usage else 0,
        "output_tokens": getattr(usage, "output_tokens", 0) if usage else 0,
    }


def _build_batch_prompt(batch: List[dict]) -> str:
    parts = []
    for art in batch:
        # 1200 caractères suffisent à cerner l'objet d'un article
        excerpt = art["texte"][:1200]
        parts.append(f"[{art['ref']}] (hiérarchie : {art['hierarchie']})\n{excerpt}")
    return "Articles à contextualiser :\n\n" + "\n\n---\n\n".join(parts)


def contextualize_articles(articles: List[dict], batch_size: int = 25) -> Dict[str, str]:
    """→ {ref: contexte}. Les refs sans réponse exploitable sont omises
    (le chunk reste indexé sans contexte — jamais de contexte inventé)."""
    contexts: Dict[str, str] = {}
    total_in = total_out = 0

    for i in range(0, len(articles), batch_size):
        batch = articles[i:i + batch_size]
        raw, usage = _call_haiku(_build_batch_prompt(batch))
        total_in += usage["input_tokens"]
        total_out += usage["output_tokens"]

        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.warning("contextualizer : batch %d sans JSON exploitable", i // batch_size)
            continue
        try:
            from json_repair import repair_json
            parsed = json.loads(repair_json(m.group(0)))
        except Exception as e:
            logger.warning("contextualizer : batch %d JSON invalide (%s)", i // batch_size, e)
            continue

        batch_refs = {a["ref"] for a in batch}
        for ref, ctx in parsed.items():
            if ref in batch_refs and isinstance(ctx, str) and ctx.strip():
                contexts[ref] = ctx.strip()

    cost = total_in / 1e6 * _PRICE_IN + total_out / 1e6 * _PRICE_OUT
    logger.info(
        "contextualizer : %d/%d contextes, in=%d out=%d tokens, coût=%.4f USD",
        len(contexts), len(articles), total_in, total_out, cost,
    )
    return contexts
