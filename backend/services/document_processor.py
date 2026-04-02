import io
import signal
from typing import Tuple, Optional


class _Timeout(Exception):
    pass


def _timeout_handler(signum, frame):
    raise _Timeout()


class DocumentProcessor:
    """Extract text from PDF, DOCX, and XLSX files."""

    # Skip text extraction for PDFs larger than 2MB (plans, scans)
    MAX_PDF_SIZE_FOR_EXTRACTION = 2 * 1024 * 1024
    # Max seconds for any single extraction
    EXTRACTION_TIMEOUT = 10

    def extract(self, content: bytes, filename: str) -> Tuple[Optional[str], Optional[int]]:
        """Return (extracted_text, page_count)."""
        lower = filename.lower()
        try:
            # Set a timeout so extraction never blocks the server
            old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(self.EXTRACTION_TIMEOUT)
            try:
                result = self._do_extract(content, lower)
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old_handler)
            return result
        except _Timeout:
            return None, None
        except Exception:
            return None, None

    def _do_extract(self, content: bytes, lower: str) -> Tuple[Optional[str], Optional[int]]:
        if lower.endswith(".pdf"):
            if len(content) > self.MAX_PDF_SIZE_FOR_EXTRACTION:
                return self._extract_pdf_metadata_only(content)
            return self._extract_pdf(content)
        elif lower.endswith(".docx"):
            return self._extract_docx(content)
        elif lower.endswith(".xlsx"):
            return self._extract_xlsx(content)
        elif lower.endswith(".txt"):
            return self._extract_txt(content)
        else:
            return None, None

    def _extract_pdf_metadata_only(self, content: bytes) -> Tuple[Optional[str], Optional[int]]:
        """For large PDFs (plans), just get page count."""
        import PyPDF2
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            return None, len(reader.pages)
        except Exception:
            return None, None

    def _extract_pdf(self, content: bytes) -> Tuple[Optional[str], Optional[int]]:
        import PyPDF2

        reader = PyPDF2.PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages), len(reader.pages)

    def _extract_docx(self, content: bytes) -> Tuple[Optional[str], Optional[int]]:
        from docx import Document

        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs), None

    def _extract_txt(self, content: bytes) -> Tuple[Optional[str], Optional[int]]:
        try:
            return content.decode("utf-8", errors="replace"), None
        except Exception:
            return None, None

    def _extract_xlsx(self, content: bytes) -> Tuple[Optional[str], Optional[int]]:
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        lines = []
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                row_text = "\t".join(str(c) for c in row if c is not None)
                if row_text.strip():
                    lines.append(row_text)
        return "\n".join(lines), None
