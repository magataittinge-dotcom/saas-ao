"""Logo d'une fiche « Mon entreprise » : vérifié par son CONTENU, recréé, stocké hors webroot.

Ce qu'on ne croit jamais : l'extension, le ``content-type`` envoyé par le client, ni les octets magiques
seuls (``upload_validation`` les contrôle en amont, mais un PNG tronqué ou piégé les passe). Ici Pillow décide :

1. ``Image.open`` donne le format RÉEL : PNG ou JPEG, rien d'autre (jamais de SVG, jamais de GIF animé) ;
2. ``verify()`` contrôle la structure du fichier, avant tout décodage de pixels ;
3. garde anti-bombe : dimensions annoncées plafonnées (``MAX_PIXELS``) avant le décodage ;
4. l'image est RECRÉE à partir de ses pixels (``frombytes``) puis encodée en WebP : métadonnées (EXIF, GPS,
   profils, commentaires) perdues, rien du fichier d'origine ne survit ; 512 px au plus sur le grand côté.

Le fichier d'origine n'est jamais conservé. Le WebP reçoit un nom aléatoire sous
``uploads/organizations/<org>/fiches/`` (hors webroot, servi par URL signée à durée limitée avec contrôle
d'appartenance, ``routers/file_serve.py``).
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

from PIL import Image, UnidentifiedImageError

MO = 1024 * 1024
MAX_OCTETS = 2 * MO          # taille maximale du fichier reçu
MAX_COTE = 512               # pixels, grand côté, après réencodage
MAX_PIXELS = 25_000_000      # 5 000 × 5 000 : au-delà, c'est une bombe de décompression, pas un logo
FORMATS_ACCEPTES = ("PNG", "JPEG")


class LogoRefuse(ValueError):
    """Le fichier n'est pas un logo acceptable ; le message est écrit pour l'utilisateur."""


def _ouvrir(octets: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(octets))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise LogoRefuse("Ce fichier n'est pas une image PNG ou JPEG lisible.") from exc
    return image


def verifier(octets: bytes) -> str:
    """Format réel (« PNG » ou « JPEG ») ou ``LogoRefuse``. Ne décode aucun pixel."""
    image = _ouvrir(octets)
    if image.format not in FORMATS_ACCEPTES:
        raise LogoRefuse("Le logo doit être une image PNG ou JPEG.")
    largeur, hauteur = image.size
    if largeur < 1 or hauteur < 1 or largeur * hauteur > MAX_PIXELS:
        raise LogoRefuse("Les dimensions de l'image sont trop grandes pour un logo.")
    try:
        image.verify()                      # structure du fichier ; invalide l'objet
    except Exception as exc:
        raise LogoRefuse("Ce fichier n'est pas une image PNG ou JPEG lisible.") from exc
    return image.format


def reencoder_en_webp(octets: bytes) -> bytes:
    """Logo PNG ou JPEG → WebP recréé (métadonnées perdues, 512 px au plus). ``LogoRefuse`` sinon."""
    format_reel = verifier(octets)
    image = _ouvrir(octets)                 # verify() a invalidé le premier objet
    try:
        image.seek(0)
        image.load()
    except Exception as exc:
        raise LogoRefuse("Ce fichier n'est pas une image PNG ou JPEG lisible.") from exc
    avec_alpha = "A" in image.getbands() or image.mode == "P" and "transparency" in image.info
    mode = "RGBA" if avec_alpha else "RGB"
    source = image.convert(mode)
    propre = Image.frombytes(mode, source.size, source.tobytes())    # aucune métadonnée héritée
    propre.thumbnail((MAX_COTE, MAX_COTE), Image.Resampling.LANCZOS)
    sortie = io.BytesIO()
    if format_reel == "PNG":
        propre.save(sortie, "WEBP", lossless=True, quality=100, method=4)
    else:
        propre.save(sortie, "WEBP", quality=90, method=4)
    return sortie.getvalue()


def en_png(octets: bytes) -> Optional[bytes]:
    """PNG de ce logo, pour un Word (python-docx n'embarque pas le WebP). ``None`` si illisible."""
    try:
        image = Image.open(io.BytesIO(octets))
        if image.format not in (*FORMATS_ACCEPTES, "WEBP") or image.size[0] * image.size[1] > MAX_PIXELS:
            return None
        image.load()
        mode = "RGBA" if "A" in image.getbands() or image.mode == "P" and "transparency" in image.info else "RGB"
        image = image.convert(mode)
        image.thumbnail((MAX_COTE, MAX_COTE), Image.Resampling.LANCZOS)
        sortie = io.BytesIO()
        image.save(sortie, "PNG")
        return sortie.getvalue()
    except Exception:
        return None


def chemin_relatif(url: Optional[str]) -> Optional[str]:
    """« /uploads/organizations/o/fiches/x.webp » → « organizations/o/fiches/x.webp » (stockage local)."""
    if not url or not url.startswith("/uploads/"):
        return None
    return url.removeprefix("/uploads/")


def lire_local(url: Optional[str]) -> Optional[bytes]:
    """Octets du fichier d'un logo stocké en local, ``None`` s'il n'existe pas (ou stockage distant)."""
    from services import file_storage
    rel = chemin_relatif(url)
    if rel is None:
        return None
    racine = file_storage.UPLOADS_ROOT.resolve()
    chemin = (racine / rel).resolve()
    if racine not in chemin.parents or not chemin.is_file():
        return None
    try:
        return chemin.read_bytes()
    except OSError:
        return None


def existe(url: Optional[str]) -> bool:
    from services import file_storage
    rel = chemin_relatif(url)
    if rel is None:
        return False
    racine = file_storage.UPLOADS_ROOT.resolve()
    chemin = (racine / rel).resolve()
    return racine in chemin.parents and chemin.is_file()


def supprimer_local(url: Optional[str]) -> None:
    from services import file_storage
    if existe(url):
        file_storage.FileStorage().delete_local(url)
