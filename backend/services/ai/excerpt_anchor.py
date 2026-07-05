"""
Ancrage verbatim des excerpts d'exigences (déterministe, 0 € API).

Promesse produit : chaque exigence est SOURCÉE — l'extrait affiché et
surligné existe mot pour mot dans le document. Mesure réelle avant ce
module : 7 % des excerpts IA étaient verbatim, 73 % introuvables (l'IA
condense avec « … », reformule, recolle des morceaux distants).

Trois niveaux, dans l'ordre :
  1. EXACT      — l'excerpt est déjà dans le texte source ;
  2. NORMALISÉ  — retrouvé après normalisation (apostrophes typographiques,
                  retours de ligne intra-phrase, césures, ligatures) →
                  RÉ-ANCRÉ sur le passage réel du document (verbatim) ;
  3. RÉCUPÉRÉ   — condensé/reformulé → la phrase réelle du document qui
                  contient le plus de termes significatifs de l'excerpt
                  est localisée (seuil strict) et retournée EN ENTIER.
Sinon : None — l'ancre est invalide, l'UI n'affiche PAS de bouton source
(jamais de viewer qui ment). Compteurs loggés.
"""
import logging
import re
import unicodedata
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_MIN_RECOVER_SCORE = 0.55   # ≥ 55 % des termes significatifs retrouvés
_MIN_TERMS = 3


def _norm_char(ch: str) -> str:
    mapping = {"’": "'", "‘": "'", "ʼ": "'",
               "“": '"', "”": '"', "«": '"', "»": '"',
               "–": "-", "—": "-", "…": "...",
               "◼": " ", " ": " "}
    return mapping.get(ch, ch)


def _normalize_with_map(text: str) -> Tuple[str, List[int]]:
    """Normalisation POSITION-PRÉSERVANTE : retourne (texte normalisé,
    mapping index normalisé → index original)."""
    out: List[str] = []
    idx_map: List[int] = []
    prev_space = True
    for i, ch in enumerate(text):
        ch = _norm_char(ch)
        if ch.isspace():
            if prev_space:
                continue
            out.append(" ")
            idx_map.append(i)
            prev_space = True
            continue
        prev_space = False
        decomposed = unicodedata.normalize("NFKD", ch)
        base = "".join(c for c in decomposed if not unicodedata.combining(c)) or ch
        for c in base.lower():
            out.append(c)
            idx_map.append(i)
    return "".join(out), idx_map


def _normalize(text: str) -> str:
    return _normalize_with_map(text)[0]


_SENTENCE_BOUNDARY = re.compile(r"(?<=[.;:!?])\s+|\n{2,}")


def _expand_to_sentence(doc: str, start: int, end: int) -> Tuple[int, int]:
    """Étend [start, end) aux limites de phrase dans le texte original."""
    left = max((doc.rfind(p, 0, start) for p in (". ", ".\n", " ;", ":\n", "\n\n")),
               default=-1)
    left = max(left, doc.rfind("\n1/", 0, start), doc.rfind("◼", 0, start))
    s = left + 2 if left >= 0 else 0
    m = re.search(r"[.;!?](\s|$)|\n\n|\n◼", doc[end:end + 400])
    e = end + m.end() if m else min(len(doc), end + 200)
    return s, e


# Cache de normalisation par document (l'ancrage de 448 exigences contre
# les mêmes ~10 docs re-normalisait 50k caractères à chaque appel).
_DOC_CACHE: dict = {}


def _doc_index(doc_text: str):
    key = id(doc_text)
    cached = _DOC_CACHE.get(key)
    if cached is None or cached[0] is not doc_text:
        norm, idx_map = _normalize_with_map(doc_text)
        words = [(m.group(0), m.start()) for m in re.finditer(r"\S+", norm)]
        cached = (doc_text, norm, idx_map, words)
        _DOC_CACHE[key] = cached
    return cached[1], cached[2], cached[3]


