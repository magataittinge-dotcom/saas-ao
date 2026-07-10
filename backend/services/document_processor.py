import io
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Seuil « document scanné » : moins de N caractères par page lue en moyenne
# = pas de couche texte exploitable (PDF image). Déterministe, testé.
_SCANNED_AVG_CHARS_PER_PAGE = 15

_WARN_SCANNED = (
    "Document scanné (aucune couche texte lisible) — "
    "exigences non extraites de ce fichier"
)
_WARN_UNREADABLE = (
    "Document non lisible (fichier corrompu ou format non reconnu) — "
    "texte non extrait de ce fichier"
)
_WARN_DOC = (
    "Format .doc (ancien Word) non pris en charge — texte non extrait : "
    "convertissez ce fichier en PDF ou DOCX"
)


class DocumentProcessor:
    """Extract text from PDF, DOCX, XLSX/XLS (BIFF inclus) files."""

    def extract(
        self,
        content: bytes,
        filename: str,
        max_pages: Optional[int] = None,
        on_page=None,
    ) -> Tuple[str, Optional[int]]:
        """Contrat historique : (extracted_text, page_count).

        Always returns a string (never None) — empty string on failure."""
        text, pages, _warning = self.extract_ex(content, filename, max_pages, on_page)
        return text, pages

    def extract_ex(
        self,
        content: bytes,
        filename: str,
        max_pages: Optional[int] = None,
        on_page=None,
    ) -> Tuple[str, Optional[int], Optional[str]]:
        """(texte, pages, warning) — plus AUCUN échec d'extraction silencieux.

        Le warning est un message UI PAR FICHIER (audit écart #3) : renseigné
        dès qu'un format censé porter du texte n'en a pas livré (scanné,
        corrompu, .doc ancien). None = extraction saine. Ne lève jamais.

        max_pages: if set, only extract text from the first N pages (PDF only).
        on_page: optional callback (pages_done, total_pages) — progression
        RÉELLE intra-document pour les gros PDFs (barre d'upload)."""
        lower = filename.lower()

        # .doc (ancien Word, conteneur OLE2) : accepté à l'upload mais
        # inextrayable sans LibreOffice — signalé, plus jamais silencieux.
        if lower.endswith(".doc"):
            return "", None, _WARN_DOC

        # Types jamais porteurs de texte (images, plans…) → pas de warning.
        if not any(lower.endswith(ext) for ext in (".pdf", ".docx", ".xlsx", ".xls", ".txt", ".ods")):
            return "", None, None

        try:
            text, pages = self._do_extract(content, lower, max_pages, on_page)
        except Exception as e:
            logger.warning(f"Extraction failed for {filename}: {e}")
            return "", None, _WARN_UNREADABLE

        # PDF « scanné » : des pages mais quasi aucun texte → warning explicite.
        if lower.endswith(".pdf") and pages:
            pages_read = min(max_pages, pages) if max_pages else pages
            if len(text.strip()) < _SCANNED_AVG_CHARS_PER_PAGE * max(pages_read, 1):
                return text, pages, _WARN_SCANNED

        return text, pages, None

    def _do_extract(
        self, content: bytes, lower: str, max_pages: Optional[int], on_page=None
    ) -> Tuple[str, Optional[int]]:
        if lower.endswith(".pdf"):
            return self._extract_pdf(content, max_pages, on_page)
        elif lower.endswith(".docx"):
            return self._extract_docx(content)
        elif lower.endswith(".xls"):
            return self._extract_xls_biff(content)
        elif lower.endswith((".xlsx", ".ods")):
            return self._extract_xlsx(content)
        elif lower.endswith(".txt"):
            return self._extract_txt(content)
        return "", None

    def _extract_pdf(
        self, content: bytes, max_pages: Optional[int] = None, on_page=None
    ) -> Tuple[str, Optional[int]]:
        import fitz  # PyMuPDF — 5-10x faster than PyPDF2

        doc = fitz.open(stream=content, filetype="pdf")
        total_pages = len(doc)
        limit = min(max_pages if max_pages else total_pages, total_pages)
        texts = []
        for i in range(limit):
            text = doc[i].get_text()
            if text:
                texts.append(text)
            if on_page is not None:
                try:
                    on_page(i + 1, limit)
                except Exception:
                    pass  # la progression ne casse jamais l'extraction
        doc.close()
        return "\n\n".join(texts), total_pages

    def _extract_docx(self, content: bytes) -> Tuple[str, Optional[int]]:
        from docx import Document

        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs), None

    def _extract_txt(self, content: bytes) -> Tuple[str, Optional[int]]:
        try:
            return content.decode("utf-8", errors="replace"), None
        except Exception:
            return "", None

    def _extract_xls_biff(self, content: bytes) -> Tuple[str, Optional[int]]:
        """Vieux format Excel (BIFF, avant 2007) — xlrd (audit risque #1 :
        openpyxl le rejetait en silence). Fallback openpyxl pour les .xls
        qui sont en réalité des xlsx renommés."""
        try:
            import xlrd

            wb = xlrd.open_workbook(file_contents=content)
            lines = []
            for sheet in wb.sheets():
                for rx in range(sheet.nrows):
                    row_text = "\t".join(
                        str(c.value) for c in sheet.row(rx)
                        if c.value not in (None, "")
                    )
                    if row_text.strip():
                        lines.append(row_text)
            return "\n".join(lines), None
        except Exception:
            return self._extract_xlsx(content)

    def _extract_xlsx(self, content: bytes) -> Tuple[str, Optional[int]]:
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        lines = []
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                row_text = "\t".join(str(c) for c in row if c is not None)
                if row_text.strip():
                    lines.append(row_text)
        return "\n".join(lines), None
