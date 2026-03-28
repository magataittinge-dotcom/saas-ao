"""
Document tagging: assign each DCE document to its relevant lots,
and filter documents before AI analysis.
"""

import re
import logging
from pathlib import Path
from typing import List, Optional

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
    if doc_type in ('rc', 'ccap', 'acte_engagement'):
        return ['all']

    # ── Excel DPGF: all lots (sheet-level filtering happens at analysis time) ──
    if doc_type == 'dpgf':
        return ['all']

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


# ─── Excel sheet extraction for a specific lot ────────────────────────────────

def _sheet_matches_lot(sheet_name: str, lot_num_norm: str) -> bool:
    """Return True if the Excel sheet name corresponds to the given normalized lot number."""
    m = re.search(r'lot[\s_\-]*[nN°]*[\s_\-]*(\d{1,2}[A-Za-z]?)', sheet_name, re.IGNORECASE)
    if m:
        raw = m.group(1).strip()
        candidate = str(int(raw)) if re.match(r'^\d+$', raw) else raw
        return candidate == lot_num_norm
    return False


def extract_excel_sheet_for_lot(file_path: Path, lot_num: str) -> Optional[str]:
    """
    Extract text content from the Excel sheet(s) matching lot_num.

    Args:
        file_path : Path to the .xlsx / .xls / .ods file
        lot_num   : normalized lot number, e.g. "5", "13", "1A"

    Returns:
        Multi-line string of cell values, rows separated by newlines,
        cells separated by " | ".  None if no matching sheet found.
    """
    suffix = file_path.suffix.lower()
    lot_norm = _normalize_lot_num(lot_num)

    try:
        if suffix in ('.xlsx', '.xlsm'):
            return _extract_xlsx_sheet(file_path, lot_norm)
        if suffix == '.xls':
            return _extract_xls_sheet(file_path, lot_norm)
        if suffix == '.ods':
            return _extract_ods_sheet(file_path, lot_norm)
    except Exception as e:
        logger.warning(f"extract_excel_sheet_for_lot failed for {file_path}: {e}")
    return None


def _extract_xlsx_sheet(file_path: Path, lot_norm: str) -> Optional[str]:
    import openpyxl
    wb = openpyxl.load_workbook(str(file_path), read_only=True, data_only=True)
    try:
        matching = [n for n in wb.sheetnames if _sheet_matches_lot(n, lot_norm)]
        if not matching:
            return None
        lines: List[str] = []
        for sheet_name in matching:
            ws = wb[sheet_name]
            lines.append(f"[Onglet : {sheet_name}]")
            for row in ws.iter_rows(values_only=True):
                cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
                if cells:
                    lines.append(" | ".join(cells))
        return "\n".join(lines) if lines else None
    finally:
        wb.close()


def _extract_xls_sheet(file_path: Path, lot_norm: str) -> Optional[str]:
    import xlrd
    wb = xlrd.open_workbook(str(file_path))
    matching = [n for n in wb.sheet_names() if _sheet_matches_lot(n, lot_norm)]
    if not matching:
        return None
    lines: List[str] = []
    for sheet_name in matching:
        ws = wb.sheet_by_name(sheet_name)
        lines.append(f"[Onglet : {sheet_name}]")
        for row_idx in range(ws.nrows):
            cells = [str(ws.cell_value(row_idx, c)).strip()
                     for c in range(ws.ncols)
                     if str(ws.cell_value(row_idx, c)).strip()]
            if cells:
                lines.append(" | ".join(cells))
    return "\n".join(lines) if lines else None


def _extract_ods_sheet(file_path: Path, lot_norm: str) -> Optional[str]:
    from odf.opendocument import load as ods_load
    from odf.table import Table, TableRow, TableCell
    from odf.text import P

    doc = ods_load(str(file_path))
    sheets = doc.spreadsheet.getElementsByType(Table)
    matching = [s for s in sheets
                if _sheet_matches_lot(s.getAttribute('name') or '', lot_norm)]
    if not matching:
        return None
    lines: List[str] = []
    for sheet in matching:
        sheet_name = sheet.getAttribute('name') or ''
        lines.append(f"[Onglet : {sheet_name}]")
        for row in sheet.getElementsByType(TableRow):
            cells: List[str] = []
            for cell in row.getElementsByType(TableCell):
                ps = cell.getElementsByType(P)
                val = " ".join(str(p) for p in ps).strip() if ps else ''
                if val:
                    cells.append(val)
            if cells:
                lines.append(" | ".join(cells))
    return "\n".join(lines) if lines else None
