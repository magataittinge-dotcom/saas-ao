import re
import unicodedata
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any

logger = logging.getLogger(__name__)

# ─── BTP Families ─────────────────────────────────────────────────────────────
BTP_FAMILIES: List[Tuple[int, str, List[str]]] = [
    (1,  "VRD / Voirie et Réseaux Divers",            ["vrd", "voirie", "terrassement", "reseaux divers", "assainissement", "viabilisation", "reseau sec", "reseau humide"]),
    (2,  "Gros œuvre",                                ["gros oeuvre", "gros-oeuvre", "maconnerie", "beton arme", "structure", "fondations", "ferraillage", "banche"]),
    (3,  "Charpente",                                  ["charpente", "ossature bois", "charpente bois", "lamelle colle", "charpente metallique"]),
    (4,  "Couverture / Étanchéité",                   ["couverture", "etancheite", "zinguerie", "toiture", "ardoise", "tuile", "bac acier"]),
    (5,  "Façades / Ravalement",                      ["facade", "bardage", "ravalement", "isolation thermique par exterieur", "ite", "enduit facade"]),
    (6,  "Menuiseries extérieures",                   ["menuiserie ext", "menuiseries exterieures", "aluminium", "menuiserie aluminium", "menuiserie pvc", "vitrage", "fenetre", "baie vitree", "porte exterieure", "rideau metallique"]),
    (7,  "Serrurerie / Métallerie",                   ["serrurerie", "metallerie", "garde-corps", "garde corps", "portail", "cloture metallique", "escalier metallique"]),
    (8,  "Plâtrerie / Faux-plafonds",                 ["platrerie", "doublage", "faux-plafond", "faux plafond", "cloison", "isolation interieure", "laine de verre"]),
    (9,  "Menuiseries intérieures",                   ["menuiserie int", "menuiseries interieures", "boiserie", "placards", "porte interieure", "bloc porte"]),
    (10, "Peinture / Revêtements muraux",             ["peinture", "revetement mural", "papier peint", "toile de verre"]),
    (11, "Carrelage / Faïence",                       ["carrelage", "faience", "granit", "marbre", "pierre naturelle"]),
    (12, "Sols souples",                              ["sol souple", "moquette", "parquet", "linoleum", "stratifie", "sols bois"]),
    (13, "Plomberie / Sanitaires",                    ["plomberie", "sanitaire", "robinetterie", "plomberie-sanitaire", "eau chaude sanitaire", "ecs"]),
    (14, "CVC (Chauffage-Ventilation-Climatisation)", ["chauffage", "ventilation", "climatisation", "cvc", "pac", "plancher chauffant", "radiateur", "vmc"]),
    (15, "Électricité courants forts",                ["electricite", "courants forts", "cfo", "tableau electrique", "eclairage", "distribution electrique"]),
    (16, "Courants faibles / SSI",                    ["courants faibles", "courant faible", "ssi", "cfa", "surete", "controle acces", "securite incendie", "reseau informatique"]),
    (17, "Ascenseurs / Élévateurs",                   ["ascenseur", "elevateur", "monte-charge", "monte charge", "nacelle"]),
    (18, "Espaces verts / Paysage",                   ["espaces verts", "paysage", "paysagisme", "vegetaux", "engazonnement", "plantations"]),
]

# ─── Regex patterns ────────────────────────────────────────────────────────────

