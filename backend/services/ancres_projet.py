"""Ancres des exigences d'un projet — sujet A (« Voir dans le DCE »), tranches A4 et A5.

``calculer_et_stocker`` calcule l'ancre (``services/pdf_ancre``) de chaque exigence sourcée
d'un projet qui n'en a pas encore, et la range dans ``compliance_items.ancre`` :
- A4, à la fin de l'analyse : toutes les exigences du projet ;
- A5, au premier clic sur un ancien AO : les exigences de la même pièce que celle cliquée.

UN aller-retour par pièce, pas par exigence : le fichier PDF est ouvert une fois dans le
processus PDFium (``services/pdfium_processus``, plafonné en mémoire, avec un délai) et le
calcul de toutes les exigences de la pièce s'y fait d'un trait. Aucun objet PDFium ne
voyage : seuls des ``dict`` reviennent. Une pièce illisible, trop lente ou perdue ne donne
pas d'ancre : l'exigence garde son repli (la page citée), l'analyse n'est jamais cassée.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from models.compliance_item import ComplianceItem
from models.project import ProjectDocument
from services import file_storage
from services.pdf_ancre import VERSION, calculer_ancres
from services.pdf_lecture import PdfIllisible

logger = logging.getLogger(__name__)

DELAI_PAR_PIECE_S = 120      # ouverture + toutes les exigences d'une pièce (Carnet de 17 Mo : ~5 s)

__all__ = ["DELAI_PAR_PIECE_S", "ancre_aucune", "calculer_et_stocker", "calculer_pour", "piece_de", "chemin_pdf", "trouver_piece"]


# ─── Quelle pièce ? ───────────────────────────────────────────────────────────

_SOURCE_PAGE = re.compile(r"\s*p\.?\s*\d+", re.IGNORECASE)
_ALIAS_RC = ("rc", "règlement de consultation", "reglement de consultation")
_ALIAS_AE = ("ae", "acte d'engagement", "acte_engagement", "attri1", "attri")


def trouver_piece(source_document: Optional[str], pieces: Iterable[ProjectDocument]) -> Optional[ProjectDocument]:
    """La pièce du dossier que cite ``source_document``. Même règle que l'écran
    (``frontend/src/lib/pieceCitee.ts``), précédée du nom de fichier exact (l'ancrage écrit
    le nom du fichier). Jamais de repli sur « la première pièce » : None si rien ne colle."""
    pieces = list(pieces)
    source = (source_document or "").lower().strip()
    if not source:
        return None
    noms = [p for p in pieces if p.file_name and p.file_name.lower() in source]
    if noms:
        return max(noms, key=lambda p: len(p.file_name))
    base = _SOURCE_PAGE.sub("", source).strip()
    if not base:
        return None
    for p in pieces:
        type_, nom = (p.type or "").lower(), (p.file_name or "").lower()
        if (base == type_
                or (base in _ALIAS_RC and (type_ == "rc" or any(m in nom for m in ("règlement", "reglement", "_rc", " rc"))))
                or (base == "cctp" and (type_ == "cctp" or "cctp" in nom))
                or (base == "ccap" and "ccap" in nom)
                or (base == "dpgf" and (type_ in ("dpgf", "dpgf_template") or "dpgf" in nom))
                or (base in _ALIAS_AE and (type_.startswith("acte_engagement") or "engagement" in nom or "attri" in nom))
                or (base in ("dc1", "dc2", "bpu") and base in nom)
                or (base == "cadre de réponse" and "cadre" in nom)
                or (len(base) > 2 and base in nom)):
            return p
    return None


def chemin_pdf(piece: ProjectDocument) -> Optional[Path]:
    """Le PDF à lire pour cette pièce : elle-même si c'est un PDF, sinon son PDF converti
    (Word) ; None si aucun fichier PDF n'existe sur le disque. Toujours sous uploads/."""
    racine = file_storage.UPLOADS_ROOT.resolve()
    for url in (piece.file_url, piece.pdf_preview_url):
        if not url or not url.lower().endswith(".pdf"):
            continue
        chemin = (file_storage.UPLOADS_ROOT / url.removeprefix("/uploads/").lstrip("/")).resolve()
        if racine in chemin.parents and chemin.is_file():
            return chemin
    return None


def piece_de(db: Session, exigence: ComplianceItem) -> Optional[ProjectDocument]:
    pieces = db.query(ProjectDocument).filter(ProjectDocument.project_id == exigence.project_id).all()
    return trouver_piece(exigence.source_document, pieces)


