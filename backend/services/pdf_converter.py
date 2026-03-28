import subprocess
import tempfile
import shutil
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class PdfConverter:
    """Convertit les fichiers DOCX, XLSX, DOC, XLS en PDF via LibreOffice."""

    CONVERTIBLE_EXTENSIONS = {'.docx', '.doc', '.xlsx', '.xls', '.odt', '.ods', '.pptx', '.ppt'}

    @staticmethod
    def can_convert(filename: str) -> bool:
        ext = Path(filename).suffix.lower()
        return ext in PdfConverter.CONVERTIBLE_EXTENSIONS

    @staticmethod
    def convert_to_pdf(source_path: Path, output_dir: Path) -> Path | None:
        """
        Convertit un fichier en PDF via LibreOffice.
        Retourne le Path du PDF généré, ou None si échec.
        """
        if not source_path.exists():
            logger.error(f"Fichier source introuvable: {source_path}")
            return None

        output_dir.mkdir(parents=True, exist_ok=True)

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_source = Path(tmpdir) / source_path.name
                shutil.copy2(source_path, tmp_source)

                result = subprocess.run(
                    [
                        'libreoffice',
                        '--headless',
                        '--norestore',
                        '--convert-to', 'pdf',
                        '--outdir', str(output_dir),
                        str(tmp_source),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )

                if result.returncode != 0:
                    logger.error(f"LibreOffice conversion failed: {result.stderr}")
                    return None

                pdf_name = tmp_source.stem + '.pdf'
                pdf_path = output_dir / pdf_name

                if pdf_path.exists():
                    logger.info(f"PDF généré: {pdf_path} ({pdf_path.stat().st_size} bytes)")
                    return pdf_path

                # Fallback : chercher par stem dans output_dir
                for f in output_dir.glob("*.pdf"):
                    if f.stem == source_path.stem or f.stem == tmp_source.stem:
                        logger.info(f"PDF trouvé: {f}")
                        return f

                logger.error(f"PDF introuvable après conversion dans {output_dir}")
                return None

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout lors de la conversion de {source_path}")
            return None
        except Exception as e:
            logger.error(f"Erreur conversion PDF: {e}")
            return None

    @staticmethod
    def convert_bytes_to_pdf(content: bytes, filename: str, output_dir: Path) -> Path | None:
        """
        Convertit des bytes en PDF.
        Écrit le fichier temporairement, convertit, retourne le Path du PDF.
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)

        try:
            return PdfConverter.convert_to_pdf(tmp_path, output_dir)
        finally:
            tmp_path.unlink(missing_ok=True)
