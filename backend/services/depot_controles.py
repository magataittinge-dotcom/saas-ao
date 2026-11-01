"""Contrôle du contenu d'un fichier déposé dans une case de « Mon entreprise ».

S'ajoute à `upload_validation.recevoir_fichier` (extension en liste blanche, plafond de taille, octets magiques) :
- PDF : « %PDF- » dès le premier octet (le dépôt du coffre tolère un préambule de 1 024 octets, qu'un exécutable
  polyglotte peut exploiter) ;
- images : Pillow lit l'en-tête (format réel, dimensions) sans décoder un pixel ; un SVG, un fichier tronqué ou une
  bombe de décompression sont refusés ;
- Word/Excel modernes : garde anti-bombe de décompression avant toute ouverture, puis la structure OOXML attendue ;
  une archive quelconque renommée en .docx, ou qui porte du code (exécutable, macro), est refusée ;
- anciens Word/Excel : signature OLE2 (déjà contrôlée), tableur borné en taille.
Aucun fichier n'est exécuté ni converti ici. Les refus sont des 415 écrits pour l'utilisateur.
"""
from __future__ import annotations

import zipfile
from typing import BinaryIO

from fastapi import HTTPException

from services import garde_archives
from services.depot_cases import MESSAGE_FORMAT

MAX_PIXELS = 100_000_000   # une photo ou un scan de 10 000 × 10 000 ; au-delà, ce n'est pas un document
_CODE = (".exe", ".dll", ".bat", ".cmd", ".com", ".scr", ".vbs", ".jar", ".msi", ".ps1", ".sh")
_PARTIE_PRINCIPALE = {".docx": "word/document.xml", ".xlsx": "xl/workbook.xml"}


def _refus(detail: str) -> HTTPException:
    return HTTPException(status_code=415, detail=detail)


def _pas_le_bon_format() -> HTTPException:
    return _refus(MESSAGE_FORMAT)


def controler_contenu(flux: BinaryIO, extension: str, tete: bytes) -> None:
    """Lève une 415 si le contenu n'est pas celui que l'extension annonce, ou s'il est piégé."""
    if extension == ".pdf":
        if tete[:5] != b"%PDF-":
            raise _pas_le_bon_format()
    elif extension in (".png", ".jpg", ".jpeg"):
        _controler_image(flux)
    elif extension in (".docx", ".xlsx"):
        _controler_ooxml(flux, extension)
    elif extension == ".xls":
        try:
            garde_archives.controler_tableur(flux)
        except (garde_archives.ArchiveDemesuree, zipfile.BadZipFile):
            raise _refus("Ce tableur est trop volumineux une fois ouvert.")
        if tete[:4] == b"PK\x03\x04":
            _controler_ooxml(flux, ".xlsx")
    elif extension == ".doc":
        if tete[:4] == b"PK\x03\x04":
            _controler_ooxml(flux, ".docx")
    else:
        raise _pas_le_bon_format()


def _controler_image(flux: BinaryIO) -> None:
    from PIL import Image, UnidentifiedImageError
    try:
        flux.seek(0)
        image = Image.open(flux)
        largeur, hauteur = image.size
        format_reel = image.format
        image.verify()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise _refus("Cette image n'est pas un JPEG ou un PNG lisible.")
    finally:
        flux.seek(0)
    if format_reel not in ("PNG", "JPEG") or largeur < 1 or hauteur < 1 or largeur * hauteur > MAX_PIXELS:
        raise _refus("Cette image n'est pas un JPEG ou un PNG lisible.")


def _controler_ooxml(flux: BinaryIO, extension: str) -> None:
    try:
        flux.seek(0)
        garde_archives.controler_archive_office(flux)
        flux.seek(0)
        with zipfile.ZipFile(flux) as archive:
            noms = [n.lower() for n in archive.namelist()]
    except garde_archives.ArchiveDemesuree:
        raise _refus("Ce fichier est démesuré une fois ouvert : il est refusé.")
    except (zipfile.BadZipFile, OSError, ValueError):
        raise _pas_le_bon_format()
    finally:
        flux.seek(0)
    if "[content_types].xml" not in noms or _PARTIE_PRINCIPALE[extension] not in noms:
        raise _pas_le_bon_format()
    if any(n.endswith(_CODE) or n.endswith("vbaproject.bin") for n in noms):
        raise _refus("Ce fichier contient du code : il est refusé.")
