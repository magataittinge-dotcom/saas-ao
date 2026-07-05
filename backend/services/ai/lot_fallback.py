"""
Filet IA de détection des lots (C4) — UN SEUL appel Sonnet, sur échec objectif.

La détection reste 100 % déterministe (lot_detector). Le filet ne se déclenche
STRICTEMENT que si la détection a objectivement échoué :
  • zéro lot détecté alors que le DCE mentionne un allotissement, OU
  • écart entre lots détectés et nombre annoncé dans le RC (lots_announced), OU
  • lot sans libellé (nom vide ou générique « Lot N »).
Sinon : ZÉRO appel IA.

Le filet reçoit des EXTRAITS pertinents (passages autour des mentions de lots),
jamais le DCE entier. Les lots ajoutés/complétés portent source "ia_fallback".
Invariant de sortie : jamais de lot sans libellé (anomalie loggée, pas affichée).
"""
import json
import logging
import re
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_MODEL = "claude-sonnet-4-6"
_MAX_EXCERPT_CHARS = 12_000
_EXCERPT_CONTEXT_LINES = 3
_IA_CONFIDENCE = 60  # < barème regex tabulaire (90) — badge distinct côté UI

_GENERIC_LABEL = re.compile(r'^lot\s*n?°?\s*[\dA-Za-z]{1,3}\s*$', re.IGNORECASE)

_SYSTEM_PROMPT = """Tu es un expert des marchés publics BTP. On te donne des extraits \
du règlement de consultation d'un DCE ainsi que la liste des lots déjà détectés \
automatiquement. La détection automatique a échoué (lots manquants ou sans libellé).

Retourne UNIQUEMENT un tableau JSON des lots manquants ou à compléter, au format :
[{"id": "lot<numéro>", "nom": "Lot <numéro> — <désignation exacte du RC>"}]

Règles strictes :
- N'invente JAMAIS un lot absent des extraits.
- Reprends les désignations EXACTES du document.
- Un lot déjà détecté avec un bon libellé ne doit PAS être répété.
- Si tu ne trouves rien de fiable, retourne []."""


def is_generic_label(nom: str) -> bool:
    """« Lot 6 » sans désignation = libellé générique (échec de labellisation)."""
    return not (nom or "").strip() or bool(_GENERIC_LABEL.match((nom or "").strip()))


def should_trigger(
    detected: List[dict],
    announced: Optional[int],
    mentions_allotissement: bool,
) -> Tuple[bool, str]:
    """Décision STRICTE de déclenchement — sinon zéro appel IA."""
    real = [l for l in detected if l.get("id") != "!!"]

    if not real and mentions_allotissement:
        return True, "aucun lot détecté alors que le DCE mentionne un allotissement"
    if announced is not None and real and len(real) != announced:
        return True, f"écart détectés/annoncés : {len(real)} détectés vs {announced} annoncés"
    if any(is_generic_label(l.get("nom", "")) for l in real):
        return True, "au moins un lot sans libellé exploitable"
    return False, ""


def collect_lot_excerpts(doc_texts: Dict[str, str], max_chars: int = _MAX_EXCERPT_CHARS) -> str:
    """Extraits pertinents : lignes mentionnant lots/allotissement + contexte.

    On n'envoie JAMAIS le DCE entier au filet — uniquement ces passages."""
    marker = re.compile(r'\blots?\b|allotissement|alloti', re.IGNORECASE)
    chunks: List[str] = []
    budget = max_chars

    for fname, text in doc_texts.items():
        if not text or text.startswith("[document volumineux"):
            continue
        lines = text.splitlines()
        keep = set()
        for i, line in enumerate(lines):
            if marker.search(line):
                for j in range(max(0, i - _EXCERPT_CONTEXT_LINES),
                               min(len(lines), i + _EXCERPT_CONTEXT_LINES + 1)):
                    keep.add(j)
        if not keep:
            continue
        # Regroupe les lignes retenues en blocs contigus lisibles.
        block_lines = [lines[j] for j in sorted(keep)]
        chunk = f"=== {fname} ===\n" + "\n".join(block_lines)
        chunk = chunk[:budget]
        chunks.append(chunk)
        budget -= len(chunk)
        if budget <= 0:
            break
    return "\n\n".join(chunks)


