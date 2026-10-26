"""
Document tagging: assign each DCE document to its relevant lots,
and filter documents before AI analysis.
"""

import re
import logging
import unicodedata
from typing import List, Optional

from models.project import DCE_TEMPLATE_TYPES

logger = logging.getLogger(__name__)

# ─── Lot number extraction from filename ──────────────────────────────────────

_LOT_NUM_IN_FNAME = re.compile(
    # « lot » en début de mot : « ilot 2 » ou « pilote » ne sont pas un lot.
    r'(?<![^\W\d_])lot[\s_\-]*[nN°]*[\s_\-]*(\d{1,2}[A-Za-z]?)',
    re.IGNORECASE,
)


def _extract_lot_num_from_filename(filename: str) -> Optional[str]:
    """Extract and normalize lot number from filename. '05' → '5', '1A' → '1A'."""
    m = _LOT_NUM_IN_FNAME.search(filename)
    if not m:
        return None
    raw = m.group(1).strip()
    return re.sub(r'^0+(?=\d)', '', raw)   # « 05 » → « 5 », « 01a » → « 1a »


# ─── Informational document detection ─────────────────────────────────────────

# Motifs en MOTS ENTIERS sur le nom normalisé (_mots_du_nom) : avant, des
# sous-chaînes (« plomb » dans « Plomberie », « coupe » dans « coupe-feu »).
_INFO_MOTS = re.compile(
    r' (?:diag(?:nostics?|nostiques?)?|amiante|plomb|crep|dat|carrez|energetiques?'
    r'|geotechni(?:que|ques|e)|pgc|ppsps|rict|icpe|acoustiques?|vibrations?|vibratoires?'
    r'|sondages?) '
    r'| rapports? (?:de |du |d )?sols? '
    r'| notices? (?:de |d )?securite ')
_PLAN_MOTS = re.compile(
    r' (?:plans?|coupes?(?! feu )|facades?|niveaux?|elevations?|implantations?) '
    r'| rez de chaussee ')
_PLAN_EXTENSIONS = re.compile(r'\.(?:dwg|dwf|dxf)$', re.IGNORECASE)

# Pièces qui portent les exigences d'un lot : le type décide, jamais le nom.
_TYPES_DE_LOT = frozenset({"cctp", *DCE_TEMPLATE_TYPES})


def _mots_du_nom(file_name: str) -> str:
    """« Lot05_Façade-ITE.pdf » → « lot05 facade ite pdf », entre deux espaces."""
    texte = unicodedata.normalize("NFKD", file_name or "")
    texte = "".join(c for c in texte if not unicodedata.combining(c)).lower()
    return " " + " ".join(re.sub(r"[^a-z0-9]+", " ", texte).split()) + " "


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

    # ── Le type décide avant le nom (bloc 2) ──────────────────────────────────
    # CCTP et pièces à remplir (AE, DPGF, BPU, DQE, DC1…) : propres au lot que
    # leur nom cite, sinon communs (classeur de tous les lots : l'onglet est
    # choisi à l'analyse). Jamais « info » : sur Gueux, le CCTP et la DPGF du
    # lot 10 « Plomberie » passaient pour un diagnostic plomb.
    if doc_type in _TYPES_DE_LOT:
        return _lot_ou_commun(file_name)

    # ── Plan type ─────────────────────────────────────────────────────────────
    if doc_type == 'plan':
        return ['info']

    # ── Autres pièces : motifs de nom, en mots entiers ────────────────────────
    mots = _mots_du_nom(file_name)
    if _INFO_MOTS.search(mots) or _PLAN_MOTS.search(mots) or _PLAN_EXTENSIONS.search(file_name):
        return ['info']

    # ── Generic lot detection (sinon : commun à tous les lots) ────────────────
    return _lot_ou_commun(file_name)


def _lot_ou_commun(file_name: str) -> List[str]:
    """Lot cité par le nom, sinon commun. Le lot 00 / 0 est commun à tous les
    lots (« lot 00 Généralités » : prescriptions communes ; sur Gueux,
    126 000 caractères jamais analysés quand il était rattaché au lot « 0 »)."""
    lot_num = _extract_lot_num_from_filename(file_name)
    return [lot_num] if lot_num and lot_num != '0' else ['all']


def est_commune(tags) -> bool:
    """Étiquettes d'une pièce commune à tous les lots : aucune, « all », ou le
    lot 0 (étiquette « 0 » / « 00 » posée avant le bloc 2)."""
    return not tags or 'all' in tags or any(_normalize_lot_num(t) == '0' for t in tags)


# ─── Lot number normalization ──────────────────────────────────────────────────

def _normalize_lot_num(s: str) -> str:
    """
    Normalize a lot identifier to a plain string for comparison.
    "lot4" → "4", "lot04" → "4", "05" → "5", "1A" → "1a", "lot01a" → "1a"
    """
    s = s.strip().lower()
    if s.startswith('lot'):
        s = s[3:].lstrip('_- ')
    return re.sub(r'^0+(?=\d)', '', s)   # zéros de tête retirés, sous-lots compris


def rattache_au_lot(etiquette: str, cible: str, lots_du_rc=None) -> bool:
    """L'étiquette d'une pièce désigne-t-elle le lot `cible` (normalisé) ?

    Sous-lots (décision du 25/10) : si le RC ne définit que le lot 01, une pièce
    « 01a » ou « 01b » se rattache au lot 01 ; si le RC définit lui-même 01a et
    01b comme des lots, ils restent séparés. `lots_du_rc` : identifiants des
    lots du projet (« lot1 »…), ou None si inconnus (aucun rattachement)."""
    t = _normalize_lot_num(etiquette)
    if t == cible:
        return True
    sous_lot = re.fullmatch(r'(\d+)[a-z]', t)
    if not sous_lot or sous_lot.group(1) != cible or lots_du_rc is None:
        return False
    return t not in {_normalize_lot_num(l) for l in lots_du_rc if l}


# ─── Document filtering ────────────────────────────────────────────────────────

def get_documents_for_lot(documents, selected_lot: Optional[str], lots_du_rc=None) -> list:
    """
    Filter project documents to those relevant for the selected lot.

    Args:
        documents : iterable of ProjectDocument ORM objects
        selected_lot : lot id like "lot4", "lot05", "all", or None
        lots_du_rc : ids des lots du projet (sous-lots, voir rattache_au_lot)

    Returns:
        filtered list — if selected_lot is None/"all", all non-info docs are returned.
    """
    if not selected_lot or selected_lot == 'all':
        return [d for d in documents if not _is_info_only(d)]

    target = _normalize_lot_num(selected_lot)

    result = []
    for doc in documents:
        tags = doc.related_lots   # list[str] | None

        if tags is None or est_commune(tags):
            # Non étiquetée (ancienne), « all », ou lot 0 : commune à tous les lots.
            result.append(doc)
            continue

        # Pure info → skip
        if all(t == 'info' for t in tags):
            continue

        # Check if any tag matches target lot
        if any(rattache_au_lot(t, target, lots_du_rc) for t in tags if t != 'info'):
            result.append(doc)

    return result


def _is_info_only(doc) -> bool:
    """True if doc is tagged exclusively as informational."""
    tags = doc.related_lots or []
    return bool(tags) and all(t == 'info' for t in tags)
