import io
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Extract text from PDF, DOCX, and XLSX files."""

    def extract(
        self,
        content: bytes,
        filename: str,
        max_pages: Optional[int] = None,
        on_page=None,
    ) -> Tuple[str, Optional[int]]:
        """Return (extracted_text, page_count).

        max_pages: if set, only extract text from the first N pages (PDF only).
        on_page: optional callback (pages_done, total_pages) — progression
        RÉELLE intra-document pour les gros PDFs (barre d'upload).
        Always returns a string (never None) — empty string on failure.
        """
        lower = filename.lower()

        # Non-extractible file types → empty string immediately
        if not any(lower.endswith(ext) for ext in (".pdf", ".docx", ".xlsx", ".xls", ".txt", ".ods")):
            return "", None

        try:
            return self._do_extract(content, lower, max_pages, on_page)
        except Exception as e:
            logger.warning(f"Extraction failed for {filename}: {e}")
            return "", None

    def _do_extract(
        self, content: bytes, lower: str, max_pages: Optional[int], on_page=None
    ) -> Tuple[str, Optional[int]]:
        if lower.endswith(".pdf"):
            return self._extract_pdf(content, max_pages, on_page)
        elif lower.endswith(".docx"):
            return self._extract_docx(content)
        elif lower.endswith((".xlsx", ".xls", ".ods")):
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
