"""
Export PDF du mémoire (C13a) — conversion DOCX → PDF via LibreOffice headless.

Dépendance système : LibreOffice (binaire `soffice`), signalée dans
docs/DEPLOYMENT.md. Chaque conversion utilise un profil utilisateur
LibreOffice jetable (-env:UserInstallation) : les conversions concurrentes
ne se percutent pas.

Absence de LibreOffice → PdfConversionError avec message clair ; les
appelants dégradent proprement (503 sur l'endpoint, fallback DOCX dans
le ZIP) — jamais de crash.
"""
import logging
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_CONVERT_TIMEOUT_S = 120

# Une seule conversion LibreOffice à la fois (VPS 1 vCPU / 4 Go) : verrou de
# thread pour les threads du même processus, verrou de fichier entre processus
# (plusieurs workers). Le sommaire exige deux conversions par export ; sans
# cette file, deux exports simultanés en lanceraient quatre.
_VERROU_THREAD = threading.Lock()
_FICHIER_VERROU = Path(tempfile.gettempdir()) / "synorix-soffice.lock"


class PdfConversionError(RuntimeError):
    """Conversion DOCX → PDF impossible (LibreOffice absent ou en échec)."""


def _soffice_binary() -> Optional[str]:
    return shutil.which("soffice") or shutil.which("libreoffice")


def soffice_available() -> bool:
    return _soffice_binary() is not None


class _UneConversionALaFois:
    def __enter__(self):
        _VERROU_THREAD.acquire()
        self._fichier = None
        try:
            import fcntl

            self._fichier = open(_FICHIER_VERROU, "a")
            fcntl.flock(self._fichier, fcntl.LOCK_EX)
        except (ImportError, OSError):   # pas de verrou entre processus : celui du processus reste
            if self._fichier is not None:
                self._fichier.close()
                self._fichier = None
        return self

    def __exit__(self, *exc):
        try:
            if self._fichier is not None:
                self._fichier.close()      # ferme et libère le verrou de fichier
        finally:
            _VERROU_THREAD.release()


def _convertir(docx_bytes: bytes, timeout: int) -> bytes:
    """Une conversion DOCX → PDF par LibreOffice headless (une à la fois)."""
    binary = _soffice_binary()
    if binary is None:
        raise PdfConversionError(
            "LibreOffice (soffice) est introuvable — installez-le pour "
            "l'export PDF (cf. docs/DEPLOYMENT.md)."
        )

    with _UneConversionALaFois(), tempfile.TemporaryDirectory(prefix="synorix-pdf-") as tmp:
        tmp_path = Path(tmp)
        docx_path = tmp_path / "memoire.docx"
        docx_path.write_bytes(docx_bytes)
        # Profil LibreOffice jetable : indispensable pour les conversions
        # concurrentes (le profil par défaut est mono-instance).
        profile = tmp_path / f"profile-{uuid.uuid4().hex}"
        cmd = [
            binary, "--headless", "--norestore",
            f"-env:UserInstallation=file://{profile}",
            "--convert-to", "pdf", "--outdir", str(tmp_path), str(docx_path),
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, timeout=timeout, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise PdfConversionError(
                f"Conversion PDF interrompue après {timeout}s."
            ) from exc

        pdf_path = tmp_path / "memoire.pdf"
        if result.returncode != 0 or not pdf_path.exists():
            stderr = (result.stderr or b"").decode(errors="replace")[:300]
            logger.error("soffice a échoué (code %s) : %s", result.returncode, stderr)
            raise PdfConversionError(
                f"LibreOffice n'a pas produit de PDF (code {result.returncode})."
            )
        return pdf_path.read_bytes()


def docx_to_pdf(docx_bytes: bytes, timeout: int = _CONVERT_TIMEOUT_S) -> bytes:
    """Convertit un DOCX (bytes) en PDF (bytes) fidèle via soffice headless.

    Sommaire en deux passes : LibreOffice, sans interface, n'actualise pas un
    champ TOC. Si le Word porte un sommaire, la 1re conversion donne la page de
    chaque titre (signets du PDF), ces numéros sont écrits dans le Word, et une
    2e conversion produit le PDF final. Sans sommaire, ou si les numéros sont
    introuvables, une seule conversion (le PDF reste valable)."""
    from services.docx_sommaire import completer_sommaire

    pdf = _convertir(docx_bytes, timeout)
    docx_final = completer_sommaire(docx_bytes, pdf)
    if docx_final is None:
        return pdf
    return _convertir(docx_final, timeout)
