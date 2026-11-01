"""Point d'entrée de l'OCR local (lecture des images et des PDF sans texte).

Aucun moteur n'est installé : `disponible()` renvoie faux, et une image ou un PDF scanné déposé dans une case entre
au coffre-fort avec la mention « lisible seulement avec un OCR ». Aucun appel « vision » à un modèle distant n'est
fait, jamais : le texte des images ne quitte pas le serveur.

Choisir un moteur (RapidOCR, Tesseract…) est une décision d'installation et de licence (poids sur le KVM 2 de
production) : elle n'est pas prise ici. Un moteur futur se branche en remplaçant `disponible` et `lire`.
"""
from __future__ import annotations


class OcrIndisponible(RuntimeError):
    """Aucun moteur OCR n'est installé sur ce serveur."""


def disponible() -> bool:
    return False


def lire(image: bytes) -> str:
    """Texte d'une image (JPEG, PNG ou page de PDF rendue). Lève `OcrIndisponible` tant qu'aucun moteur n'est branché."""
    raise OcrIndisponible("Aucun moteur OCR n'est installé.")