_IGNORE_SHEETS = re.compile(
    r'^(sommaire|recap|recapitulatif|total|couverture|garde|notice|'
    r'dpgf|bpu|dqe|bordereau|feuil\d*|sheet\d*|onglet\d*)$',
    re.IGNORECASE,
)
_LOT_TABLE_HEADER = re.compile(
    r'(?:n[°o]?\s*\.?\s*lot|lot\s*n[°o]?|num[eé]ro\s*lot|liste\s+des\s+lots|'
    r'd[eé]signation\s+des\s+lots|intitul[eé]\s+des?\s+lots?)',
    re.IGNORECASE,
)
# Table row: numeric or alpha lot id (AMÉLIORATION 6)
_LOT_TABLE_ROW_NUM   = re.compile(r'^\s*(\d{1,2})\s{1,6}(\S.{1,80})')
_LOT_TABLE_ROW_ALPHA = re.compile(r'^\s*([A-Z])\s{1,6}(\S.{1,80})')
# Inline lot patterns with letter support (AMÉLIORATION 6)
_LOT_LINE = re.compile(
    r'(?:^|[\s\-–—:])(?:lot|tranche)\s*[nN°]*\s*(\d{1,2}[A-Za-z]?|[A-Za-z])\b[^\n]{0,80}',
    re.IGNORECASE | re.MULTILINE,
)
_RC_MARKER = re.compile(
    r'r[eè]glement\s+de\s+la\s+consultation|MARCHE\s+PASSE\s+PAR\s+LOTS|'
    r'alloti|lots\s+s[eé]par[eé]s',
    re.IGNORECASE,
)
_LOT_FNAME = re.compile(r'lot[\s_\-]*(\d{1,2}[A-Za-z]?|[A-Za-z](?!\w))', re.IGNORECASE)
_LOT_CELL_CONTENT = re.compile(r'\blot\s*n?°?\s*(\d{1,2}[A-Za-z]?)\b', re.IGNORECASE)
# Tranche detection in Excel headers (AMÉLIORATION 7)
_TRANCHE_HEADER = re.compile(
    r'tranche\s*(ferme|optionnel\w*|condition\w*)?|'
    r'\b(ferme|optionnel\w*)\b',
    re.IGNORECASE,
)
# Annexe / allotissement filenames (AMÉLIORATION 5)
_ANNEXE_FNAME = re.compile(
    r'annexe|allotissement|liste.{0,6}lots|sommaire|alloti',
    re.IGNORECASE,
)


# ─── Data model ────────────────────────────────────────────────────────────────

@dataclass
class LotDetection:
    id: str          # "lot1", "lot1A", "lotA", etc.
    nom: str         # "Lot 1 — Gros œuvre"
    confidence: int  # 0–100
    sources: List[str] = field(default_factory=list)
    tranches: List[str] = field(default_factory=list)  # AMÉLIORATION 7

    def to_dict(self) -> Dict:
        d: Dict[str, Any] = {
            "id": self.id,
            "nom": self.nom,
            "confidence": self.confidence,
            "sources": list(self.sources),
        }
        if self.tranches:
            d["tranches"] = list(self.tranches)
        return d


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Lowercase + strip diacritics + collapse whitespace."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r'\s+', ' ', ascii_str.lower()).strip()


def _sort_key(lot_id: str) -> tuple:
    """Sort key: numeric part first, then alpha suffix."""
    m = re.match(r'lot(\d+)([A-Za-z]?)', lot_id)
    if m:
        return (int(m.group(1)), m.group(2).upper())
    # Alpha lot: lotA, lotB…
    m2 = re.match(r'lot([A-Za-z])$', lot_id)
    if m2:
        return (ord(m2.group(1).upper()) - ord('A') + 100, '')
    return (999, '')


def _is_ignored_sheet(name: str) -> bool:
    return bool(_IGNORE_SHEETS.match(_normalize(name)))


def _alpha_to_num(letter: str) -> str:
    """Convert lot letter A→1, B→2, … Z→26."""
    return str(ord(letter.upper()) - ord('A') + 1)


def _lot_id_from_raw(raw: str) -> Optional[str]:
    """Convert raw lot identifier to canonical lot_id.
    Returns None for invalid/ambiguous IDs (e.g. lowercase single letter from 'lots'→'s')."""
    raw = raw.strip()
    if re.match(r'^\d{1,2}[A-Za-z]?$', raw):
        num = raw.lstrip("0") or "0"
        return f"lot{num}"
    # Single alpha: only accept uppercase (e.g. "Lot A", "Lot B")
    # Reject lowercase like 'n' from "Lot n°4" or 's' from "lots"
    if re.match(r'^[A-Z]$', raw):
        return f"lot{_alpha_to_num(raw)}"
    return None


