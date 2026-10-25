"""
Document tagging: assign each DCE document to its relevant lots,
and filter documents before AI analysis.
"""

import re
import logging
from typing import List, Optional

from models.project import TYPE_AE, TYPE_DPGF

logger = logging.getLogger(__name__)

# ─── Lot number extraction from filename ──────────────────────────────────────

_LOT_NUM_IN_FNAME = re.compile(
    r'lot[\s_\-]*[nN°]*[\s_\-]*(\d{1,2}[A-Za-z]?)',
    re.IGNORECASE,
)


def _extract_lot_num_from_filename(filename: str) -> Optional[str]:
    """Extract and normalize lot number from filename. '05' → '5', '1A' → '1A'."""
    m = _LOT_NUM_IN_FNAME.search(filename)
    if not m:
        return None
    raw = m.group(1).strip()
    if re.match(r'^\d+$', raw):
        return str(int(raw))   # strip leading zeros
    return raw                 # alphanumeric like "1A"


# ─── Informational document detection ─────────────────────────────────────────

_INFO_FNAME = re.compile(
    r'diagno|amiante|plomb|crep\b|crep_|\bdat\b|dat_|carrez|energetique|'
    r'geotechni|pgc\b|pgc_|ppsps|rict\b|rict_|icpe\b|'
    r'acousti|vibra|rapport.{0,8}sol|sondage|notice.{0,8}secu',
    re.IGNORECASE,
)

_PLAN_FNAME = re.compile(
    r'\.dwg$|\.dwf$|\.dxf$|'
    # "plan"/"plans" but not "planning" — use custom boundary (underscore is \w so \b fails)
    r'(?<![a-z0-9])plans?(?![a-z])|'
    r'coupe(?![a-z])|facade|niveau(?![a-z])|'
    r'rez.{0,4}de.{0,4}chaussee|elevation(?![a-z])|implantation(?![a-z])',
    re.IGNORECASE,
)


# ─── Main tagging function ─────────────────────────────────────────────────────

def assign_document_lots(file_name: str, doc_type: str) -> List[str]:
    """
    Assign relevance tags to a DCE document.

    Returns one of:
    - ["all"]   : relevant to every lot (RC, CCAP, AE, or whole-DCE Excel DPGF)
    - ["info"]  : informational only — never sent to AI analysis
    - ["N"]     : specific to lot N  (e.g. "5", "13", "1A")
    - ["N","M"] : relevant to multiple specific lots (rare)
    """
    # ── Always-include types ───────────────────────────────────────────────────
    if doc_type in ('rc', 'ccap'):
        return ['all']

    # ── AE et DPGF (B2) : propres au lot que leur nom cite, sinon communs ─────
    # (classeur de tous les lots : l'onglet du lot est choisi à l'analyse). Lus
    # avant les motifs « info » : « DPGF lot 10 Plomberie » n'est pas un
    # diagnostic plomb (étiqueté « info », donc écarté, sur le DCE de Gueux).
    if doc_type in (TYPE_AE, TYPE_DPGF):
        lot_num = _extract_lot_num_from_filename(file_name)
        return [lot_num] if lot_num else ['all']

    # ── Plan type ─────────────────────────────────────────────────────────────
    if doc_type == 'plan':
        return ['info']

    # ── Informational filename patterns ───────────────────────────────────────
    if _INFO_FNAME.search(file_name):
        return ['info']
    if _PLAN_FNAME.search(file_name):
        return ['info']

    # ── CCTP: lot-specific if name contains lot number, else all ──────────────
    if doc_type == 'cctp':
        lot_num = _extract_lot_num_from_filename(file_name)
        if lot_num:
            return [lot_num]
        return ['all']

    # ── Generic lot detection ─────────────────────────────────────────────────
    lot_num = _extract_lot_num_from_filename(file_name)
    if lot_num:
        return [lot_num]

    # ── Default: include everywhere ───────────────────────────────────────────
    return ['all']


# ─── Lot number normalization ──────────────────────────────────────────────────

def _normalize_lot_num(s: str) -> str:
    """
    Normalize a lot identifier to a plain string for comparison.
    "lot4" → "4", "lot04" → "4", "05" → "5", "1A" → "1A", "lot1A" → "1A"
    """
    s = s.strip().lower()
    if s.startswith('lot'):
        s = s[3:].lstrip('_- ')
    if re.match(r'^\d+$', s):
        return str(int(s))
    return s


# ─── Document filtering ────────────────────────────────────────────────────────

def get_documents_for_lot(documents, selected_lot: Optional[str]) -> list:
    """
    Filter project documents to those relevant for the selected lot.

    Args:
        documents : iterable of ProjectDocument ORM objects
        selected_lot : lot id like "lot4", "lot05", "all", or None

    Returns:
        filtered list — if selected_lot is None/"all", all non-info docs are returned.
    """
    if not selected_lot or selected_lot == 'all':
        return [d for d in documents if not _is_info_only(d)]

    target = _normalize_lot_num(selected_lot)

    result = []
    for doc in documents:
        tags = doc.related_lots   # list[str] | None

        if tags is None:
            # Legacy untagged document → include by default
            result.append(doc)
            continue

        if 'all' in tags:
            result.append(doc)
            continue

        # Pure info → skip
        if all(t == 'info' for t in tags):
            continue

        # Check if any tag matches target lot
        if any(_normalize_lot_num(t) == target for t in tags if t != 'info'):
            result.append(doc)

    return result


def _is_info_only(doc) -> bool:
    """True if doc is tagged exclusively as informational."""
    tags = doc.related_lots or []
    return bool(tags) and all(t == 'info' for t in tags)
