"""Page des sources des champs critiques (« L'AO en 30 secondes », bandeau) — R14.

Les champs critiques sont repérés dans le texte extrait du RC/CCAP, qui ne garde pas
les frontières de pages : leur source arrive avec ``page = null`` et « Voir dans le
dossier » ouvrait la pièce entière. Ici, la page est cherchée dans le PDF lui-même
(même moteur que l'ancrage des exigences, processus PDFium plafonné) à partir de
l'extrait cité, puis rangée avec le champ : le clic ouvre la bonne page.

Déterministe, 0 € API. Jamais d'exception : une pièce illisible, absente ou trop lente
laisse la source sans page (le front l'affiche honnêtement, sans promettre de surlignage).
"""
from __future__ import annotations

import copy
import logging
import re
from typing import Optional

from sqlalchemy.orm import Session

from models.project import ProjectDocument
from services import ancres_projet, pdfium_processus
from services.pdf_pages_faits import localiser_pages

logger = logging.getLogger(__name__)

_MARQUE = "page_cherchee"     # version de la recherche faite (trouvée ou non) : pas de nouvel essai à chaque lecture
_VERSION = 2                  # 2 : les pages de sommaire sont écartées (V1) ; 1 (True) : anciennes recherches, à refaire
_TRANSITOIRES = ("attente", "indisponible")


_MOIS = ("janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre",
         "novembre", "decembre")


def _formes_date(iso: object) -> list[str]:
    """« 2027-03-12 » → « 12/03/2027 », « 12 mars 2027 »."""
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(iso or ""))
    if not m:
        return []
    a, mo, j = m.group(1), int(m.group(2)), int(m.group(3))
    return [f"{j:02d}/{mo:02d}/{a}", f"{j} {_MOIS[mo - 1]} {a}"]


def termes_du_fait(cle: str, valeur: object) -> list[str]:
    """Ce qui permet de reconnaître la page où se lit le fait (hors sommaire), tiré de sa valeur."""
    if cle == "criteres" and isinstance(valeur, list):
        return [str(c.get("nom")) for c in valeur if isinstance(c, dict) and c.get("nom")] + ["jugement des offres", "criteres"]
    if cle == "date_limite_remise" and isinstance(valeur, dict):
        return _formes_date(valeur.get("date")) + ["remise des offres", "date limite"]
    if cle == "date_limite_questions":
        return _formes_date(valeur) + ["question"]
    if cle == "visite_site" and isinstance(valeur, dict):
        return ["visite"] + _formes_date(valeur.get("date"))
    if cle == "penalites" and isinstance(valeur, dict):
        return ["penalite", "retard"] + [str(v) for v in (valeur.get("retard"),) if v]
    if cle == "delai_execution" and isinstance(valeur, str):
        return [valeur[:60], "delai d'execution"]
    return []


# Un mot au moins que la page du fait doit contenir (sinon l'extrait vient d'un tableau sans rapport).
_REQUIS = {
    "criteres": ["critere", "jugement"],
    "date_limite_remise": ["date limite", "remise", "reception", "depot"],
    "date_limite_questions": ["question", "renseignement"],
    "visite_site": ["visite"],
    "penalites": ["penalit"],
    "delai_execution": ["delai"],
}


def resoudre_pages(db: Session, project_id: str, fields: dict) -> Optional[dict]:
    """Rend une COPIE des champs avec la page des sources qui n'en avaient pas, ou None si
    rien n'a changé. Bloquant (PDFium) : à appeler depuis une route synchrone."""
    a_chercher: dict[str, list[tuple[str, dict, object]]] = {}
    for cle, champ in (fields or {}).items():
        src = (champ or {}).get("source") if isinstance(champ, dict) else None
        if not (isinstance(src, dict) and (src.get("excerpt") or "").strip() and src.get("document")):
            continue
        marque = src.get(_MARQUE)
        ancienne = marque is not None and marque != _VERSION      # recherche d'avant les sommaires
        if marque != _VERSION and (not src.get("page") or ancienne):
            a_chercher.setdefault(src["document"], []).append((cle, src, champ.get("value")))
    if not a_chercher:
        return None

    resultat = copy.deepcopy(fields)
    pieces = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    change = False
    for nom, lignes in a_chercher.items():
        piece = ancres_projet.trouver_piece(nom, pieces)
        chemin = ancres_projet.chemin_pdf(piece) if piece else None
        pages: dict[str, Optional[int]] = {}
        transitoire = False
        if chemin is not None:
            demandes = [{"id": cle, "extrait": src["excerpt"], "termes": termes_du_fait(cle, valeur),
                         "requis": _REQUIS.get(cle, [])}
                        for cle, src, valeur in lignes]
            try:
                pages = pdfium_processus.executer(
                    localiser_pages, str(chemin), piece.id, demandes,
                    delai_s=ancres_projet.DELAI_PAR_PIECE_S)
            except pdfium_processus.TravailPdfiumEchoue as e:
                transitoire = e.raison in _TRANSITOIRES
                logger.warning("Pages des champs critiques : pièce abandonnée (%s)", e.raison)
            except Exception as e:                   # PdfIllisible, OSError, ...
                logger.warning("Pages des champs critiques : pièce en échec (%s)", type(e).__name__)
        if transitoire:
            continue                                  # on réessaiera à la prochaine lecture
        for cle, _src, _valeur in lignes:
            cible = resultat[cle]["source"]
            page = pages.get(cle)
            cible["page"] = int(page) if page else None
            cible[_MARQUE] = _VERSION
            change = True
    return resultat if change else None