def _best_label(nom_a: str, nom_b: str, prefer_a: bool = True) -> str:
    """
    AMÉLIORATION 10: pick the more descriptive name.
    Strip leading 'Lot XX — ' prefix before comparing length.
    In case of tie, prefer `nom_a` if prefer_a else `nom_b`.
    """
    def _label_body(nom: str) -> str:
        return re.sub(r'^lot\s*\d+[a-z]?\s*[—\-–:]\s*', '', nom, flags=re.IGNORECASE).strip()

    body_a = _label_body(nom_a)
    body_b = _label_body(nom_b)

    if len(body_b) > len(body_a):
        return nom_b
    if len(body_a) > len(body_b):
        return nom_a
    return nom_a if prefer_a else nom_b


# ─── DOCX text extraction ──────────────────────────────────────────────────────

def _extract_docx_text(path: Path) -> str:
    """Extract text from a .docx file including paragraphs and table cells."""
    try:
        from docx import Document
        doc = Document(str(path))
        parts: List[str] = []
        for p in doc.paragraphs:
            txt = p.text.strip()
            if txt:
                parts.append(txt)
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    parts.append("  ".join(cells))
        return "\n".join(parts)
    except Exception as e:
        logger.debug(f"python-docx extraction failed for {path.name}: {e}")
        return ""


# ─── PDF text extraction (limited pages) (AMÉLIORATION 8) ─────────────────────

def _extract_pdf_text_limited(path: Path, max_pages: int = 30) -> str:
    """Extract text from first max_pages of a PDF for lot detection."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(str(path))
        parts = []
        for page_num in range(min(len(doc), max_pages)):
            text = doc[page_num].get_text()
            if text:
                parts.append(text)
        doc.close()
        return "\n".join(parts)
    except Exception:
        # Fallback to PyPDF2 if fitz not available
        try:
            import PyPDF2
            import io
            with open(str(path), 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                parts = []
                for i in range(min(len(reader.pages), max_pages)):
                    t = reader.pages[i].extract_text()
                    if t:
                        parts.append(t)
                return "\n".join(parts)
        except Exception as e2:
            logger.debug(f"PDF extraction failed for {path.name}: {e2}")
            return ""


# ─── ODS support (AMÉLIORATION 1) ─────────────────────────────────────────────

def _get_ods_sheet_names(file_path: str) -> List[str]:
    """Return sheet names from an .ods file using odfpy."""
    try:
        from odf.opendocument import load as ods_load
        from odf.table import Table
        doc = ods_load(file_path)
        return [sheet.getAttribute("name") for sheet in doc.spreadsheet.getElementsByType(Table)]
    except Exception as e:
        logger.error(f"Erreur lecture ODS {file_path}: {e}")
        return []


def _scan_ods_cell_content(file_path: str, sheet_names: List[str]) -> List[LotDetection]:
    """Scan ODS cell content for lot patterns (mirrors _scan_excel_cell_content_for_lots)."""
    lots: Dict[str, LotDetection] = {}
    try:
        from odf.opendocument import load as ods_load
        from odf.table import Table, TableRow, TableCell
        from odf.text import P

        doc = ods_load(file_path)
        for sheet in doc.spreadsheet.getElementsByType(Table):
            name = sheet.getAttribute("name")
            if _is_ignored_sheet(name):
                continue
            row_count = 0
            for row in sheet.getElementsByType(TableRow):
                if row_count >= 500:
                    break
                row_count += 1
                col_idx = 0
                for cell in row.getElementsByType(TableCell):
                    if col_idx >= 4:
                        break
                    col_idx += 1
                    cell_text = ""
                    for p in cell.getElementsByType(P):
                        cell_text += p.firstChild.data if p.firstChild else ""
                    cell_text = cell_text.strip()
                    if not cell_text or len(cell_text) > 120:
                        continue
                    m = _LOT_CELL_CONTENT.search(cell_text)
                    if m:
                        raw_id = m.group(1)
                        lot_id = _lot_id_from_raw(raw_id)
                        if lot_id not in lots:
                            label = _LOT_CELL_CONTENT.sub('', cell_text).strip(' :—-–')[:60]
                            nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
                            lots[lot_id] = LotDetection(id=lot_id, nom=nom, confidence=65, sources=["excel"])
    except Exception as e:
        logger.debug(f"ODS cell scan failed for {file_path}: {e}")
    return list(lots.values())


# ─── Tranche detection in Excel (AMÉLIORATION 7) ──────────────────────────────

def _detect_tranches_in_excel(file_path: str) -> List[str]:
    """
    Scan first 10 rows of an Excel/ODS for tranche-related column headers.
    Returns list like ["Tranche ferme: Existant école", "Tranche optionnelle: Salle polyvalente"].
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    tranches: List[str] = []

    try:
        if suffix == ".xlsx":
            import openpyxl
            wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
            for ws in wb.worksheets:
                for i, row in enumerate(ws.iter_rows(max_row=10, values_only=True)):
                    if i >= 10:
                        break
                    for cell_val in row:
                        if not cell_val:
                            continue
                        cell_str = str(cell_val).strip()
                        if _TRANCHE_HEADER.search(cell_str) and 3 < len(cell_str) < 80:
                            label = cell_str[:60]
                            if label not in tranches:
                                tranches.append(label)
                if tranches:
                    break
            wb.close()

        elif suffix == ".xls":
            import xlrd
            wb = xlrd.open_workbook(str(path))
            for ws in wb.sheets():
                for row_idx in range(min(10, ws.nrows)):
                    for col_idx in range(ws.ncols):
                        cell_val = ws.cell_value(row_idx, col_idx)
                        if not cell_val:
                            continue
                        cell_str = str(cell_val).strip()
                        if _TRANCHE_HEADER.search(cell_str) and 3 < len(cell_str) < 80:
                            label = cell_str[:60]
                            if label not in tranches:
                                tranches.append(label)
                if tranches:
                    break

        elif suffix == ".ods":
            from odf.opendocument import load as ods_load
            from odf.table import Table, TableRow, TableCell
            from odf.text import P
            doc = ods_load(file_path)
            for sheet in doc.spreadsheet.getElementsByType(Table):
                row_count = 0
                for row in sheet.getElementsByType(TableRow):
                    if row_count >= 10:
                        break
                    row_count += 1
                    for cell in sheet.getElementsByType(TableCell):
                        cell_text = ""
                        for p in cell.getElementsByType(P):
                            cell_text += p.firstChild.data if p.firstChild else ""
                        cell_text = cell_text.strip()
                        if _TRANCHE_HEADER.search(cell_text) and 3 < len(cell_text) < 80:
                            label = cell_text[:60]
                            if label not in tranches:
                                tranches.append(label)
                if tranches:
                    break
    except Exception as e:
        logger.debug(f"Tranche detection failed for {file_path}: {e}")

    return tranches[:8]  # Cap at 8 tranches


