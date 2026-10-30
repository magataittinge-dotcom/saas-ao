"""Rendu d'une page de PDF (ou d'une zone de page) en WebP — socle serveur de « Voir dans le DCE ».

``rendre_page_webp(chemin, page_index, largeur_px, cadrage=None)`` :
- s'exécute dans le processus pdfium (``pdfium_processus.executer`` : plafond de mémoire, délai,
  un à deux processus sur le KVM 2) : l'API ne rend jamais un PDF déposé elle-même ;
- ouvre et aplatit la page exactement comme la lecture du texte (``pdf_lecture.page_aplatie``) ;
- ne dessine pas les champs de formulaire (``may_draw_forms=False``) : ils sont déjà aplatis ;
- respecte la rotation de la page (/Rotate) : l'image est celle que voit l'utilisateur ;
- ``cadrage`` = (x0, y0, x1, y1) en FRACTIONS du cadre de la page rendue, origine en haut à
  gauche (le format des ancres : ``{page, rects en fractions}``) ; ``largeur_px`` est la largeur
  de l'IMAGE rendue (donc de la zone cadrée, pas de la page entière) ;
- refuse au-delà de ``PIXELS_MAX`` pixels (``RenduTropGrand``) AVANT d'allouer le bitmap : un
  PDF dont la page mesure 5 m de côté ne peut pas faire monter la mémoire ;
- WebP par Pillow (HPND), qualité 80.
Une page inexistante lève ``PageHorsBornes`` ; un document illisible, ``PdfIllisible``.
"""
from __future__ import annotations

import io
import math
from typing import Optional, Sequence

from services import pdfium_processus
from services.pdf_lecture import PdfIllisible, page_aplatie

__all__ = ["rendre_page_webp", "RenduRefuse", "PageHorsBornes", "RenduTropGrand",
           "PIXELS_MAX", "LARGEUR_MAX_PX", "DELAI_RENDU_S", "PdfIllisible"]

LARGEUR_MIN_PX = 16
LARGEUR_MAX_PX = 4096
# 16 Mpx = bitmap BGRA de 64 Mo + copie Pillow + encodage : ~200 Mo de pointe, sous le plafond
# du processus pdfium (1,5 Go). Une page A4 à 4096 px de large fait 23 Mpx : refusée ; le
# front demande 800 à 1600 px (page) ou une zone cadrée.
PIXELS_MAX = 16_000_000
DELAI_RENDU_S = 60.0       # un plan vectoriel lourd se rend en ~3 s (mesuré sur Gueux)
QUALITE_WEBP = 80
_FRACTION_MIN = 0.001      # une zone cadrée ne fait pas moins de 0,1 % du cadre


class RenduRefuse(ValueError):
    """Demande de rendu refusée (paramètres invalides ou trop grosse)."""


class PageHorsBornes(RenduRefuse):
    """La page demandée n'existe pas dans le document."""


class RenduTropGrand(RenduRefuse):
    """L'image demandée dépasse ``PIXELS_MAX`` pixels."""


def rendre_page_webp(
    chemin,
    page_index: int,
    largeur_px: int,
    cadrage: Optional[Sequence[float]] = None,
    *,
    attente_s: Optional[float] = None,
) -> bytes:
    """Image WebP de la page ``page_index`` (0 = première). Bloquant : l'appelant asynchrone
    l'enveloppe dans ``asyncio.to_thread``. ``attente_s`` : attente maximale d'un processus pdfium
    libre. Lève ``RenduRefuse`` (dont ``PageHorsBornes`` et ``RenduTropGrand``), ``PdfIllisible``
    ou ``pdfium_processus.TravailPdfiumEchoue``."""
    cadre = _verifier(page_index, largeur_px, cadrage)
    return pdfium_processus.executer(
        _rendre_page, str(chemin), int(page_index), int(largeur_px), cadre,
        delai_s=DELAI_RENDU_S, attente_s=attente_s)


def _verifier(page_index, largeur_px, cadrage) -> tuple[float, float, float, float]:
    """Paramètres contrôlés AVANT d'envoyer quoi que ce soit au processus."""
    if isinstance(page_index, bool) or not isinstance(page_index, int) or page_index < 0:
        raise PageHorsBornes("numéro de page invalide")
    if isinstance(largeur_px, bool) or not isinstance(largeur_px, int) \
            or not LARGEUR_MIN_PX <= largeur_px <= LARGEUR_MAX_PX:
        raise RenduTropGrand(f"largeur hors de {LARGEUR_MIN_PX}–{LARGEUR_MAX_PX} px")
    if cadrage is None:
        return (0.0, 0.0, 1.0, 1.0)
    try:
        x0, y0, x1, y1 = (float(v) for v in cadrage)
    except (TypeError, ValueError):
        raise RenduRefuse("cadrage invalide") from None
    ok = (0.0 <= x0 and x1 <= 1.0 and 0.0 <= y0 and y1 <= 1.0
          and x1 - x0 >= _FRACTION_MIN and y1 - y0 >= _FRACTION_MIN)      # exclut aussi NaN
    if not ok:
        raise RenduRefuse("cadrage hors de la page")
    return (x0, y0, x1, y1)


def _rendre_page(chemin: str, page_index: int, largeur_px: int, cadre: tuple) -> bytes:
    """Exécuté DANS le processus pdfium."""
    x0, y0, x1, y1 = cadre
    try:
        with page_aplatie(chemin, page_index) as (page, _total):
            largeur_pt, hauteur_pt = page.get_size()        # après rotation, en points
            if largeur_pt <= 0 or hauteur_pt <= 0:
                raise PdfIllisible(None, "page sans dimension")
            zone_l, zone_h = largeur_pt * (x1 - x0), hauteur_pt * (y1 - y0)
            echelle = (largeur_px - 0.01) / zone_l       # le ceil de pypdfium2 donne alors largeur_px exactement
            hauteur_px = max(1, math.ceil(zone_h * echelle))      # comme pypdfium2
            if largeur_px * hauteur_px > PIXELS_MAX:
                raise RenduTropGrand(f"{largeur_px}×{hauteur_px} px dépasse {PIXELS_MAX} px")
            image = page.render(
                scale=echelle,
                # (gauche, bas, droite, haut) retirés du cadre, après rotation
                crop=(largeur_pt * x0, hauteur_pt * (1 - y1), largeur_pt * (1 - x1), hauteur_pt * y0),
                may_draw_forms=False,
            ).to_pil()
    except IndexError as e:
        raise PageHorsBornes(str(e)) from None
    try:
        tampon = io.BytesIO()
        image.save(tampon, "WEBP", quality=QUALITE_WEBP, method=4)
        return tampon.getvalue()
    finally:
        image.close()
