import io
from typing import Tuple, Optional


class DocumentProcessor:
    """Extract text from PDF, DOCX, and XLSX files."""

    def extract(self, content: bytes, filename: str) -> Tuple[Optional[str], Optional[int]]:
        """Return (extracted_text, page_count)."""
        lower = filename.lower()
        try:
            if lower.endswith(".pdf"):
                return self._extract_pdf(content)
            elif lower.endswith(".docx"):
                return self._extract_docx(content)
            elif lower.endswith(".xlsx"):
                return self._extract_xlsx(content)
            elif lower.endswith(".txt"):
                return self._extract_txt(content)
            else:
                return None, None
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