# ─── Excel single-sheet cell content scan ─────────────────────────────────────

def _scan_excel_cell_content_for_lots(file_path: str, sheet_names: List[str]) -> List[LotDetection]:
    """Scan Excel cell content for embedded lot patterns (≤2 non-ignored sheets)."""
    path = Path(file_path)
    suffix = path.suffix.lower()
    lots: Dict[str, LotDetection] = {}

    try:
        if suffix == ".xlsx":
            import openpyxl
            wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
            for sheet_name in sheet_names:
                if _is_ignored_sheet(sheet_name):
                    continue
                ws = wb[sheet_name]
                row_count = 0
                for row in ws.iter_rows(values_only=True):
                    if row_count >= 500:
                        break
                    row_count += 1
                    for cell_val in list(row)[:4]:
                        if not cell_val:
                            continue
                        cell_str = str(cell_val).strip()
                        if len(cell_str) > 120:
                            continue
                        m = _LOT_CELL_CONTENT.search(cell_str)
                        if m:
                            raw_id = m.group(1)
                            lot_id = _lot_id_from_raw(raw_id)
                            if lot_id not in lots:
                                label = _LOT_CELL_CONTENT.sub('', cell_str).strip(' :—-–')[:60]
                                nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
                                lots[lot_id] = LotDetection(id=lot_id, nom=nom, confidence=65, sources=["excel"])
            wb.close()

        elif suffix == ".xls":
            import xlrd
            wb = xlrd.open_workbook(str(path))
            for sheet_name in sheet_names:
                if _is_ignored_sheet(sheet_name):
                    continue
                try:
                    ws = wb.sheet_by_name(sheet_name)
                except Exception:
                    continue
                for row_idx in range(min(500, ws.nrows)):
                    for col_idx in range(min(4, ws.ncols)):
                        cell_val = ws.cell_value(row_idx, col_idx)
                        if not cell_val:
                            continue
                        cell_str = str(cell_val).strip()
                        if len(cell_str) > 120:
                            continue
                        m = _LOT_CELL_CONTENT.search(cell_str)
                        if m:
                            raw_id = m.group(1)
                            lot_id = _lot_id_from_raw(raw_id)
                            if lot_id not in lots:
                                label = _LOT_CELL_CONTENT.sub('', cell_str).strip(' :—-–')[:60]
                                nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
                                lots[lot_id] = LotDetection(id=lot_id, nom=nom, confidence=65, sources=["excel"])
    except Exception as e:
        logger.debug(f"Excel cell content scan failed for {file_path}: {e}")

    return list(lots.values())