def _call_claude(excerpts: str, detected: List[dict], announced: Optional[int]) -> List[dict]:
    """UN appel Sonnet. Appelé depuis le thread de détection (pas d'event loop
    FastAPI ici — l'appel synchrone au SDK est sans risque de famine asyncio)."""
    import anthropic
    from json_repair import repair_json
    from config import get_settings

    detected_summary = json.dumps(
        [{"id": l.get("id"), "nom": l.get("nom")} for l in detected],
        ensure_ascii=False,
    )
    user_msg = (
        f"Nombre de lots annoncé dans le RC : {announced if announced else 'inconnu'}\n"
        f"Lots déjà détectés automatiquement : {detected_summary}\n\n"
        f"Extraits du DCE :\n{excerpts}"
    )

    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=_MODEL,
        max_tokens=2000,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(block.text for block in response.content if hasattr(block, "text"))
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    if not m:
        return []
    parsed = json.loads(repair_json(m.group(0)))
    return parsed if isinstance(parsed, list) else []


def drop_ghosts(lots: List[dict], announced: Optional[int]) -> List[dict]:
    """Écarte les lots fantômes quand la liste nommée du RC est complète.

    Référence = le TABLEAU du RC (source rc_table) : une mention inline dans
    un CCTP (« Lot 00 Annexe… ») ne suffit pas à légitimer un lot hors
    liste. Fallback : sans tableau, la présence rc_text sert de référence.
    Sans liste complète : aucun filtrage (jamais de sur-suppression)."""
    if not announced:
        return lots

    table_ids = {l.get("id") for l in lots if "rc_table" in (l.get("sources") or [])}
    if len(table_ids) >= announced:
        reference = lambda l: l.get("id") in table_ids  # noqa: E731
    else:
        rc_count = sum(1 for l in lots if "rc_text" in (l.get("sources") or []))
        if rc_count < announced:
            return lots
        reference = lambda l: "rc_text" in (l.get("sources") or [])  # noqa: E731

    out = []
    for lot in lots:
        if reference(lot) or "ia_fallback" in (lot.get("sources") or []):
            out.append(lot)
            continue
        logger.warning(
            "Lot fantôme écarté (hors liste RC complète): id=%r nom=%r sources=%r",
            lot.get("id"), lot.get("nom"), lot.get("sources"),
        )
    return out


def drop_unlabeled(lots: List[dict]) -> List[dict]:
    """Invariant de sortie : jamais de lot sans libellé EXPLOITABLE affiché.

    « Lot 06 » nu (générique) = échec de labellisation : après rapprochement
    RC + filet IA, un tel lot est écarté et loggé (spec C3/C4)."""
    out = []
    for lot in lots:
        nom = (lot.get("nom") or "").strip()
        if not nom or is_generic_label(nom):
            logger.warning(
                "Lot sans libellé écarté de l'affichage (anomalie): id=%r nom=%r sources=%r",
                lot.get("id"), nom, lot.get("sources"),
            )
            continue
        out.append(lot)
    return out


def run_fallback_if_needed(
    doc_texts: Dict[str, str],
    detected: List[dict],
    announced: Optional[int],
) -> Tuple[List[dict], bool]:
    """Orchestration : décide, appelle (au plus une fois), fusionne.

    Retourne (lots, ia_called). Toute erreur IA dégrade gracieusement sur
    les lots déterministes."""
    from services.lot_detector import mentions_allotissement as _mentions

    mentions = any(_mentions(t) for t in doc_texts.values())
    triggered, reason = should_trigger(detected, announced, mentions)
    if not triggered:
        return detected, False

    excerpts = collect_lot_excerpts(doc_texts)
    if not excerpts:
        logger.warning("Filet IA lots : déclenché (%s) mais aucun extrait pertinent", reason)
        return detected, False

    logger.info("Filet IA lots déclenché : %s", reason)
    try:
        ia_lots = _call_claude(excerpts, detected, announced)
    except Exception as exc:
        logger.warning("Filet IA lots : appel Claude échoué (%s) — lots regex conservés", exc)
        return detected, False

    merged = [dict(l) for l in detected]
    by_id = {l.get("id"): l for l in merged}
    for ia_lot in ia_lots:
        lot_id = (ia_lot.get("id") or "").strip()
        nom = (ia_lot.get("nom") or "").strip()
        if not lot_id:
            continue
        if not nom:
            logger.warning("Filet IA lots : lot %r sans libellé retourné par l'IA — écarté", lot_id)
            continue
        existing = by_id.get(lot_id)
        if existing is not None:
            # Complète uniquement un libellé manquant/générique — l'IA ne
            # réécrit jamais un libellé déterministe correct.
            if is_generic_label(existing.get("nom", "")):
                existing["nom"] = nom
                sources = list(existing.get("sources") or [])
                if "ia_fallback" not in sources:
                    sources.append("ia_fallback")
                existing["sources"] = sources
        else:
            new_lot = {
                "id": lot_id,
                "nom": nom,
                "confidence": _IA_CONFIDENCE,
                "sources": ["ia_fallback"],
            }
            merged.append(new_lot)
            by_id[lot_id] = new_lot

    return merged, True