def calculer_pour(db: Session, exigence: ComplianceItem, lever: tuple[str, ...] = ()) -> dict[str, int]:
    """Premier clic sur une exigence sans ancre (ancien AO, ou analyse sans calcul) : calcule
    celles de TOUTES les exigences de la même pièce qui n'en ont pas (un seul aller-retour,
    les clics suivants sont gratuits)."""
    pieces = db.query(ProjectDocument).filter(ProjectDocument.project_id == exigence.project_id).all()
    piece = trouver_piece(exigence.source_document, pieces)
    if piece is None:
        return {}
    memes = [e for e in db.query(ComplianceItem).filter(
                 ComplianceItem.project_id == exigence.project_id, ComplianceItem.ancre.is_(None)).all()
             if trouver_piece(e.source_document, pieces) is piece]
    return calculer_et_stocker(db, exigence.project_id, memes, lever)


def ancre_aucune(doc_id: str) -> dict:
    """L'ancre d'une exigence dont la pièce a été lue sans y trouver ni passage ni page."""
    return {"version": VERSION, "doc_id": doc_id, "page": None, "rotation": 0,
            "rects": [], "niveau": "aucun", "citation": None}


# ─── Calcul et stockage ───────────────────────────────────────────────────────

def calculer_et_stocker(
    db: Session,
    project_id: str,
    exigences: Optional[Iterable[ComplianceItem]] = None,
    lever: tuple[str, ...] = (),
) -> dict[str, int]:
    """Calcule et range l'ancre des exigences sourcées sans ancre (``exigences`` : celles du
    projet par défaut). Bloquant : l'appelant asynchrone l'enveloppe dans ``to_thread``.
    Rend des compteurs ``{pieces, ancres, passage, page, echecs}``. Ne lève jamais pour un
    problème de pièce, sauf ``TravailPdfiumEchoue`` dont la ``raison`` est dans ``lever``
    (« attente », « indisponible » : l'appel HTTP répond alors 503 et le front réessaie)."""
    from services import pdfium_processus

    bilan = {"pieces": 0, "ancres": 0, "passage": 0, "page": 0, "aucune": 0, "echecs": 0}
    if exigences is None:
        exigences = db.query(ComplianceItem).filter(ComplianceItem.project_id == project_id).all()
    a_faire = [e for e in exigences if e.ancre is None and (e.source_excerpt or "").strip()]
    if not a_faire:
        return bilan
    pieces = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()

    par_piece: dict[str, tuple[ProjectDocument, Path, list[ComplianceItem]]] = {}
    for e in a_faire:
        piece = trouver_piece(e.source_document, pieces)
        chemin = chemin_pdf(piece) if piece else None
        if chemin is not None:
            par_piece.setdefault(piece.id, (piece, chemin, []))[2].append(e)
    db.commit()     # plus de transaction ouverte pendant les calculs

    for piece, chemin, lignes in par_piece.values():
        bilan["pieces"] += 1
        demandes = [{"id": e.id, "page": e.source_page, "extrait": e.source_excerpt} for e in lignes]
        try:
            ancres = pdfium_processus.executer(
                calculer_ancres, str(chemin), piece.id, demandes, delai_s=DELAI_PAR_PIECE_S)
        except pdfium_processus.TravailPdfiumEchoue as e:
            if e.raison in lever:
                raise
            logger.warning("Ancres : pièce %s abandonnée (%s)", piece.id, e.raison)
            bilan["echecs"] += 1
            continue
        except (PdfIllisible, OSError) as e:
            logger.warning("Ancres : pièce %s illisible (%s)", piece.id, type(e).__name__)
            bilan["echecs"] += 1
            continue
        except Exception:
            logger.warning("Ancres : pièce %s en échec", piece.id, exc_info=True)
            bilan["echecs"] += 1
            continue
        for e in lignes:
            ancre = ancres.get(e.id)
            if ancre is None:
                # pièce lue, mais ni passage ni page valable : on le range (pas de recalcul à
                # chaque clic) ; l'écran n'a rien à montrer au-delà du texte de l'exigence
                ancre = ancre_aucune(piece.id)
            e.ancre = ancre
            bilan["ancres"] += 1
            bilan[{"passage": "passage", "page": "page"}.get(ancre["niveau"], "aucune")] += 1
        db.commit()
    logger.info("Ancres du projet %s : %s", project_id, bilan)
    return bilan