# ─── Excel / ODS sheet detection ──────────────────────────────────────────────

def _sheet_to_detection(sheet_name: str) -> Optional[LotDetection]:
    """Map a single sheet name to a LotDetection, or None if irrelevant."""
    name = sheet_name.strip()
    if not name or _is_ignored_sheet(name):
        return None

    # Explicit "Lot N" / "Lot NA" in sheet name
    m = re.search(r'\blot\s*[nN°]*\s*(\d{1,2}[A-Za-z]?)\b', name, re.IGNORECASE)
    if m:
        raw_id = m.group(1)
        lot_id = _lot_id_from_raw(raw_id)
        label = re.sub(r'(?i)lot\s*[nN°]*\s*[\d]+[a-z]?[\s:\-–—]*', '', name).strip(' :—-–')[:60]
        nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
        return LotDetection(id=lot_id, nom=nom, confidence=85, sources=["excel"])

    # BTP keyword match
    norm = _normalize(name)
    for lot_num, default_label, keywords in BTP_FAMILIES:
        for kw in keywords:
            if kw in norm:
                lot_id = f"lot{lot_num}"
                label = name.strip()[:60] if len(name.strip()) > 3 else default_label
                return LotDetection(id=lot_id, nom=f"Lot {lot_num} — {label}", confidence=70, sources=["excel"])

    # Synthetic fallback
    if len(name) >= 4 and not name.isdigit():
        safe_key = re.sub(r'[^a-z0-9]', '_', _normalize(name))[:20]
        return LotDetection(id=f"lot_sheet_{safe_key}", nom=name[:60], confidence=40, sources=["excel"])

    return None


def detect_lots_from_excel(file_path: str) -> List[Dict]:
    """
    Parse sheet names (and cell content) from an Excel or ODS file.
    AMÉLIORATION 1: supports .xls, .xlsx, .ods
    AMÉLIORATION 3: catches password-protected files with clear warning
    AMÉLIORATION 7: detects tranches in cell headers
    Returns list of dicts {id, nom, confidence, sources, tranches?}.
    """
    path = Path(file_path)
    if not path.exists():
        logger.warning(f"Fichier spreadsheet introuvable : {file_path}")
        return []

    suffix = path.suffix.lower()
    sheet_names: List[str] = []

    # ── Read sheet names ───────────────────────────────────────────────────────
    try:
        if suffix == ".xls":
            import xlrd
            try:
                wb = xlrd.open_workbook(str(path))
                sheet_names = wb.sheet_names()
            except xlrd.biffh.XLRDError as e:
                err_str = str(e).lower()
                if "password" in err_str or "encrypted" in err_str or "workbook" in err_str:
                    logger.warning(f"Fichier Excel protégé par mot de passe : {path.name}")
                    return [{"id": "!!", "nom": "Fichier Excel protégé — ouvrez-le et renvoyez-le sans protection",
                             "confidence": 0, "sources": ["error"]}]
                raise

        elif suffix == ".xlsx":
            import openpyxl
            try:
                wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
                sheet_names = wb.sheetnames
                wb.close()
            except Exception as e:
                err_str = str(e).lower()
                if "password" in err_str or "encrypted" in err_str or "protected" in err_str or "invalid file" in err_str:
                    logger.warning(f"Fichier Excel protégé par mot de passe : {path.name}")
                    return [{"id": "!!", "nom": "Fichier Excel protégé — ouvrez-le et renvoyez-le sans protection",
                             "confidence": 0, "sources": ["error"]}]
                raise

        elif suffix == ".ods":
            sheet_names = _get_ods_sheet_names(file_path)
            if not sheet_names:
                return []

        else:
            return []

    except Exception as e:
        logger.error(f"Erreur lecture spreadsheet {file_path}: {e}")
        return []

    logger.info(f"Spreadsheet {path.name} — onglets: {sheet_names}")

    # ── Strategy A: sheet names ────────────────────────────────────────────────
    lots: Dict[str, LotDetection] = {}
    for sheet in sheet_names:
        det = _sheet_to_detection(sheet)
        if det:
            lots.setdefault(det.id, det)

    # ── Strategy B: cell content scan (≤2 non-ignored sheets) ─────────────────
    non_ignored = [s for s in sheet_names if not _is_ignored_sheet(s)]
    if len(non_ignored) <= 2:
        if suffix == ".ods":
            cell_dets = _scan_ods_cell_content(file_path, sheet_names)
        else:
            cell_dets = _scan_excel_cell_content_for_lots(file_path, sheet_names)
        for det in cell_dets:
            lots.setdefault(det.id, det)

    # ── AMÉLIORATION 7: detect tranches ───────────────────────────────────────
    tranches = _detect_tranches_in_excel(file_path)
    if tranches:
        logger.info(f"Tranches détectées dans {path.name}: {tranches}")
        # Attach tranches to all detected lots from this file
        for det in lots.values():
            det.tranches = tranches

    return [d.to_dict() for d in sorted(lots.values(), key=lambda x: _sort_key(x.id))]


