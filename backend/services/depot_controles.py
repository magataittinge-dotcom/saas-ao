"""Contrôle du contenu d'un fichier déposé dans une case de « Mon entreprise ».

S'ajoute à `upload_validation.recevoir_fichier` (extension en liste blanche, plafond de taille, octets magiques) :
- PDF : « %PDF- » dès le premier octet (le dépôt du coffre tolère un préambule de 1 024 octets, qu'un exécutable
  polyglotte peut exploiter) ;
- images : Pillow lit l'en-tête (format réel, dimensions) sans décoder un pixel ; un SVG, un fichier tronqué ou une
  bombe de décompression sont refusés ;
- Word/Excel modernes (.docx, .xlsx) : garde anti-bombe de décompression avant toute ouverture, puis la structure
  OOXML attendue ; refusés : une archive quelconque renommée, un paquet qui porte du code (exécutable), une macro
  (vbaProject.bin, type de contenu « macroEnabled »), un contrôle ActiveX, un objet OLE embarqué (embeddings/*.bin), une
  relation vers un modèle (attachedTemplate) ou une ressource externe autre qu'un lien hypertexte ;
- anciens Word/Excel (.doc, .xls, OLE2) : refusés avant d'arriver ici (routers/depot_entreprise.py), quel que soit leur
  contenu : ni macros VBA ni paquets Ole10Native à analyser.
Aucun fichier n'est exécuté ni converti ici. Les refus sont des 415 écrits pour l'utilisateur.
"""
from __future__ import annotations

import re
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


_MAX_PARTIE_XML = 1024 * 1024      # [Content_Types].xml et fichiers .rels : de quelques Ko ; au-delà, refusé
_MAX_RELATIONS = 300                # fichiers .rels lus au plus
_RELATION = re.compile(r"<(?:\w+:)?Relationship\b[^>]*>", re.IGNORECASE)
_TYPE = re.compile(r'\bType\s*=\s*"([^"]*)"', re.IGNORECASE)
_EXTERNE = re.compile(r'\bTargetMode\s*=\s*"External"', re.IGNORECASE)
_MESSAGE_CODE = "Ce fichier contient du code, une macro ou un objet embarqué : il est refusé."


def _controler_ooxml(flux: BinaryIO, extension: str) -> None:
    try:
        flux.seek(0)
        garde_archives.controler_archive_office(flux)
        flux.seek(0)
        with zipfile.ZipFile(flux) as archive:
            noms = [n.lower() for n in archive.namelist()]
            if "[content_types].xml" not in noms or _PARTIE_PRINCIPALE[extension] not in noms:
                raise _pas_le_bon_format()
            _refuser_parties_dangereuses(noms)
            types = _lire_partie(archive, "[Content_Types].xml")
            if "macroenabled" in types.lower():
                raise _refus(_MESSAGE_CODE)
            lues = 0
            for info in archive.infolist():
                if not info.filename.lower().endswith(".rels"):
                    continue
                lues += 1
                if lues > _MAX_RELATIONS:
                    raise _refus(_MESSAGE_CODE)
                _refuser_relations_dangereuses(_lire_partie(archive, info.filename))
    except garde_archives.ArchiveDemesuree:
        raise _refus("Ce fichier est démesuré une fois ouvert : il est refusé.")
    except (zipfile.BadZipFile, OSError, ValueError, KeyError):
        raise _pas_le_bon_format()
    finally:
        flux.seek(0)


def _refuser_parties_dangereuses(noms: list[str]) -> None:
    for n in noms:
        if (n.endswith(_CODE) or n.endswith("vbaproject.bin") or "/activex/" in n or n.startswith("activex/")
                or ("/embeddings/" in n and n.endswith(".bin")) or n.endswith("oleobject1.bin")):
            raise _refus(_MESSAGE_CODE)


def _lire_partie(archive: zipfile.ZipFile, nom: str) -> str:
    info = archive.getinfo(nom)
    if info.file_size > _MAX_PARTIE_XML:
        raise _refus(_MESSAGE_CODE)
    return archive.read(info).decode("utf-8", errors="replace")


def _refuser_relations_dangereuses(rels: str) -> None:
    """Un modèle attaché (attachedTemplate), un objet OLE ou toute ressource EXTERNE autre qu'un lien hypertexte
    (image distante, cadre, document lié) est refusé ; un lien hypertexte externe est un contenu normal."""
    for relation in _RELATION.findall(rels):
        m = _TYPE.search(relation)
        type_ = (m.group(1) if m else "").rsplit("/", 1)[-1].lower()
        if type_ in ("attachedtemplate", "oleobject", "package", "externallink", "subdocument", "frame"):
            raise _refus(_MESSAGE_CODE)
        if _EXTERNE.search(relation) and type_ != "hyperlink":
            raise _refus(_MESSAGE_CODE)
