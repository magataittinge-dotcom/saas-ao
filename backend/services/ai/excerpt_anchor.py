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
import os
import re
import threading
from array import array
import unicodedata
from collections import OrderedDict
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


# Forme normalisée de chaque caractère, calculée une fois : (blanc ?, forme).
# La normalisation d'un DCE passait ~1 µs par caractère dans NFKD.
_CHAR_NORM: Dict[str, Tuple[bool, str]] = {}


def _char_norm(ch: str) -> Tuple[bool, str]:
    c = _norm_char(ch)
    if c.isspace():
        return True, " "
    decomposed = unicodedata.normalize("NFKD", c)
    base = "".join(x for x in decomposed if not unicodedata.combining(x)) or c
    return False, base.lower()


def _normalize_with_map(text: str) -> Tuple[str, List[int]]:
    """Normalisation POSITION-PRÉSERVANTE : retourne (texte normalisé,
    mapping index normalisé → index original)."""
    out: List[str] = []
    idx_map: List[int] = []
    prev_space = True
    memo = _CHAR_NORM
    for i, ch in enumerate(text):
        r = memo.get(ch)
        if r is None:
            r = memo[ch] = _char_norm(ch)
        if r[0]:
            if prev_space:
                continue
            out.append(" ")
            idx_map.append(i)
            prev_space = True
            continue
        prev_space = False
        for c in r[1]:
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
# les mêmes ~10 docs re-normalisait 50k caractères à chaque appel). Clé = le
# TEXTE lui-même : chaque portée d'analyse relit les textes en base (nouveaux
# objets) — l'ancienne clé id() ne servait qu'une portée et ne libérait
# jamais rien (≈ 58 Mo par million de caractères). LRU borné en caractères ;
# le mapping de positions est un array d'entiers (4 octets par caractère).
_DOC_CACHE: "OrderedDict[str, tuple]" = OrderedDict()
_DOC_CACHE_MAX_CARACTERES = 8_000_000   # ≈ 4 DCE complets comme Gueux (1,7 M)
_cache_verrou = threading.Lock()


def _doc_index(doc_text: str):
    """(texte normalisé, mapping vers l'original, mots normalisés et leur
    position, positions des termes déjà cherchés) d'un document."""
    with _cache_verrou:
        cached = _DOC_CACHE.get(doc_text)
        if cached is not None:
            _DOC_CACHE.move_to_end(doc_text)
            return cached
    norm, idx_map = _normalize_with_map(doc_text)
    words = [(m.group(0), m.start()) for m in re.finditer(r"\S+", norm)]
    cached = (norm, array("I", idx_map), words, {})
    with _cache_verrou:
        _DOC_CACHE[doc_text] = cached
        total = sum(len(k) for k in _DOC_CACHE)
        while total > _DOC_CACHE_MAX_CARACTERES and len(_DOC_CACHE) > 1:
            ancien, _ = _DOC_CACHE.popitem(last=False)
            total -= len(ancien)
    return cached


_POSITIONS_MAX_TERMES = 2_000   # par document ; au-delà, le mémo repart de zéro


def _positions_terme(terme: str, words: List[Tuple[str, int]], memo: Dict[str, "array"]) -> "array":
    """Indices des mots du document qui CONTIENNENT `terme` (même test que
    l'ancien balayage : `terme in mot`), calculés une fois par document.
    Mémo compact (array, 4 octets par position) et plafonné en nombre de termes."""
    pos = memo.get(terme)
    if pos is None:
        if len(memo) >= _POSITIONS_MAX_TERMES:
            memo.clear()
        pos = memo[terme] = array("I", (j for j, (w, _) in enumerate(words) if terme in w))
    return pos


