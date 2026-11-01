"""Contrôle du contenu d'un fichier déposé dans une case de « Mon entreprise ».

S'ajoute à `upload_validation.recevoir_fichier` (extension en liste blanche, plafond de taille, octets magiques) :
- PDF : « %PDF- » dès le premier octet (le dépôt du coffre tolère un préambule de 1 024 octets, qu'un exécutable
  polyglotte peut exploiter) ;
- images : Pillow lit l'en-tête (format réel, dimensions) sans décoder un pixel ; un SVG, un fichier tronqué ou une
  bombe de décompression sont refusés ;
- Word/Excel modernes (.docx, .xlsx) : garde anti-bombe de décompression avant toute ouverture, puis la structure
  OOXML attendue ; refusés : une archive quelconque renommée, un paquet qui porte du code (exécutable), une macro
  (vbaProject.bin, type de contenu « macroEnabled »), un contrôle ActiveX, un objet OLE embarqué (embeddings/*.bin), une
  relation vers un modèle (attachedTemplate) ou une ressource externe autre qu'un lien hypertexte. Le contenu actif se
  détecte par son TYPE (types de contenu et relations, lus comme du XML avec defusedxml : entité, DOCTYPE, XML invalide ou
  encodage illisible = refus), les noms en double (casse comprise) sont refusés, chaque partie est lue par son propre ZipInfo ;
  les noms de parties ne servent que de filet ;
- anciens Word/Excel (.doc, .xls, OLE2) : refusés avant d'arriver ici (routers/depot_entreprise.py), quel que soit leur
  contenu : ni macros VBA ni paquets Ole10Native à analyser.
Aucun fichier n'est exécuté ni converti ici. Les refus sont des 415 écrits pour l'utilisateur.
"""
from __future__ import annotations

import zipfile
from typing import BinaryIO

from defusedxml import ElementTree as DET
from defusedxml.common import DefusedXmlException
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
_MESSAGE_CODE = "Ce fichier contient du code, une macro ou un objet embarqué : il est refusé."
# Types de contenu actifs (sous-chaînes, sans tenir compte de la casse) : macros VBA, ActiveX, objets OLE, formats « macro ».
_TYPES_CONTENU_ACTIFS = ("vbaproject", "activex", "oleobject", "macroenabled")
# Dernier segment du type d'une relation (quel que soit l'espace de noms) qui désigne un contenu actif ou lié.
_RELATIONS_ACTIVES = frozenset(x.lower() for x in (
    "vbaProject", "vbaProjectSignature", "control", "activeXControl", "activeXControlBinary", "oleObject", "package",
    "aFChunk", "attachedTemplate", "subDocument", "frame", "externalLink"))


def _controler_ooxml(flux: BinaryIO, extension: str) -> None:
    try:
        flux.seek(0)
        garde_archives.controler_archive_office(flux)
        flux.seek(0)
        with zipfile.ZipFile(flux) as archive:
            infos = archive.infolist()
            noms = [i.filename.replace("\\", "/").lower() for i in infos]
            if len(set(noms)) != len(noms):         # deux parties de même nom (casse comprise) : l'une cache l'autre
                raise _refus(_MESSAGE_CODE)
            if "[content_types].xml" not in noms or _PARTIE_PRINCIPALE[extension] not in noms:
                raise _pas_le_bon_format()
            _refuser_parties_dangereuses(noms)       # filet : par le nom
            lues = 0
            for info, nom in zip(infos, noms):       # chaque partie est lue par SON ZipInfo, jamais re-cherchée par son nom
                if nom == "[content_types].xml":
                    _refuser_types_de_contenu_actifs(_xml(archive, info))
                elif nom.endswith(".rels"):
                    lues += 1
                    if lues > _MAX_RELATIONS:
                        raise _refus(_MESSAGE_CODE)
                    _refuser_relations_dangereuses(_xml(archive, info))
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


def _xml(archive: zipfile.ZipFile, info: zipfile.ZipInfo):
    """La partie, analysée avec defusedxml (aucune entité, aucun DOCTYPE) ; XML invalide ou encodage illisible : refus."""
    if info.file_size > _MAX_PARTIE_XML:
        raise _refus(_MESSAGE_CODE)
    try:
        return DET.fromstring(archive.read(info), forbid_dtd=True)
    except (DET.ParseError, DefusedXmlException, ValueError, UnicodeError):
        raise _refus(_MESSAGE_CODE)


def _local(balise: str) -> str:
    return balise.rsplit("}", 1)[-1]


def _refuser_types_de_contenu_actifs(racine) -> None:
    for e in racine.iter():
        if _local(e.tag) in ("Default", "Override"):
            type_ = (e.get("ContentType") or "").lower()
            if any(x in type_ for x in _TYPES_CONTENU_ACTIFS):
                raise _refus(_MESSAGE_CODE)


def _refuser_relations_dangereuses(racine) -> None:
    """Un contenu actif ou lié (macro, ActiveX, objet OLE, modèle attaché, document lié, bloc HTML…) est refusé d'après le TYPE de
    la relation ; toute ressource EXTERNE autre qu'un lien hypertexte l'est aussi."""
    for e in racine.iter():
        if _local(e.tag) != "Relationship":
            continue
        dernier = (e.get("Type") or "").rsplit("/", 1)[-1].lower()
        if dernier in _RELATIONS_ACTIVES:
            raise _refus(_MESSAGE_CODE)
        if (e.get("TargetMode") or "").lower() == "external" and dernier != "hyperlink":
            raise _refus(_MESSAGE_CODE)
