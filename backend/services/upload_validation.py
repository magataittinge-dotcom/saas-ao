"""Validation d'upload coffre-fort (S2.4 — audit sécurité passe 2).

Le coffre-fort reçoit des documents UNITAIRES (attestations, certificats, RIB,
scans) — jamais des archives. On impose donc :

- une **liste blanche d'extensions** (pas de .zip, .exe, …) ;
- un **cap de taille** appliqué EN STREAMING (le `await file.read()` sans borne
  chargeait tout en mémoire → DoS) ;
- un **contrôle du type réel** par *magic bytes* : un exécutable renommé `.pdf`
  ne doit pas entrer au coffre. Pas de dépendance externe — les signatures des
  types autorisés sont vérifiées à la main.

B8 : les mêmes contrôles servent à toutes les routes de dépôt
(`recevoir_fichier`, en fin de module).
"""
from __future__ import annotations

import asyncio
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, FrozenSet, Optional, Tuple

from fastapi import HTTPException, Request, UploadFile

# Un document unique, jamais une archive : .zip / .exe exclus volontairement.
VAULT_ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".png", ".jpg", ".jpeg",
}

# Une attestation / un scan reste petit ; borne haute contre l'abus mémoire/disque.
VAULT_MAX_UPLOAD_SIZE = 50 * 1024 * 1024   # 50 Mo
VAULT_CHUNK_SIZE = 1 * 1024 * 1024         # 1 Mo par chunk (lecture streaming)
VAULT_SPOOL_THRESHOLD = 4 * 1024 * 1024    # spill sur disque au-delà de 4 Mo


def extension_of(filename: str) -> str:
    """Extension en minuscules (avec le point), '' si aucune."""
    name = (filename or "").strip().lower()
    dot = name.rfind(".")
    return name[dot:] if dot != -1 else ""


# Signatures (magic bytes) par famille de type autorisé.
_OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"          # ancien Office (.doc/.xls)
_ZIP_MAGICS = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")  # OOXML (.docx/.xlsx) = ZIP


def sniff_matches_extension(head: bytes, ext: str) -> bool:
    """Vrai si les premiers octets du fichier correspondent à l'extension.

    Empêche l'entrée d'un contenu masqué (ex. PE `MZ` renommé `.pdf`). Seules
    les extensions de la liste blanche sont gérées ; toute autre → False.
    """
    head = head or b""
    if ext == ".pdf":
        # La plupart des outils écrivent `%PDF-` au tout début ; certains
        # insèrent quelques octets de préambule → on tolère dans les 1024 premiers.
        return head[:5] == b"%PDF-" or b"%PDF-" in head[:1024]
    if ext == ".png":
        return head[:8] == b"\x89PNG\r\n\x1a\n"
    if ext in (".jpg", ".jpeg"):
        return head[:3] == b"\xff\xd8\xff"
    if ext in (".docx", ".xlsx", ".xlsm", ".ods", ".zip"):
        # OOXML et OpenDocument sont des archives ZIP.
        return head[:4] in _ZIP_MAGICS
    if ext in (".doc", ".xls"):
        # OOXML (ZIP) accepté aussi : un .doc moderne peut être un conteneur ZIP.
        return head[:8] == _OLE2_MAGIC or head[:4] in _ZIP_MAGICS
    return False


# ─── Dépôt plafonné commun à toutes les routes d'upload (B8) ─────────────────
#
# Avant : logo, import de mémoire, DPGF remplie et trame de candidature
# faisaient `await file.read()` avant tout plafond (aucun pour l'import de
# mémoire) — une requête pouvait monter des centaines de Mo en RAM, alors que
# Nginx accepte 2,2 Go. Ici, sur le modèle du coffre-fort :
#   1. extension en liste blanche (415) ;
#   2. refus par Content-Length, puis par la taille exacte que Starlette a
#      comptée en recevant le fichier (413, rien n'est lu) ;
#   3. copie par morceaux, coupée au plafond, dans un fichier temporaire (RAM
#      puis disque), le tout dans un thread : jamais dans la boucle d'événements ;
#   4. contenu réel contrôlé par octets magiques (415).
#
# Limite connue : FastAPI lit tout le corps multipart AVANT la route (Starlette
# le range sur disque au-delà de 1 Mo par fichier) ; ces contrôles évitent de le
# charger en RAM, pas de le recevoir. Le plafond de réception par route se règle
# dans Nginx (client_max_body_size par location).

