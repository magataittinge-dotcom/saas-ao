"""
Export PDF du mémoire (C13a) — conversion DOCX → PDF via LibreOffice headless.

Dépendance système : LibreOffice (binaire `soffice`), signalée dans
docs/DEPLOYMENT.md. La conversion elle-même (profil jetable, environnement minimal,
une conversion à la fois entre processus, délai, plafond de mémoire, sans réseau) est
dans `services/libreoffice_isole.py` : ce module ne garde que le sommaire en deux passes.

Absence de LibreOffice, délai ou échec → PdfConversionError dont le message est écrit pour
l'utilisateur ; les appelants dégradent proprement (503 + Retry-After sur l'endpoint,
fallback DOCX dans le ZIP) — jamais de crash.
"""
from services.libreoffice_isole import (   # noqa: F401  (noms réexportés : routes et tests)
    DOSSIER_CARLITO,
    PdfConversionError,
    convertir_en_pdf,
    delai_s,
    ecrire_fontconfig as _ecrire_fontconfig,
    soffice_available,
)


def _convertir(docx_bytes: bytes, timeout: float | None = None) -> bytes:
    """Une conversion DOCX → PDF par LibreOffice headless (une à la fois, isolée)."""
    return convertir_en_pdf(docx_bytes, ".docx", delai=timeout)


def docx_to_pdf(docx_bytes: bytes, timeout: float | None = None) -> bytes:
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