def anchor_excerpt(excerpt: str, doc_text: str) -> Optional[str]:
    """Retourne un extrait VERBATIM du doc correspondant à l'excerpt, ou None."""
    excerpt = (excerpt or "").strip()
    if len(excerpt) < 10 or not doc_text:
        return None

    # 1. Exact
    if excerpt in doc_text:
        return excerpt

    # 2. Normalisé → ré-ancrage sur le passage réel
    doc_norm, idx_map, _doc_words, _positions = _doc_index(doc_text)
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
    # Fenêtres de `window` mots, toutes les `pas` positions : un terme compte
    # dans une fenêtre si un de ses mots le contient. Plutôt que de re-tester
    # chaque terme contre chaque mot de chaque fenêtre, on part des positions
    # où chaque terme apparaît et on marque les fenêtres qui les couvrent.
    # Résultat identique (même meilleure fenêtre : la première au score max).
    pas = max(window // 3, 1)
    nb_fenetres = (len(doc_words) + pas - 1) // pas
    hits = [0] * nb_fenetres
    for t in term_set:
        couvertes = set()
        for j in _positions_terme(t, doc_words, _positions):
            # fenêtres k avec k*pas <= j < k*pas + window
            couvertes.update(range(max(0, -((window - 1 - j) // pas)), j // pas + 1))
        for k in couvertes:
            hits[k] += 1
    best_hits = max(hits) if hits else 0
    if best_hits == 0:
        return None
    best_score = best_hits / len(term_set)
    best_pos = hits.index(best_hits) * pas

    if best_score < _MIN_RECOVER_SCORE:
        return None

    norm_start = doc_words[best_pos][1]
    norm_end_word = doc_words[min(best_pos + window - 1, len(doc_words) - 1)]
    norm_end = norm_end_word[1] + len(norm_end_word[0])
    start = idx_map[min(norm_start, len(idx_map) - 1)]
    end = idx_map[min(norm_end - 1, len(idx_map) - 1)] + 1
    s, e = _expand_to_sentence(doc_text, start, end)
    candidate = doc_text[s:e].strip()
    return candidate if len(candidate) >= 20 else None


# Textes de pages par EMPREINTE de fichier (chemin réel, taille, date) : chaque
# portée d'analyse (tronc commun, puis chaque lot) et chaque relance rouvraient
# les mêmes PDF. L'extraction du dépôt y dépose aussi les pages qu'elle vient de
# lire (retenir_pages) : l'analyse ne relit plus le PDF du tout.
# Entrée : (normalisées ?, textes des pages, TOUTES les pages, vides comprises).
_PAGES_CACHE: "OrderedDict[tuple, tuple]" = OrderedDict()
_PAGES_CACHE_MAX_CARACTERES = 8_000_000   # borné en volume, pas en nombre de fichiers


def _empreinte(chemin: str) -> Optional[tuple]:
    try:
        reel = os.path.realpath(chemin)
        st = os.stat(reel)
    except OSError:
        return None
    return (reel, st.st_size, st.st_mtime_ns)


def _ranger_pages(cle: tuple, entree: tuple) -> None:
    with _cache_verrou:
        _PAGES_CACHE[cle] = entree
        _PAGES_CACHE.move_to_end(cle)
        total = sum(sum(len(p) for p in v[1]) for v in _PAGES_CACHE.values())
        while total > _PAGES_CACHE_MAX_CARACTERES and len(_PAGES_CACHE) > 1:
            _, retiree = _PAGES_CACHE.popitem(last=False)
            total -= sum(len(p) for p in retiree[1])


def retenir_pages(chemin: str, pages: List[str]) -> None:
    """Garde les textes de TOUTES les pages d'un PDF que l'extraction vient de
    lire (mêmes appels get_text que resolve_pages) : l'ancrage les reprendra au
    lieu de rouvrir le fichier. Normalisés plus tard, seulement s'ils servent."""
    cle = _empreinte(chemin)
    if cle is not None:
        _ranger_pages(cle, (False, list(pages)))


def _pages_normalisees(chemin: str) -> List[str]:
    import fitz

    cle = _empreinte(chemin)
    if cle is None:
        return []
    with _cache_verrou:
        entree = _PAGES_CACHE.get(cle)
        if entree is not None:
            _PAGES_CACHE.move_to_end(cle)
    if entree is not None:
        normalisees, pages = entree
        if normalisees:
            return pages
        pages = [_normalize(p) for p in pages]
        _ranger_pages(cle, (True, pages))
        return pages
    try:
        with fitz.open(chemin) as doc:
            pages = [_normalize(p.get_text()) for p in doc]
    except Exception:
        return []
    _ranger_pages(cle, (True, pages))
    return pages


def resolve_pages(requirements: List[dict], doc_paths: Dict[str, str]) -> int:
    """Corrige source_page : localise la page RÉELLE de chaque excerpt ancré
    (la page estimée par l'IA est souvent fausse → viewer sans surlignage).
    Une ouverture fitz par document (et par empreinte de fichier), textes de
    pages normalisés cachés."""
    page_cache: Dict[str, List[str]] = {}

    def _pages(key: str) -> List[str]:
        if key not in page_cache:
            page_cache[key] = _pages_normalisees(doc_paths[key])
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