MO = 1024 * 1024
# Le corps multipart dépasse le fichier de ses en-têtes de partie et des
# autres champs du formulaire : quelques centaines d'octets en pratique.
_MARGE_MULTIPART = 64 * 1024


@dataclass(frozen=True)
class RegleDepot:
    """Ce qu'une route accepte : extensions, taille maximale, formats annoncés."""
    extensions: FrozenSet[str]
    plafond: int    # octets
    formats: str    # pour les messages : « PNG ou JPG »


class FichierRecu:
    """Fichier reçu et contrôlé : copie bornée, rembobinée. À fermer (`with`)."""

    def __init__(self, flux: BinaryIO, taille: int, extension: str):
        self.flux = flux
        self.taille = taille
        self.extension = extension

    def __enter__(self) -> "FichierRecu":
        return self

    def __exit__(self, *exc) -> None:
        self.flux.close()

    async def octets(self) -> bytes:
        """Tout le contenu (borné par le plafond), lu hors de la boucle."""
        return await asyncio.to_thread(self._lire)

    def _lire(self) -> bytes:
        self.flux.seek(0)
        return self.flux.read()

    async def enregistrer_sous(self, chemin: Path) -> None:
        """Copie sur le disque, hors de la boucle."""
        await asyncio.to_thread(self._copier_vers, chemin)

    def _copier_vers(self, chemin: Path) -> None:
        chemin.parent.mkdir(parents=True, exist_ok=True)
        self.flux.seek(0)
        with open(chemin, "wb") as destination:
            shutil.copyfileobj(self.flux, destination, length=4 * MO)


class _Depassement(Exception):
    pass


def _taille_lisible(octets: int) -> str:
    return f"{octets // MO} Mo" if octets >= MO else f"{max(octets // 1024, 1)} Ko"


def refus_trop_volumineux(plafond: int) -> HTTPException:
    return HTTPException(
        status_code=413, detail=f"Fichier trop volumineux (max {_taille_lisible(plafond)}).")


def copie_plafonnee(source: BinaryIO, plafond: int) -> Tuple[BinaryIO, int, bytes]:
    """(copie rembobinée, taille, 1ers octets) — lit par morceaux et s'arrête
    au premier morceau qui dépasse `plafond` (_Depassement). Bloquant : à
    appeler dans un thread."""
    try:
        source.seek(0)
    except (AttributeError, OSError):
        pass
    copie = tempfile.SpooledTemporaryFile(max_size=VAULT_SPOOL_THRESHOLD, mode="w+b")
    total, tete = 0, b""
    try:
        while True:
            morceau = source.read(VAULT_CHUNK_SIZE)
            if not morceau:
                break
            if not tete:
                tete = morceau[:1024]
            total += len(morceau)
            if total > plafond:
                raise _Depassement()
            copie.write(morceau)
        copie.seek(0)
        return copie, total, tete
    except BaseException:
        copie.close()
        raise


async def recevoir_fichier(
    request: Optional[Request], fichier: UploadFile, regle: RegleDepot,
) -> FichierRecu:
    """Contrôle et copie bornée d'un fichier déposé — voir en tête de section."""
    ext = extension_of(fichier.filename or "")
    if ext not in regle.extensions:
        raise HTTPException(
            status_code=415,
            detail=f"Type de fichier non autorisé : {ext or '(aucune extension)'}. "
                   f"Formats acceptés : {regle.formats}.",
        )
    trop_gros = refus_trop_volumineux(regle.plafond)
    longueur = request.headers.get("content-length") if request is not None else None
    if longueur and longueur.isdigit() and int(longueur) > regle.plafond + _MARGE_MULTIPART:
        raise trop_gros
    if fichier.size is not None and fichier.size > regle.plafond:
        raise trop_gros

    try:
        flux, taille, tete = await asyncio.to_thread(copie_plafonnee, fichier.file, regle.plafond)
    except _Depassement:
        raise trop_gros
    if not sniff_matches_extension(tete, ext):
        flux.close()
        raise HTTPException(
            status_code=415,
            detail="Le contenu du fichier ne correspond pas à son extension. "
                   f"Formats acceptés : {regle.formats}.",
        )
    return FichierRecu(flux, taille, ext)
