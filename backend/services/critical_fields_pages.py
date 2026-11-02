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
from typing import Optional

from sqlalchemy.orm import Session

from models.project import ProjectDocument
from services import ancres_projet, pdfium_processus
from services.pdf_ancre import calculer_ancres

logger = logging.getLogger(__name__)

_MARQUE = "page_cherchee"     # la recherche a eu lieu (trouvée ou non) : pas de nouvel essai à chaque lecture
_TRANSITOIRES = ("attente", "indisponible")


def resoudre_pages(db: Session, project_id: str, fields: dict) -> Optional[dict]:
    """Rend une COPIE des champs avec la page des sources qui n'en avaient pas, ou None si
    rien n'a changé. Bloquant (PDFium) : à appeler depuis une route synchrone."""
    a_chercher: dict[str, list[tuple[str, dict]]] = {}
    for cle, champ in (fields or {}).items():
        src = (champ or {}).get("source") if isinstance(champ, dict) else None
        if (isinstance(src, dict) and not src.get("page") and not src.get(_MARQUE)
                and (src.get("excerpt") or "").strip() and src.get("document")):
            a_chercher.setdefault(src["document"], []).append((cle, src))
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
            demandes = [{"id": cle, "page": None, "extrait": src["excerpt"]} for cle, src in lignes]
            try:
                ancres = pdfium_processus.executer(
                    calculer_ancres, str(chemin), piece.id, demandes,
                    delai_s=ancres_projet.DELAI_PAR_PIECE_S)
                pages = {cle: (a or {}).get("page") for cle, a in ancres.items()}
            except pdfium_processus.TravailPdfiumEchoue as e:
                transitoire = e.raison in _TRANSITOIRES
                logger.warning("Pages des champs critiques : pièce abandonnée (%s)", e.raison)
            except Exception as e:                   # PdfIllisible, OSError, ...
                logger.warning("Pages des champs critiques : pièce en échec (%s)", type(e).__name__)
        if transitoire:
            continue                                  # on réessaiera à la prochaine lecture
        for cle, _src in lignes:
            cible = resultat[cle]["source"]
            page = pages.get(cle)
            if page:
                cible["page"] = int(page)
            cible[_MARQUE] = True
            change = True
    return resultat if change else None