# ─── Text detection ────────────────────────────────────────────────────────────

def _detect_lots_from_rc_text(text: str, doc_type: str) -> List[LotDetection]:
    """Extract lots from document text (RC, CCAP, or any doc with RC markers)."""
    lines = text.splitlines()

    is_rc_content = bool(_RC_MARKER.search(text[:5000]))
    if doc_type in ("rc", "ccap") or is_rc_content:
        scan_lines = lines[:500]
    else:
        scan_lines = lines[:200]

    lots: Dict[str, LotDetection] = {}

    # ── Strategy A : tabular format ────────────────────────────────────────────
    header_idx = None
    for i, line in enumerate(scan_lines):
        if _LOT_TABLE_HEADER.search(line):
            header_idx = i
            logger.debug(f"Tabular lot header at line {i+1}: {line.strip()!r}")
            break

    if header_idx is not None:
        consecutive_misses = 0
        for line in scan_lines[header_idx + 1:]:
            m_num = _LOT_TABLE_ROW_NUM.match(line)
            m_alpha = _LOT_TABLE_ROW_ALPHA.match(line) if not m_num else None

            if m_num or m_alpha:
                consecutive_misses = 0
                m = m_num or m_alpha
                raw_id = m.group(1)
                lot_id = _lot_id_from_raw(raw_id)
                if not lot_id:
                    continue
                label = m.group(2).strip()[:60]
                label = re.sub(r'\s{2,}', ' ', label).strip(' -–—')
                nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
                lots.setdefault(lot_id, LotDetection(id=lot_id, nom=nom, confidence=90, sources=["rc_text"]))
            else:
                if line.strip():
                    consecutive_misses += 1
                    if consecutive_misses >= 3:
                        break

        if lots:
            return list(lots.values())

    # ── Strategy B : inline "Lot N" / "Lot A" pattern ─────────────────────────
    block = "\n".join(scan_lines)
    for m in _LOT_LINE.finditer(block):
        raw = m.group(0).strip()
        raw_id = m.group(1)
        lot_id = _lot_id_from_raw(raw_id)
        if lot_id is None:
            continue
        if lot_id in lots:
            continue

        after_num = re.sub(
            r'(?i)(?:lot|tranche)\s*[nN°]*\s*[\w]+[\s:\-–—]*', '', raw
        ).strip(' :—-–')
        label = re.split(r'[.\n]', after_num)[0].strip()[:60]
        nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
        lots[lot_id] = LotDetection(id=lot_id, nom=nom, confidence=80, sources=["rc_text"])

    return list(lots.values())


