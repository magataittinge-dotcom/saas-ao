import logging
from pathlib import Path

from services import libreoffice_isole
from services.libreoffice_isole import PdfConversionError

logger = logging.getLogger(__name__)


class PdfConverter:
    """Convertit les fichiers DOCX, XLSX, DOC, XLS en PDF via LibreOffice (services/libreoffice_isole.py :
    profil jetable, environnement minimal, une conversion à la fois, délai, plafond de mémoire, sans réseau)."""

    CONVERTIBLE_EXTENSIONS = {'.docx', '.doc', '.xlsx', '.xls', '.odt', '.ods', '.pptx', '.ppt'}

    @staticmethod
    def can_convert(filename: str) -> bool:
        ext = Path(filename).suffix.lower()
        return ext in PdfConverter.CONVERTIBLE_EXTENSIONS

    @staticmethod
    def convert_to_pdf(source_path: Path, output_dir: Path) -> Path | None:
        """
        Convertit un fichier déposé en PDF (``<nom sans extension>.pdf`` dans ``output_dir``).
        Retourne le Path du PDF généré, ou None si échec (cause journalisée, jamais de contenu).
        Travail de fond : attend sa place jusqu'à ``SYNORIX_LIBREOFFICE_ATTENTE_DEPOT_S``.
        """
        source_path = Path(source_path)
        if not source_path.exists():
            logger.error("Fichier source introuvable pour la conversion PDF")
            return None
        try:
            taille = source_path.stat().st_size
            return libreoffice_isole.convertir_en_pdf(
                source_path, source_path.suffix,
                Path(output_dir) / (source_path.stem + ".pdf"),
                delai=libreoffice_isole.delai_depot_s(taille),
                attente=libreoffice_isole.attente_depot_s(),
            )
        except PdfConversionError as e:
            logger.error("Conversion PDF d'un fichier déposé impossible (%s)", e.raison)
            return None
        except Exception as e:  # noqa: BLE001 — un travail de fond ne lève jamais
            logger.error("Erreur conversion PDF : %s", type(e).__name__)
            return None

    @staticmethod
    def convert_bytes_to_pdf(content: bytes, filename: str, output_dir: Path) -> Path | None:
        """Convertit des octets en PDF ; retourne le Path du PDF (``<nom>.pdf``), ou None."""
        try:
            pdf = libreoffice_isole.convertir_en_pdf(
                content, Path(filename).suffix or ".docx",
                Path(output_dir) / (Path(filename).stem + ".pdf"),
                delai=libreoffice_isole.delai_depot_s(len(content)),
                attente=libreoffice_isole.attente_depot_s(),
            )
            return pdf
        except PdfConversionError as e:
            logger.error("Conversion PDF impossible (%s)", e.raison)
            return None
