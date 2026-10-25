"""Garde contre les bombes de décompression des fichiers Office.

Un .xlsx, .xlsm, .ods ou .docx est une archive ZIP : quelques Mo sur le disque
peuvent cacher des Go une fois ouverts. openpyxl charge en entier les chaînes
partagées (xl/sharedStrings.xml) et les styles, même en lecture seule ; odfpy
charge tout content.xml ; zipfile charge tout le répertoire de l'archive.

La garde lit ce que l'archive annonce, avant toute ouverture :
  1. la fin de l'archive (nombre d'entrées, taille du répertoire), avant même
     que zipfile ne charge ce répertoire ;
  2. la taille décompressée annoncée de chaque partie XML. zipfile ne lit jamais
     plus que la taille annoncée : un en-tête menteur rend le flux illisible, il
     ne fait pas lire davantage.
Un .xls (BIFF) n'est pas une archive : xlrd le lit en entier, sa taille est bornée.

Mesuré sur les fichiers Office de démonstration (12 distincts, dont les 7 tableurs
et 3 .docx de Gueux) : au plus 20 entrées, 0,01 Mo de chaînes partagées, 0,05 Mo
de styles, 0,32 Mo de XML au total, 0,21 Mo pour le .xls. Les plafonds laissent
passer une DPGF de dizaines de milliers de lignes ; celui des chaînes partagées
borne la mémoire prise par openpyxl (voir le banc du commit).
"""
from __future__ import annotations

import io
import struct
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import BinaryIO, Iterator, Tuple

MO = 1024 * 1024
_MAX_ENTREES = 10_000
_MAX_REPERTOIRE = 4 * MO           # répertoire de l'archive, chargé par zipfile
_MAX_CHAINES_PARTAGEES = 16 * MO   # xl/sharedStrings.xml, chargé en entier par openpyxl
_MAX_STYLES = 8 * MO               # styles.xml, chargé en entier
_MAX_XML = 128 * MO                # toutes les parties XML : le temps de lecture
_MAX_XLS = 64 * MO                 # .xls (BIFF) : lu en entier par xlrd

_FIN = b"PK\x05\x06"
_FIN64_REPERE = b"PK\x06\x07"
_FIN64 = b"PK\x06\x06"


class ArchiveDemesuree(ValueError):
    """Fichier démesuré une fois décompressé : il n'est pas ouvert."""


def _mo(octets: int) -> str:
    return f"{octets / MO:.0f} Mo" if octets >= MO else f"{octets // 1024} Ko"


@contextmanager
def _flux(source) -> Iterator[BinaryIO]:
    if isinstance(source, (bytes, bytearray)):
        yield io.BytesIO(source)
    elif isinstance(source, (str, Path)):
        with open(source, "rb") as f:
            yield f
    else:
        position = source.tell()
        try:
            yield source
        finally:
            source.seek(position)


def _fin_d_archive(f: BinaryIO) -> Tuple[int, int]:
    """(nombre d'entrées, taille du répertoire) annoncés par la fin de l'archive,
    lus sans charger le répertoire (même recherche que zipfile, ZIP64 compris)."""
    entrees, repertoire, _debut = _fin_et_repertoire(f)
    return entrees, repertoire


def _fin_et_repertoire(f: BinaryIO) -> Tuple[int, int, int]:
    """(entrées, taille du répertoire, position du répertoire). Le répertoire
    précède la fin d'archive (ou l'enregistrement ZIP64) : sa position en est
    déduite, comme zipfile, même si des octets précèdent l'archive."""
    f.seek(0, 2)
    taille = f.tell()
    lu = min(taille, 22 + 65535)
    f.seek(taille - lu)
    queue = f.read(lu)
    i = queue.rfind(_FIN)
    if i < 0 or len(queue) < i + 22:
        raise zipfile.BadZipFile("fin d'archive introuvable")
    position_fin = taille - lu + i
    entrees, repertoire = struct.unpack("<HI", queue[i + 10:i + 16])
    if entrees == 0xFFFF or repertoire == 0xFFFFFFFF:
        j = queue.rfind(_FIN64_REPERE, 0, i)
        if j >= 0 and len(queue) >= j + 16:
            position_64 = taille - lu + j - 56        # l'enregistrement ZIP64 précède son repère
            f.seek(max(position_64, 0))
            enregistrement = f.read(56)
            if enregistrement[:4] != _FIN64:          # repli : la position annoncée par le repère
                (position_64,) = struct.unpack("<Q", queue[j + 8:j + 16])
                f.seek(position_64)
                enregistrement = f.read(56)
            if enregistrement[:4] == _FIN64 and len(enregistrement) >= 48:
                entrees, repertoire = struct.unpack("<QQ", enregistrement[32:48])
                return entrees, repertoire, position_64 - repertoire
    return entrees, repertoire, position_fin - repertoire