# ─── Filename detection ───────────────────────────────────────────────────────

def _detect_lots_from_filenames(filenames: List[str]) -> List[LotDetection]:
    """Detect lots referenced directly in file names (confidence 55)."""
    lots: Dict[str, LotDetection] = {}
    for filename in filenames:
        m = _LOT_FNAME.search(filename)
        if m:
            raw_id = m.group(1)
            lot_id = _lot_id_from_raw(raw_id)
            if lot_id and lot_id not in lots:
                lots[lot_id] = LotDetection(id=lot_id, nom=f"Lot {raw_id}", confidence=55, sources=["filename"])
    return list(lots.values())


# ─── Multi-source merging (AMÉLIORATION 10) ───────────────────────────────────

def _merge_detections(*source_lists: List[LotDetection]) -> List[LotDetection]:
    """
    Merge lot detections from multiple sources.
    AMÉLIORATION 10: picks the most descriptive name (longest label body).
    Confidence: +15 per additional source confirmation (max 100).
    """
    merged: Dict[str, LotDetection] = {}

    for source_list in source_lists:
        for det in source_list:
            if det.id not in merged:
                merged[det.id] = LotDetection(
                    id=det.id,
                    nom=det.nom,
                    confidence=det.confidence,
                    sources=list(det.sources),
                    tranches=list(det.tranches),
                )
            else:
                existing = merged[det.id]
                new_sources = [s for s in det.sources if s not in existing.sources]
                for src in new_sources:
                    existing.sources.append(src)
                    existing.confidence = min(100, existing.confidence + 15)

                # AMÉLIORATION 10: prefer the more descriptive name
                # RC text (rc_text) is preferred over Excel when equal length
                prefer_existing = "rc_text" in existing.sources
                existing.nom = _best_label(existing.nom, det.nom, prefer_a=prefer_existing)

                # Merge tranches
                for t in det.tranches:
                    if t not in existing.tranches:
                        existing.tranches.append(t)

    return sorted(merged.values(), key=lambda x: _sort_key(x.id))


# ─── Main entry point ─────────────────────────────────────────────────────────

