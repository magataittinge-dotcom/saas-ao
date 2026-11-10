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
import logging

from services.libreoffice_isole import (   # noqa: F401  (noms réexportés : routes et tests)
    DOSSIER_CARLITO,
    PdfConversionError,
    convertir_en_pdf,
    delai_s,
    ecrire_fontconfig as _ecrire_fontconfig,
    soffice_available,
)


logger = logging.getLogger(__name__)


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



# Revue de sécurité (10/11) : un téléchargement de Word ne doit jamais attendre le verrou LibreOffice.
DELAI_NUMEROTATION_S = 20.0   # plafond de la conversion qui numérote le sommaire du Word


def docx_numerote(docx_bytes: bytes) -> bytes:
    """Le Word à télécharger, son sommaire déjà numéroté (passe 1 de `docx_to_pdf`, numéros écrits dans le
    résultat en cache du champ). Word recalcule toujours à l'ouverture (`updateFields`) ou par F9 ; si le
    patron refuse, les numéros sont là. Carlito ayant les métriques de Calibri, la pagination concorde.

    Jamais d'attente : le verrou LibreOffice est essayé SANS attendre (``attente=0``) et la conversion est
    bornée (``DELAI_NUMEROTATION_S``). LibreOffice occupé, absent, trop lent ou en échec : le Word tel quel
    (non numéroté, comme avant), journalisé sans donnée personnelle. Pas de cache : le coût est déjà borné."""
    from services.docx_sommaire import completer_sommaire

    if not soffice_available():
        return docx_bytes
    try:
        pdf = convertir_en_pdf(docx_bytes, ".docx", delai=DELAI_NUMEROTATION_S, attente=0)
    except PdfConversionError as exc:
        logger.info("Word : sommaire non numéroté (LibreOffice %s)", getattr(exc, "raison", "indisponible"))
        return docx_bytes
    except Exception as exc:  # noqa: BLE001 — un téléchargement de Word n'échoue jamais pour le sommaire
        logger.warning("Word : sommaire non numéroté (%s)", type(exc).__name__)
        return docx_bytes
    return completer_sommaire(docx_bytes, pdf) or docx_bytes
