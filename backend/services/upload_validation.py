"""Validation d'upload coffre-fort (S2.4 — audit sécurité passe 2).

Le coffre-fort reçoit des documents UNITAIRES (attestations, certificats, RIB,
scans) — jamais des archives. On impose donc :

- une **liste blanche d'extensions** (pas de .zip, .exe, …) ;
- un **cap de taille** appliqué EN STREAMING (le `await file.read()` sans borne
  chargeait tout en mémoire → DoS) ;
- un **contrôle du type réel** par *magic bytes* : un exécutable renommé `.pdf`
  ne doit pas entrer au coffre. Pas de dépendance externe — les signatures des
  types autorisés sont vérifiées à la main.
"""
from __future__ import annotations

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
    if ext in (".docx", ".xlsx"):
        return head[:4] in _ZIP_MAGICS
    if ext in (".doc", ".xls"):
        # OOXML (ZIP) accepté aussi : un .doc moderne peut être un conteneur ZIP.
        return head[:8] == _OLE2_MAGIC or head[:4] in _ZIP_MAGICS
    return False