def annonce_archive(source) -> Tuple[int, int, int]:
    """(fichiers, octets décompressés annoncés, octets compressés) d'une archive,
    lus dans sa fin et son répertoire, sans zipfile (qui chargerait tout le
    répertoire en mémoire). Répertoire au-delà de _MAX_REPERTOIRE : refusé avant
    lecture. Les dossiers ne comptent pas comme fichiers."""
    with _flux(source) as f:
        entrees, repertoire, debut = _fin_et_repertoire(f)
        if repertoire > _MAX_REPERTOIRE:
            raise ArchiveDemesuree(
                f"répertoire de l'archive démesuré ({_mo(repertoire)}, {entrees} entrées ; "
                f"au plus {_mo(_MAX_REPERTOIRE)})")
        f.seek(max(debut, 0))
        cd = f.read(repertoire)
    fichiers = decompresse = compresse = 0
    i = 0
    while i + 46 <= len(cd) and cd[i:i + 4] == b"PK\x01\x02":
        comp, decomp = struct.unpack_from("<II", cd, i + 20)
        long_nom, long_extra, long_comm = struct.unpack_from("<HHH", cd, i + 28)
        nom = cd[i + 46:i + 46 + long_nom]
        if 0xFFFFFFFF in (comp, decomp):              # tailles ZIP64 dans le champ extra n° 1
            extra = cd[i + 46 + long_nom:i + 46 + long_nom + long_extra]
            j = 0
            while j + 4 <= len(extra):
                ident, long_champ = struct.unpack_from("<HH", extra, j)
                if ident == 1:
                    valeurs, k = extra[j + 4:j + 4 + long_champ], 0
                    if decomp == 0xFFFFFFFF and k + 8 <= len(valeurs):
                        (decomp,) = struct.unpack_from("<Q", valeurs, k)
                        k += 8
                    if comp == 0xFFFFFFFF and k + 8 <= len(valeurs):
                        (comp,) = struct.unpack_from("<Q", valeurs, k)
                    break
                j += 4 + long_champ
        if not nom.endswith(b"/"):
            fichiers += 1
        decompresse += decomp
        compresse += comp
        i += 46 + long_nom + long_extra + long_comm
    return fichiers, decompresse, compresse


def _controler_archive(f: BinaryIO) -> None:
    entrees, repertoire = _fin_d_archive(f)
    if entrees > _MAX_ENTREES or repertoire > _MAX_REPERTOIRE:
        raise ArchiveDemesuree(
            f"archive démesurée ({entrees} entrées, répertoire de {_mo(repertoire)} ; "
            f"au plus {_MAX_ENTREES} entrées)")
    f.seek(0)
    total = 0
    with zipfile.ZipFile(f) as archive:
        for info in archive.infolist():
            nom = info.filename.lower()
            if not nom.endswith((".xml", ".rels")):
                continue   # images, polices : jamais analysées
            total += info.file_size
            if nom.endswith("sharedstrings.xml") and info.file_size > _MAX_CHAINES_PARTAGEES:
                raise ArchiveDemesuree(
                    f"tableur démesuré une fois décompressé (chaînes partagées : "
                    f"{_mo(info.file_size)}, au plus {_mo(_MAX_CHAINES_PARTAGEES)})")
            if nom.endswith("styles.xml") and info.file_size > _MAX_STYLES:
                raise ArchiveDemesuree(
                    f"fichier démesuré une fois décompressé (styles : {_mo(info.file_size)}, "
                    f"au plus {_mo(_MAX_STYLES)})")
    if total > _MAX_XML:
        raise ArchiveDemesuree(
            f"fichier démesuré une fois décompressé ({_mo(total)} de XML, "
            f"au plus {_mo(_MAX_XML)})")


def controler_archive_office(source) -> None:
    """Lève ArchiveDemesuree (ou BadZipFile) avant l'ouverture d'un .docx, .xlsx,
    .xlsm ou .ods démesuré. `source` : chemin, octets ou fichier binaire."""
    with _flux(source) as f:
        _controler_archive(f)


def controler_tableur(source) -> None:
    """Comme controler_archive_office ; un tableur qui n'est pas une archive
    (.xls BIFF) est borné en taille, car xlrd le lit en entier."""
    with _flux(source) as f:
        signature = f.read(2)
        f.seek(0)
        if signature == b"PK":
            _controler_archive(f)
            return
        f.seek(0, 2)
        if f.tell() > _MAX_XLS:
            raise ArchiveDemesuree(f"tableur démesuré ({_mo(f.tell())}, au plus {_mo(_MAX_XLS)})")