def detect_all_lots(
    documents,
    uploads_root: Optional[Path] = None,
    on_progress: Optional[Any] = None,
) -> List[Dict]:
    """
    Analyse ALL document sources and return merged lot detections.

    on_progress(pct, detail) is called at each step to report progress.
    """
    def _report(pct: int, detail: str) -> None:
        if on_progress:
            try:
                on_progress(pct, detail)
            except Exception:
                pass

    # ── Step 1: Scan filenames (0% → 5%) — interpolated per file ───────────
    filenames: List[str] = [doc.file_name for doc in documents]
    total_files = max(len(filenames), 1)
    for i in range(total_files):
        # Smooth ramp 0 → 5 instead of a single 5% jump.
        pct = int(((i + 1) / total_files) * 5)
        _report(pct, "Scan des noms de fichiers...")
    filename_dets = _detect_lots_from_filenames(filenames)

    # ── Step 2: Analyse RC / CCAP / DOCX text (5% → 10%) — per file ────────
    text_dets: List[LotDetection] = []
    docx_docs = [d for d in documents if d.file_name.lower().endswith(".docx")]
    docx_total = max(len(docx_docs), 1)
    if docx_docs:
        for i, doc in enumerate(docx_docs):
            pct = 5 + int(((i + 1) / docx_total) * 5)
            _report(pct, "Analyse du règlement de consultation...")
            doc_type = getattr(doc, 'type', 'autre') or 'autre'
            text_to_scan = ""
            if uploads_root and doc.file_url:
                rel = doc.file_url.removeprefix("/uploads/")
                docx_path = uploads_root / rel
                if docx_path.exists():
                    text_to_scan = _extract_docx_text(docx_path)
            if not text_to_scan and doc.extracted_text:
                text_to_scan = doc.extracted_text
            if text_to_scan:
                dets = _detect_lots_from_rc_text(text_to_scan, doc_type)
                text_dets.extend(dets)
    else:
        # No docx — bridge the gap so the bar still progresses.
        _report(10, "Analyse du règlement de consultation...")

    # ── Step 3: Analyse spreadsheets / DPGF (10% → 20%) — per file ────────
    excel_dets: List[LotDetection] = []
    spreadsheet_docs = [
        d for d in documents
        if d.file_name.lower().endswith((".xls", ".xlsx", ".ods"))
    ]
    excel_total = max(len(spreadsheet_docs), 1)
    if spreadsheet_docs:
        for i, doc in enumerate(spreadsheet_docs):
            pct = 10 + int(((i + 1) / excel_total) * 10)
            _report(pct, "Analyse des DPGF...")
            fname_m = _LOT_FNAME.search(doc.file_name)
            if fname_m:
                raw_id = fname_m.group(1)
                lot_id = _lot_id_from_raw(raw_id)
                if lot_id:
                    excel_dets.append(LotDetection(
                        id=lot_id, nom=f"Lot {raw_id}", confidence=75, sources=["excel"],
                    ))
            if uploads_root and doc.file_url:
                rel = doc.file_url.removeprefix("/uploads/")
                excel_path = uploads_root / rel
                raw = detect_lots_from_excel(str(excel_path))
                for d in raw:
                    excel_dets.append(LotDetection(
                        id=d["id"], nom=d["nom"],
                        confidence=d.get("confidence", 70),
                        sources=d.get("sources", ["excel"]),
                        tranches=d.get("tranches", []),
                    ))
    else:
        _report(20, "Analyse des DPGF...")

    # ── Step 4: Scan PDF content (20% → 95%) ───────────────────────────────
    pdfs_to_scan = []
    for doc in documents:
        fname_lower = doc.file_name.lower()
        if not fname_lower.endswith(".pdf"):
            continue
        doc_type = getattr(doc, 'type', 'autre') or 'autre'
        should_scan = (
            doc_type in ("rc", "ccap")
            or _ANNEXE_FNAME.search(doc.file_name)
            or doc_type == "autre"
        )
        if should_scan:
            pdfs_to_scan.append(doc)

    total_pdfs = len(pdfs_to_scan)
    if total_pdfs == 0:
        _report(90, "Aucun PDF à scanner.")
    for idx, doc in enumerate(pdfs_to_scan):
        # Report on every doc for small DCEs, every 3 for large ones — same
        # rate as before but with a wider range (20→90 instead of 25→90).
        if total_pdfs <= 10 or idx % 3 == 0 or idx == total_pdfs - 1:
            pct = 20 + int((idx / max(total_pdfs, 1)) * 70)
            _report(pct, f"Scan du contenu... {idx + 1}/{total_pdfs} documents")

        doc_type = getattr(doc, 'type', 'autre') or 'autre'
        text_to_scan = doc.extracted_text or ""

        # Placeholder text = no useful content, skip unless key doc
        is_placeholder = text_to_scan.startswith("[document volumineux")
        if is_placeholder and doc_type in ("rc", "ccap"):
            # Key doc with placeholder — re-read from disk (first 10 pages only)
            if uploads_root and doc.file_url:
                rel = doc.file_url.removeprefix("/uploads/")
                pdf_path = uploads_root / rel
                if pdf_path.exists():
                    text_to_scan = _extract_pdf_text_limited(pdf_path, max_pages=10)
        elif is_placeholder:
            continue  # Skip non-key large PDFs entirely

        if text_to_scan and not text_to_scan.startswith("[document volumineux"):
            dets = _detect_lots_from_rc_text(text_to_scan, doc_type)
            text_dets.extend(dets)

    # ── Step 5: Consolidation (95%) ───────────────────────────────────────────
    _report(95, "Consolidation des lots...")
    merged = _merge_detections(excel_dets, text_dets, filename_dets)

    real_lots = [d for d in merged if not d.id.startswith("lot_sheet_")]
    if real_lots:
        merged = real_lots

    return [d.to_dict() for d in merged]


# ─── Class interface ──────────────────────────────────────────────────────────

class LotDetector:
    """Detect construction lots from DCE documents."""

    def detect(self, docs, uploads_root: Optional[Path] = None, on_progress: Optional[Any] = None) -> List[Dict]:
        return detect_all_lots(docs, uploads_root, on_progress=on_progress)
