import re
import unicodedata
import logging
from itertools import islice
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
# Une lettre suivie d'un tiret est un titre de rubrique de formulaire
# (« D - Présentation du candidat » du DC1), pas une ligne du tableau des lots.
_LOT_TABLE_ROW_ALPHA = re.compile(r'^\s*([A-Z])\s{1,6}(?![-–—])(\S.{1,80})')
# Inline lot patterns with letter support (AMÉLIORATION 6)
# \b après lot : « PAR LOTS SEPARES » ne doit pas se décomposer en
# « Lot » + « S » (fantôme « Lot S » constaté sur le RC Gueux).
# Une tranche (ferme, optionnelle) n'est PAS un lot : deux notions distinctes.
_LOT_LINE = re.compile(
    r'(?:^|[\s\-–—:])lot\b\s*[nN°]*\s*(\d{1,2}(?:\.\d{1,2})?[A-Za-z]?|[A-Za-z])\b[^\n]{0,80}',
    re.IGNORECASE | re.MULTILINE,
)
# Tableau PDF aplati VERTICALEMENT (format réel RC Gueux) :
#   LOT ⏎ INTITULE ⏎ 01 ⏎ Démolition… ⏎ 02 ⏎ Etanchéité…
_LOT_NUM_ALONE = re.compile(r'^\s*(\d{1,2})\s*$')
# Un document général n'est JAMAIS un lot (bug réel : « Lot 00 — ANNEXE AUX
# PRESCRIPTIONS COMMUNES GÉNÉRALES » détecté depuis un titre de CCTP).
_NOT_A_LOT_LABEL = re.compile(
    r'annexe|prescriptions?\s+communes?|g[eé]n[eé]ralit[eé]s',
    re.IGNORECASE,
)
# Colonne d'index de révision des prix accolée à l'intitulé. Le tableau des lots
# du CCAP, lu rangée par rangée sur une seule ligne (pdfium), donne
# « 02 - Etanchéité - Couverture BT 49 », « 08 - Peinture – Sol souple 50% BT 46
# + 50% BT10 » : ce libellé, plus long que celui du RC, gagnait la fusion
# (_best_label garde le plus long). Index BT (bâtiment) ou TP (travaux publics) :
# sigle en capitales, numéro, suffixe éventuel (BT16b, TP10a), part en % éventuelle.
_INDEX_REVISION = (
    r'(?:\d{1,3}(?:[.,]\d+)?\s*%\s*)?(?:(?i:index|indice)\s+)?'
    r'(?<![^\W\d_])(?:BT|TP)\s*\d{1,2}[a-z]?'
)
_COLONNE_INDEX = re.compile(
    rf'[\s\-–—:(]*{_INDEX_REVISION}(?:\s*(?:[+/,&]|et)\s*{_INDEX_REVISION})*[\s)]*$'
)
# Formule de signature « A Paris, le 12 mars 2026 », « À Lyon le … » : jamais une ligne de lot.
_LIEU_DATE = re.compile(r'^\s*[AÀà]\s+\S.{0,40}?,?\s+le\s+\d', re.IGNORECASE)
_RC_MARKER = re.compile(
    r'r[eè]glement\s+de\s+la\s+consultation|MARCHE\s+PASSE\s+PAR\s+LOTS|'
    r'alloti|lots\s+s[eé]par[eé]s',
    re.IGNORECASE,
)
# « lot » en début de mot : « îlot A » ou « pilote » ne sont pas un lot.
_LOT_FNAME = re.compile(r'(?<![^\W\d_])lot[\s_\-]*(\d{1,2}(?:\.\d{1,2})?[A-Za-z]?|[A-Za-z](?!\w))', re.IGNORECASE)
_LOT_CELL_CONTENT = re.compile(r'\blot\s*n?°?\s*(\d{1,2}(?:\.\d{1,2})?[A-Za-z]?)\b', re.IGNORECASE)
# Tranche detection in Excel headers (AMÉLIORATION 7)
# Le mot « tranche » est obligatoire : « Ferme type F1 » (charpente) n'est pas une tranche.
_TRANCHE_HEADER = re.compile(
    r'\btranches?\b\s*(?:ferme|optionnel\w*|condition\w*)?',
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
    description_long: str = ""   # 200-char excerpt around the lot heading
    # Confiance du NOM affiché (la fusion garde le nom le mieux sourcé, pas le plus
    # long). None : celle de la détection.
    nom_confidence: Optional[int] = None

    def to_dict(self) -> Dict:
        d: Dict[str, Any] = {
            "id": self.id,
            "nom": self.nom,
            "confidence": self.confidence,
            "sources": list(self.sources),
        }
        if self.tranches:
            d["tranches"] = list(self.tranches)
        if self.description_long:
            d["description_long"] = self.description_long
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
    sous_lot = re.match(r'^(\d{1,2})\.(\d{1,2})$', raw)
    if sous_lot and 1 <= int(sous_lot.group(2)) <= 26:
        return f"lot{sous_lot.group(1).lstrip('0') or '0'}{chr(96 + int(sous_lot.group(2)))}"   # 7.1 → lot7a
    if re.match(r'^\d{1,2}[A-Za-z]?$', raw):
        num = raw.lstrip("0") or "0"
        return f"lot{num}"
    # Single alpha: only accept uppercase (e.g. "Lot A", "Lot B")
    # Reject lowercase like 'n' from "Lot n°4" or 's' from "lots"
    if re.match(r'^[A-Z]$', raw):
        return f"lot{_alpha_to_num(raw)}"
    return None


def _lignes_alpha_valides(lignes: List[tuple]) -> List[tuple]:
    """Lots « par lettres » d'un tableau : seule la plus longue suite de lettres qui
    se suivent (A, B, C…) compte, et au moins deux. Une lettre isolée est un mot :
    « A Paris, le 12 mars 2026 » (signature) n'est pas la ligne du lot A.
    `lignes` : (lettre, ligne, détection) dans l'ordre du texte."""
    meilleure: List[tuple] = []
    courante: List[tuple] = []
    for entree in lignes:
        lettre, ligne = entree[0].upper(), entree[1]
        if _LIEU_DATE.match(ligne):
            continue
        if courante and ord(lettre) == ord(courante[-1][0].upper()) + 1:
            courante.append(entree)
        else:
            courante = [entree]
        if len(courante) > len(meilleure):
            meilleure = list(courante)
    return meilleure if len(meilleure) >= 2 else []


def _sans_colonne_index(libelle: str) -> str:
    """« Etanchéité - Couverture BT 49 » → « Etanchéité - Couverture ».
    À appliquer AVANT la coupe à 60 caractères (sinon « … Metallerie BT 4 »)."""
    return _COLONNE_INDEX.sub('', libelle)


def _has_label_body(nom: str) -> bool:
    """« Lot 06 — Plaquisterie » → True ; « Lot 06 » nu → False."""
    body = re.sub(r'^lot\s*\d+(?:\.\d+)?[a-z]?\s*[—\-–:]?\s*', '', nom or '', flags=re.IGNORECASE).strip()
    return len(body) >= 3


def _best_label(nom_a: str, nom_b: str, prefer_a: bool = True) -> str:
    """
    AMÉLIORATION 10: pick the more descriptive name.
    Strip leading 'Lot XX — ' prefix before comparing length.
    In case of tie, prefer `nom_a` if prefer_a else `nom_b`.
    """
    def _label_body(nom: str) -> str:
        return re.sub(r'^lot\s*\d+(?:\.\d+)?[a-z]?\s*[—\-–:]\s*', '', nom, flags=re.IGNORECASE).strip()

    body_a = _label_body(nom_a)
    body_b = _label_body(nom_b)

    if len(body_b) > len(body_a):
        return nom_b
    if len(body_a) > len(body_b):
        return nom_a
    return nom_a if prefer_a else nom_b


# ─── DOCX text extraction ──────────────────────────────────────────────────────

def _extract_docx_text(path: Path) -> str:
    """Texte d'un .docx : le même que l'extraction au dépôt (B3) — paragraphes
    et tableaux dans l'ordre du document, cellules fusionnées lues une fois,
    cellules séparées par une tabulation."""
    try:
        from services.document_processor import texte_docx
        return texte_docx(path)
    except Exception as e:
        logger.debug(f"Lecture .docx impossible pour {path.name}: {e}")
        return ""


# ─── PDF text extraction (limited pages) (AMÉLIORATION 8) ─────────────────────

def _extract_pdf_text_limited(path: Path, max_pages: int = 30) -> str:
    """Texte des max_pages premières pages d'un PDF, pour la détection des lots : le
    lecteur du dépôt (pypdfium2, services/pdf_lecture), pages non vides jointes."""
    try:
        from services import pdf_lecture
        return "\n".join(t for t in pdf_lecture.lire_pages(path, max_pages=max_pages) if t)
    except Exception:
        # Repli pypdf si PDFium ne lit pas le fichier (PyPDF2 est EOL — S3.6).
        try:
            import pypdf
            with open(str(path), 'rb') as f:
                reader = pypdf.PdfReader(f)
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
    """Return sheet names from an .ods file (lu sans odfpy, bloc 2)."""
    try:
        from services.lecture_ods import onglets_ods
        return [nom for nom, _lignes in onglets_ods(file_path)]
    except Exception as e:
        logger.error(f"Erreur lecture ODS {file_path}: {e}")
        return []


def _scan_ods_cell_content(file_path: str, sheet_names: List[str]) -> List[LotDetection]:
    """Scan ODS cell content for lot patterns (mirrors _scan_excel_cell_content_for_lots)."""
    lots: Dict[str, LotDetection] = {}
    try:
        from services.lecture_ods import onglets_ods

        for name, lignes in onglets_ods(file_path):
            if _is_ignored_sheet(name):
                continue
            for row in islice(lignes, 500):
                for valeur in row[:4]:
                    cell_text = valeur.strip() if isinstance(valeur, str) else ""
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

def _detect_tranches_in_excel(file_path: str, wb=None) -> List[str]:
    """
    Scan first 10 rows of an Excel/ODS for tranche-related column headers.
    Returns list like ["Tranche ferme: Existant école", "Tranche optionnelle: Salle polyvalente"].
    `wb` : classeur déjà ouvert par l'appelant (.xlsx/.xls) — évite de le rouvrir.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    tranches: List[str] = []

    try:
        if suffix == ".xlsx":
            import openpyxl
            ouvert_ici = wb is None
            if ouvert_ici:
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
            if ouvert_ici:
                wb.close()

        elif suffix == ".xls":
            import xlrd
            if wb is None:
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
            # Lu sans odfpy (bloc 2). Les cellules de LA ligne : avant, chaque ligne
            # reparcourait toutes les cellules de l'onglet.
            from services.lecture_ods import onglets_ods
            for _nom, lignes in onglets_ods(file_path):
                for row in islice(lignes, 10):
                    for valeur in row:
                        cell_text = valeur.strip() if isinstance(valeur, str) else ""
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

def _scan_excel_cell_content_for_lots(file_path: str, sheet_names: List[str], wb=None) -> List[LotDetection]:
    """Scan Excel cell content for embedded lot patterns (≤2 non-ignored sheets).
    `wb` : classeur déjà ouvert par l'appelant (.xlsx/.xls) — évite de le rouvrir."""
    path = Path(file_path)
    suffix = path.suffix.lower()
    lots: Dict[str, LotDetection] = {}

    try:
        if suffix == ".xlsx":
            import openpyxl
            ouvert_ici = wb is None
            if ouvert_ici:
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
            if ouvert_ici:
                wb.close()

        elif suffix == ".xls":
            import xlrd
            if wb is None:
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

def _famille(texte: str) -> Optional[int]:
    """Famille de métier (BTP_FAMILIES) d'un intitulé, ou None. Mots entiers : « ite »
    n'est plus trouvé dans « electricite »."""
    norm = _normalize(texte or "")
    for num, _label, keywords in BTP_FAMILIES:
        for kw in keywords:
            fin = r'[a-z]*' if kw.endswith((" ext", " int")) else r'(?:s|x)?(?![a-z0-9])'
            if re.search(rf'(?<![a-z0-9]){re.escape(kw)}{fin}', norm):
                return num
    return None


def _rapprocher_onglets(merged: List["LotDetection"]) -> List["LotDetection"]:
    """Relie un lot désigné par son seul onglet (lot_sheet_*) au lot numéroté du RC qui
    a le même métier, s'il n'y en a qu'un. Par l'intitulé, jamais par le rang."""
    numerotes = [d for d in merged if not d.id.startswith(("lot_sheet_", "lot_nom_"))]
    restants: List[LotDetection] = []
    for d in merged:
        if d.id.startswith("lot_sheet_"):
            fam = _famille(d.nom)
            cible = [n for n in numerotes if fam is not None and _famille(n.nom) == fam]
            if len(cible) == 1:
                for src in d.sources:
                    if src not in cible[0].sources:
                        cible[0].sources.append(src)
                        cible[0].confidence = min(100, cible[0].confidence + 15)
                continue
        restants.append(d)
    return restants


def _sheet_to_detection(sheet_name: str) -> Optional[LotDetection]:
    """Map a single sheet name to a LotDetection, or None if irrelevant."""
    name = sheet_name.strip()
    if not name or _is_ignored_sheet(name):
        return None

    # Explicit "Lot N" / "Lot NA" in sheet name
    m = re.search(r'\blot\s*[nN°]*\s*(\d{1,2}(?:\.\d{1,2})?[A-Za-z]?)\b', name, re.IGNORECASE)
    if m:
        raw_id = m.group(1)
        lot_id = _lot_id_from_raw(raw_id)
        label = re.sub(r'(?i)lot\s*[nN°]*\s*\d+(?:\.\d+)?[a-z]?[\s:\-–—]*', '', name).strip(' :—-–')[:60]
        nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
        return LotDetection(id=lot_id, nom=nom, confidence=85, sources=["excel"])

    # Onglet nommé par un métier (« Electricité », « Plomberie ») : le RANG de la famille
    # BTP n'est pas un numéro de lot (avant : Electricité devenait le lot 5 « Façades »).
    # Lot désigné par son nom ; _rapprocher_onglets le relie au lot du RC qui porte le
    # même métier.
    if _famille(name) is not None:
        safe_key = re.sub(r'[^a-z0-9]', '_', _normalize(name))[:20]
        return LotDetection(id=f"lot_sheet_{safe_key}", nom=name.strip()[:60], confidence=70, sources=["excel"])

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
    try:
        from services.garde_archives import controler_tableur
        controler_tableur(path)   # bombe de décompression : jamais ouverte
    except Exception as e:
        logger.warning(f"Tableur non ouvert pour la détection des lots ({path.name}) : {e}")
        return []

    suffix = path.suffix.lower()
    sheet_names: List[str] = []
    # Classeur ouvert UNE fois et transmis aux scans (avant : 3 ouvertures, soit
    # 3 lectures complètes des chaînes partagées — 44 s sur les 6 DPGF de Gueux).
    wb = None

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

    try:
        # ── Strategy A: sheet names ────────────────────────────────────────────
        lots: Dict[str, LotDetection] = {}
        for sheet in sheet_names:
            det = _sheet_to_detection(sheet)
            if det:
                lots.setdefault(det.id, det)

        # ── Strategy B: cell content scan (≤2 non-ignored sheets) ─────────────
        non_ignored = [s for s in sheet_names if not _is_ignored_sheet(s)]
        if len(non_ignored) <= 2:
            if suffix == ".ods":
                cell_dets = _scan_ods_cell_content(file_path, sheet_names)
            else:
                cell_dets = _scan_excel_cell_content_for_lots(file_path, sheet_names, wb=wb)
            for det in cell_dets:
                lots.setdefault(det.id, det)

        # ── AMÉLIORATION 7: detect tranches ───────────────────────────────────
        tranches = _detect_tranches_in_excel(file_path, wb=wb)
        if tranches:
            logger.info(f"Tranches détectées dans {path.name}: {tranches}")
            # Attach tranches to all detected lots from this file
            for det in lots.values():
                det.tranches = tranches

        return [d.to_dict() for d in sorted(lots.values(), key=lambda x: _sort_key(x.id))]
    finally:
        if suffix == ".xlsx" and wb is not None:
            wb.close()


# ─── Text detection ────────────────────────────────────────────────────────────

_ENTETE_LOT = re.compile(r'^\s*lots?\s*(?:n[°o]?)?\s*$', re.IGNORECASE)
_ENTETE_INTITULE = re.compile(r'^\s*(?:intitul[eé]s?|d[eé]signations?|libell[eé]s?|objet)\b', re.IGNORECASE)


def _entete_vertical(scan_lines: List[str]) -> Optional[int]:
    """Index de la première ligne qui suit l'en-tête « LOT ⏎ INTITULE » (dans l'un ou
    l'autre ordre), ou None. Sans cet en-tête, une suite « 1 ⏎ OBJET… ⏎ 2 ⏎ CONDITIONS… »
    est un sommaire, pas le tableau des lots."""
    for i in range(len(scan_lines) - 1):
        a, b = scan_lines[i], scan_lines[i + 1]
        if (_ENTETE_LOT.match(a) and _ENTETE_INTITULE.match(b)) or \
                (_ENTETE_INTITULE.match(a) and _ENTETE_LOT.match(b)):
            return i + 2
    return None


def _suite_d_intitule(label: str) -> bool:
    """Le libellé se poursuit-il sur la ligne suivante ? Oui s'il finit sur un tiret ou
    un connecteur (« Cloisons – Doublages – »)."""
    return bool(re.search(r'(?:[-–—,/&]|\b(?:et|de|du|des|d|à|en))\s*$', label.strip(), re.IGNORECASE))


def _paires_verticales(scan_lines: List[str]) -> List[tuple]:
    """(numéro, intitulé, index de la ligne du libellé) du tableau « vertical » des lots.

    Conditions : en-tête « LOT / INTITULE » ; numéros qui se suivent (1, 2, 3…), au
    moins trois rangées. Tolère, entre deux rangées, un intitulé sur deux lignes et
    quelques lignes de saut de page (en-tête ou pied de page, numéro de page) : on
    reprend à la rangée suivante."""
    debut = _entete_vertical(scan_lines)
    if debut is None:
        return []
    n = len(scan_lines)

    def rangee(i: int):
        """(numéro, première ligne du libellé) si la ligne i ouvre une rangée."""
        if i + 1 >= n:
            return None
        m = _LOT_NUM_ALONE.match(scan_lines[i])
        nxt = scan_lines[i + 1].strip()
        if m and nxt and not _LOT_NUM_ALONE.match(nxt) and not nxt[0].isdigit() and len(nxt) >= 3:
            return m.group(1), nxt
        return None

    def suivante(i: int, attendu: int):
        """Index de la rangée n° `attendu` dans les 5 lignes à partir de i, ou None."""
        for j in range(i, min(i + 5, n)):
            r = rangee(j)
            if r and int(r[0]) == attendu:
                return j
        return None

    i = debut
    while i < n and rangee(i) is None:
        i += 1   # lignes d'introduction éventuelles entre l'en-tête et la 1re rangée
        if i - debut > 6:
            return []
    pairs: List[tuple] = []
    while i < n:
        r = rangee(i)
        if r is None:
            break
        numero, label = int(r[0]), r[1]
        j = i + 2
        suite = suivante(j, numero + 1)
        if suite is not None and suite > j and _suite_d_intitule(label):
            extra = [l.strip() for l in scan_lines[j:suite] if l.strip()]
            # un intitulé sur deux lignes ; au-delà, ce sont des lignes de saut de page
            if 0 < len(extra) <= 2 and all(not e[0].isdigit() for e in extra):
                label = f"{label} {extra[0]}"
        pairs.append((r[0], label, i + 1))
        if suite is None:
            break
        i = suite
    return pairs if len(pairs) >= 3 else []


def _extract_description_excerpt(text: str, line_idx: int, lines: List[str]) -> str:
    """Take a 250-char excerpt after the line at line_idx.

    Use case: when we just spotted "Lot 5 — Façade" we grab the next ~3
    non-empty lines so the UI can show a hint of the CCTP description
    under the title. Excerpt is stripped to a clean sentence.
    """
    chunks: List[str] = []
    total = 0
    for line in lines[line_idx + 1: line_idx + 12]:
        s = line.strip()
        if not s:
            if chunks:
                break
            continue
        # Skip lines that look like the next lot heading.
        if _LOT_LINE.match(s) or _LOT_TABLE_ROW_NUM.match(s) or _LOT_NUM_ALONE.match(s):
            break
        chunks.append(s)
        total += len(s)
        if total >= 220:
            break
    excerpt = " ".join(chunks).strip()
    if len(excerpt) > 250:
        excerpt = excerpt[:247].rstrip() + "…"
    return excerpt


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
        lignes_alpha: List[tuple] = []   # (lettre, lot, ligne) — validées après coup
        for offset, line in enumerate(scan_lines[header_idx + 1:]):
            line_idx = header_idx + 1 + offset
            m_num = _LOT_TABLE_ROW_NUM.match(line)
            m_alpha = _LOT_TABLE_ROW_ALPHA.match(line) if not m_num else None

            if m_num or m_alpha:
                consecutive_misses = 0
                m = m_num or m_alpha
                raw_id = m.group(1)
                lot_id = _lot_id_from_raw(raw_id)
                if not lot_id:
                    continue
                label = _sans_colonne_index(m.group(2).strip())[:60]
                # tout blanc → une espace : la tabulation entre deux cellules
                # d'un tableau Word (B3) ne reste pas dans l'intitulé
                label = re.sub(r'\s+', ' ', label).strip(' -–—')
                if _NOT_A_LOT_LABEL.search(label):
                    continue  # doc général (annexe, prescriptions communes…)
                nom = f"Lot {raw_id} — {label}" if label else f"Lot {raw_id}"
                description = _extract_description_excerpt(text, line_idx, scan_lines)
                det = LotDetection(
                    id=lot_id, nom=nom, confidence=90,
                    sources=["rc_table", "rc_text"],
                    description_long=description,
                )
                if m_alpha:
                    lignes_alpha.append((raw_id, line, det))
                else:
                    lots.setdefault(lot_id, det)
            else:
                if line.strip():
                    consecutive_misses += 1
                    if consecutive_misses >= 3:
                        break

        for raw_id, _ligne, det in _lignes_alpha_valides(lignes_alpha):
            lots.setdefault(det.id, det)

        if lots:
            return list(lots.values())

    # ── Strategy A2 : tableau aplati VERTICALEMENT (extraction PDF) ────────────
    # Format réel (RC Gueux) : « LOT ⏎ INTITULE ⏎ 01 ⏎ Démolition… » — le
    # numéro et l'intitulé sont sur des lignes séparées.
    for raw_id, label, line_idx in _paires_verticales(scan_lines):
        lot_id = _lot_id_from_raw(raw_id)
        if not lot_id:
            continue
        label = re.sub(r'\s+', ' ', _sans_colonne_index(label.strip()))[:60].strip(' -–—')
        if _NOT_A_LOT_LABEL.search(label):
            continue  # doc général (annexe, prescriptions communes…)
        description = _extract_description_excerpt(text, line_idx, scan_lines)
        lots.setdefault(lot_id, LotDetection(
            id=lot_id, nom=f"Lot {raw_id} — {label}", confidence=90,
            sources=["rc_table", "rc_text"], description_long=description,
        ))
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

        # « Lot 3 et 4 : Menuiseries » : deux lots qui portent la même désignation.
        reste_apres_numero = raw[re.search(re.escape(raw_id), raw).end():]
        suite = _LOT_ET_SUIVANT.match(reste_apres_numero)
        ids_lot = [(raw_id, lot_id)]
        if suite:
            autre = _lot_id_from_raw(suite.group(1))
            if autre and autre != lot_id:
                ids_lot.append((suite.group(1), autre))
            raw = raw[:re.search(re.escape(raw_id), raw).end()] + reste_apres_numero[suite.end():]

        after_num = re.sub(
            r'(?i)lot\s*[nN°]*\s*[\w.]+[\s:\-–—]*', '', raw, count=1
        ).strip(' :—-–')
        label = re.sub(r'\s+', ' ', _sans_colonne_index(re.split(r'(?<!\d)\.(?!\d)|\n', after_num)[0].strip())).strip()[:60]
        if _NOT_A_LOT_LABEL.search(label):
            continue  # doc général (annexe, prescriptions communes…)

        # Pull a description excerpt from the lines after this match.
        match_line_idx = block.count("\n", 0, m.start())
        description = _extract_description_excerpt(text, match_line_idx, scan_lines)

        for rid, lid in ids_lot:
            if lid in lots:
                continue
            nom = f"Lot {rid} — {label}" if label else f"Lot {rid}"
            lots[lid] = LotDetection(
                id=lid, nom=nom, confidence=80, sources=["rc_text"],
                description_long=description,
            )

    if lots:
        return list(lots.values())

    # ── Strategy C : lots désignés par leur seul métier, sans numéro ──────────
    return _lots_sans_numero(scan_lines)


# « Lot 3 et 4 » : la suite « et 4 » après le premier numéro.
_LOT_ET_SUIVANT = re.compile(r'\s+(?:et|&)\s+(\d{1,2}[A-Za-z]?)\b', re.IGNORECASE)

# Ligne de liste : « - Lot Maçonnerie », « Lot Couverture zinc ». Le mot qui suit « Lot »
# doit commencer par une majuscule (un métier), pas par un article ni « unique ».
_LOT_SANS_NUMERO = re.compile(
    r"^[\s\-–—•*·]*(?i:lot)\s+(?!(?i:unique|n\W|\d)\b)([A-ZÀ-ÖØ-Þ][^\n.:;]{2,58})\s*$", re.MULTILINE)
_MOTS_NON_METIER = re.compile(r"^(?:Le|La|Les|De|Du|Des|Un|Une|Voir|Cf|Selon|Concern)", re.IGNORECASE)


def _lots_sans_numero(scan_lines: List[str]) -> List[LotDetection]:
    """« Lot Maçonnerie », « Lot Couverture zinc » listés sans numéro. Deux au moins :
    une mention isolée (« le lot Maçonnerie ») est une phrase, pas une liste de lots.
    L'identifiant vient du métier (lot_nom_<métier>), jamais d'un numéro inventé."""
    trouves: Dict[str, LotDetection] = {}
    for m in _LOT_SANS_NUMERO.finditer("\n".join(scan_lines)):
        label = re.sub(r'\s+', ' ', m.group(1)).strip(' -–—')
        if _MOTS_NON_METIER.match(label) or _NOT_A_LOT_LABEL.search(label):
            continue
        cle = re.sub(r'[^a-z0-9]', '_', _normalize(label))[:30].strip('_')
        if cle:
            trouves.setdefault(f"lot_nom_{cle}", LotDetection(
                id=f"lot_nom_{cle}", nom=f"Lot — {label}", confidence=60, sources=["rc_text"]))
    return list(trouves.values()) if len(trouves) >= 2 else []


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

def _noms_du_rc(dets: List[LotDetection], doc_type: str) -> None:
    """Le règlement de consultation fait foi pour les noms : à confiance égale, son
    libellé prime sur celui du CCAP ou d'une autre pièce."""
    if doc_type == "rc":
        for d in dets:
            d.nom_confidence = d.confidence + 5


def _rang_nom(nom: str, sources: List[str], confiance: int) -> tuple:
    """Rang d'un libellé de lot : (nom qui dit quelque chose, vient du RC, confiance
    de la source). Le plus long ne gagne plus qu'à rang égal : un libellé de CCAP
    ou de cellule qui s'allonge d'une clause ne prend pas la place du tableau du RC."""
    return (_has_label_body(nom), "rc_text" in sources, confiance)


def _merge_detections(*source_lists: List[LotDetection]) -> List[LotDetection]:
    """
    Merge lot detections from multiple sources.
    Nom : celui de la source la mieux classée (voir _rang_nom) ; à rang égal, le
    plus descriptif (libellé le plus long), puis le premier rencontré.
    Confidence: +15 per additional source confirmation (max 100).
    """
    merged: Dict[str, LotDetection] = {}
    rangs: Dict[str, tuple] = {}   # lot → rang du nom retenu

    for source_list in source_lists:
        for det in source_list:
            conf_nom = det.nom_confidence if det.nom_confidence is not None else det.confidence
            rang = _rang_nom(det.nom, det.sources, conf_nom)
            if det.id not in merged:
                merged[det.id] = LotDetection(
                    id=det.id,
                    nom=det.nom,
                    confidence=det.confidence,
                    sources=list(det.sources),
                    tranches=list(det.tranches),
                    description_long=det.description_long,
                    nom_confidence=conf_nom,
                )
                rangs[det.id] = rang
                continue

            existing = merged[det.id]
            for src in det.sources:
                if src not in existing.sources:
                    existing.sources.append(src)
                    existing.confidence = min(100, existing.confidence + 15)

            # Le RC est la SOURCE DE VÉRITÉ des noms (conflit réel : Excel mal
            # étiqueté vs liste officielle du RC) ; à rang égal, le plus
            # descriptif gagne (AMÉLIORATION 10).
            if rang > rangs[det.id]:
                existing.nom, rangs[det.id] = det.nom, rang
                existing.nom_confidence = conf_nom
            elif rang == rangs[det.id]:
                existing.nom = _best_label(existing.nom, det.nom, prefer_a=True)

            # Pick the longest description excerpt across sources.
            if len(det.description_long) > len(existing.description_long):
                existing.description_long = det.description_long

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
    dernier: list = [None]

    def _report(pct: int, detail: str) -> None:
        # Rien de neuf (même pourcentage, même libellé) → pas de rappel : le scan
        # des noms en faisait un par fichier (93 sur Gueux), chacun écrit en base.
        if not on_progress or dernier[0] == (pct, detail):
            return
        dernier[0] = (pct, detail)
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
                _noms_du_rc(dets, doc_type)
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
            _noms_du_rc(dets, doc_type)
            text_dets.extend(dets)

    # ── Step 5: Consolidation (95%) ───────────────────────────────────────────
    _report(95, "Consolidation des lots...")
    merged = _merge_detections(excel_dets, text_dets, filename_dets)

    merged = _rapprocher_onglets(merged)
    real_lots = [d for d in merged if not d.id.startswith(("lot_sheet_", "lot_nom_"))]
    if real_lots:
        merged = real_lots

    return [d.to_dict() for d in merged]


# ─── Nombre de lots ANNONCÉ dans le RC (C3 — déterministe, 0 € API) ───────────

# « divisé en 13 lots », « alloti en 5 lots », « comporte 8 lots »…
_ANNOUNCED_PATTERNS = [
    re.compile(
        r'(?:divis\w+|decompos\w+|allot\w+|repart\w+|compos\w+|decoup\w+|scind\w+)'
        r'\s+en\s+(?P<n>\d{1,2})\s+lots?\b'
    ),
    # « comprend 2 tranches et 4 lots » : le nombre de lots est celui qui suit « et ».
    re.compile(
        r'(?:comporte|comprend|constitue\s+de)\s+(?:\d{1,2}\s+tranches?\s+(?:\w+\s+)?et\s+)?'
        r'(?P<n>\d{1,2})\s+lots?\b'
    ),
    re.compile(r'(?P<n>\d{1,2})\s+lots?\s+(?:suivants|designes|definis|separes|distincts|ci-(?:dessous|apres))\b'),
    # « Allotissement : 5 lots », « décomposition en lots : 6 lots »
    re.compile(r'allotissement\s*[:\-]\s*(?P<n>\d{1,2})\s+lots?\b'),
    re.compile(
        r'(?:decompos\w+|division|repartition|allotissement)\s+en\s+lots?\s*[:\-]\s*(?P<n>\d{1,2})\s+lots?\b'
    ),
]

_ANNOUNCED_MAX = 60  # au-delà, valeur aberrante pour un DCE BTP


def extract_announced_lot_count(text: str) -> Optional[int]:
    """Nombre de lots annoncé dans le texte du RC/CCAP, ou None.

    Purement regex — sert de référence objective pour déclencher (ou non)
    le filet IA : détectés ≠ annoncés = échec objectif de la détection."""
    if not text:
        return None
    norm = _normalize(text)
    for pattern in _ANNOUNCED_PATTERNS:
        m = pattern.search(norm)
        if m:
            count = int(m.group('n'))
            if 1 <= count <= _ANNOUNCED_MAX:
                return count
    return None


def extract_announced_from_docs(documents) -> Optional[int]:
    """Scanne les documents (RC/CCAP en priorité) pour le nombre annoncé."""
    prioritized = sorted(
        documents,
        key=lambda d: 0 if (getattr(d, "type", "") or "") in ("rc", "ccap") else 1,
    )
    for doc in prioritized:
        text = getattr(doc, "extracted_text", None) or ""
        if text.startswith("[document volumineux"):
            continue
        count = extract_announced_lot_count(text)
        if count is not None:
            return count
    return None


# « n'est pas alloti », « marché non alloti », « sans allotissement » : le marché
# n'est PAS alloti. Un seul mot (au plus) sépare la négation du verbe.
_ALLOTISSEMENT_NIE = re.compile(r"\b(?:non|pas|sans|aucun)\s+(?:\w+\s+)?allot\w+")


def mentions_allotissement(text: str) -> bool:
    """Le texte parle-t-il d'un marché alloti ? (déclencheur du filet si 0 lot)
    Un marché « non alloti » ou « lot unique » n'en parle pas : pas d'appel IA."""
    if not text:
        return False
    norm = _ALLOTISSEMENT_NIE.sub(" ", _normalize(text.replace("’", "'")))
    return bool(re.search(r'\ballot\w+|\blots?\s+(?:n\s*°|\d|suivants)\b|\ben\s+\d{1,2}\s+lots?\b', norm))


# ─── Class interface ──────────────────────────────────────────────────────────

class LotDetector:
    """Detect construction lots from DCE documents."""

    def detect(self, docs, uploads_root: Optional[Path] = None, on_progress: Optional[Any] = None) -> List[Dict]:
        return detect_all_lots(docs, uploads_root, on_progress=on_progress)