def anchor_excerpt(excerpt: str, doc_text: str) -> Optional[str]:
    """Retourne un extrait VERBATIM du doc correspondant à l'excerpt, ou None."""
    excerpt = (excerpt or "").strip()
    if len(excerpt) < 10 or not doc_text:
        return None

    # 1. Exact
    if excerpt in doc_text:
        return excerpt

    # 2. Normalisé → ré-ancrage sur le passage réel
    doc_norm, idx_map, _doc_words = _doc_index(doc_text)
    exc_norm = _normalize(excerpt)
    if exc_norm and exc_norm in doc_norm:
        pos = doc_norm.find(exc_norm)
        start = idx_map[pos]
        end = idx_map[min(pos + len(exc_norm) - 1, len(idx_map) - 1)] + 1
        return doc_text[start:end].strip() or None

    # 3. Récupération par termes significatifs : les segments de l'excerpt
    # (séparés par « … » de condensation) sont cherchés ; la fenêtre du doc
    # qui matche le mieux le PREMIER segment substantiel est ré-ancrée puis
    # étendue à la phrase réelle entière.
    # 2bis. Condensation « … » : le PLUS LONG segment de l'excerpt est
    # souvent verbatim — le ré-ancrer puis étendre à la phrase réelle.
    segments = [s.strip() for s in re.split(r"…|\.\.\.", excerpt) if len(s.strip()) >= 20]
    for seg in sorted(segments, key=len, reverse=True):
        seg_norm = _normalize(seg)
        pos = doc_norm.find(seg_norm)
        if pos >= 0:
            start = idx_map[pos]
            end = idx_map[min(pos + len(seg_norm) - 1, len(idx_map) - 1)] + 1
            s_, e_ = _expand_to_sentence(doc_text, start, end)
            candidate = doc_text[s_:e_].strip()
            if len(candidate) >= 20:
                return candidate

    terms = [t for t in re.findall(r"[a-z0-9']{4,}", exc_norm)]
    if len(terms) < _MIN_TERMS:
        return None

    # Early-exit : si le doc ENTIER ne contient même pas le seuil de termes,
    # inutile de balayer les fenêtres (c'est le cas de ~90 % des paires
    # excerpt×doc en multi-documents).
    term_set_global = set(terms)
    present = sum(1 for t in term_set_global if t in doc_norm)
    if present / len(term_set_global) < _MIN_RECOVER_SCORE:
        return None

    doc_words = _doc_words
    if not doc_words:
        return None
    window = max(len(terms) * 2, 12)
    term_set = set(terms)
    best_score, best_pos = 0.0, None
    for i in range(0, len(doc_words), max(window // 3, 1)):
        chunk_words = {w for w, _ in doc_words[i:i + window]}
        hits = sum(1 for t in term_set
                   if any(t in w for w in chunk_words))
        score = hits / len(term_set)
        if score > best_score:
            best_score, best_pos = score, i

    if best_pos is None or best_score < _MIN_RECOVER_SCORE:
        return None

    norm_start = doc_words[best_pos][1]
    norm_end_word = doc_words[min(best_pos + window - 1, len(doc_words) - 1)]
    norm_end = norm_end_word[1] + len(norm_end_word[0])
    start = idx_map[min(norm_start, len(idx_map) - 1)]
    end = idx_map[min(norm_end - 1, len(idx_map) - 1)] + 1
    s, e = _expand_to_sentence(doc_text, start, end)
    candidate = doc_text[s:e].strip()
    return candidate if len(candidate) >= 20 else None


def resolve_pages(requirements: List[dict], doc_paths: Dict[str, str]) -> int:
    """Corrige source_page : localise la page RÉELLE de chaque excerpt ancré
    (la page estimée par l'IA est souvent fausse → viewer sans surlignage).
    Une ouverture fitz par document, textes de pages normalisés cachés."""
    import fitz

    page_cache: Dict[str, List[str]] = {}

    def _pages(key: str) -> List[str]:
        if key not in page_cache:
            try:
                with fitz.open(doc_paths[key]) as doc:
                    page_cache[key] = [_normalize(p.get_text()) for p in doc]
            except Exception:
                page_cache[key] = []
        return page_cache[key]

    fixed = 0
    for req in requirements:
        excerpt = req.get("source_excerpt")
        if not excerpt:
            continue
        src = (req.get("source_document") or "")
        key = next((k for k in doc_paths
                    if k.lower() == src.lower() or k.lower() in src.lower()
                    or src.lower() in k.lower()), None)
        if not key:
            continue
        probe = _normalize(excerpt[:120])
        if len(probe) < 15:
            continue
        pages = _pages(key)
        current = req.get("source_page")
        # La page indiquée matche déjà → rien à faire
        if current and 1 <= current <= len(pages) and probe in pages[current - 1]:
            continue
        for pno, ptxt in enumerate(pages, start=1):
            if probe in ptxt:
                req["source_page"] = pno
                fixed += 1
                break
    if fixed:
        logger.info("Ancrage : %d pages sources corrigées (page IA fausse)", fixed)
    return fixed


def anchor_requirements(requirements: List[dict], doc_texts: Dict[str, str]) -> List[dict]:
    """Ancre chaque requirement sur le texte réel. doc_texts : clé =
    type/nom de doc (RC, CCAP, CCTP, nom de fichier) → texte extrait.
    source_excerpt devient un verbatim garanti, ou None (ancre invalide).

    Le doc désigné par l'IA est essayé D'ABORD ; s'il n'ancre pas, TOUS les
    autres documents sont essayés (source_document est souvent ambigu :
    « CCTP » alors que le DCE en contient 20+) — et source_document est
    CORRIGÉ vers le document où l'extrait existe réellement."""
    counts = {"exact_ou_reancre": 0, "recupere": 0, "invalide": 0}

    def _candidates(source: Optional[str]) -> List[Tuple[str, str]]:
        s = re.sub(r"\s*p\.?\s*\d+.*$", "", (source or "")).strip().lower()
        designated = [
            (key, txt) for key, txt in doc_texts.items()
            if s and (s == key.lower() or s in key.lower() or key.lower() in s)
        ]
        others = [(k, t) for k, t in doc_texts.items() if (k, t) not in designated]
        return designated + others

    for req in requirements:
        original = (req.get("source_excerpt") or "").strip()
        anchored = None
        anchored_in = None
        exactish = False
        for key, doc in _candidates(req.get("source_document")):
            if not doc:
                continue
            out = anchor_excerpt(original, doc)
            if out is not None:
                anchored, anchored_in = out, key
                exactish = original in doc or _normalize(out) == _normalize(original)
                break

        if anchored is None:
            counts["invalide"] += 1
            req["source_excerpt"] = None
        else:
            counts["exact_ou_reancre" if exactish else "recupere"] += 1
            req["source_excerpt"] = anchored[:600]
            # Corrige le doc source si l'extrait vit ailleurs que désigné
            src = (req.get("source_document") or "")
            if anchored_in and anchored_in.lower() not in src.lower():
                req["source_document"] = anchored_in

    total = max(len(requirements), 1)
    valid = counts["exact_ou_reancre"] + counts["recupere"]
    logger.info(
        "Ancrage des sources : %d/%d ancrées (%.0f%%) — %d exactes/ré-ancrées, "
        "%d récupérées par termes clés, %d invalides (sans bouton source)",
        valid, total, valid / total * 100,
        counts["exact_ou_reancre"], counts["recupere"], counts["invalide"],
    )
    return requirements
