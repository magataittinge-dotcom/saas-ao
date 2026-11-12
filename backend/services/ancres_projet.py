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
import threading
import weakref
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Iterator, Optional

from sqlalchemy.orm import Session

from models.compliance_item import ComplianceItem
from models.project import ProjectDocument
from services import file_storage
from services import tableur_ancre
from services.pdf_ancre import VERSION, calculer_ancres
from services.pdf_lecture import PdfIllisible

logger = logging.getLogger(__name__)

DELAI_PAR_PIECE_S = 120      # ouverture + toutes les exigences d'une pièce (Carnet de 17 Mo : ~5 s)
DELAI_TABLEUR_S = 60         # lecture bornée d'un tableur + toutes les exigences de la pièce

__all__ = ["DELAI_PAR_PIECE_S", "DELAI_TABLEUR_S", "ancre_aucune", "calculer_et_stocker", "calculer_pour", "piece_de",
           "chemin_pdf", "chemin_tableur", "trouver_piece"]


# ─── Quelle pièce ? ───────────────────────────────────────────────────────────

_SOURCE_PAGE = re.compile(r"\s*p\.?\s*\d+", re.IGNORECASE)
_ALIAS_RC = ("rc", "règlement de consultation", "reglement de consultation")
_ALIAS_AE = ("ae", "acte d'engagement", "acte_engagement", "attri1", "attri")


def trouver_piece(source_document: Optional[str], pieces: Iterable[ProjectDocument],
                  lot: Optional[str] = None, lots_du_rc=None) -> Optional[ProjectDocument]:
    """La pièce du dossier que cite ``source_document``. Même règle que l'écran
    (``frontend/src/lib/pieceCitee.ts``), précédée du nom de fichier exact (l'ancrage écrit
    le nom du fichier). Jamais de repli sur « la première pièce » : None si rien ne colle.
    ``lot`` (celui de l'exigence) : un nom générique (« DPGF », « CCTP ») se cherche parmi les
    pièces de ce lot et les pièces communes, jamais dans celles d'un autre lot (recette finale :
    une exigence du lot 05 sourcée « DPGF » ouvrait la DPGF du lot 01b)."""
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
    if lot and lot not in ("_commun", "all"):
        from services.document_tagger import get_documents_for_lot
        pieces = get_documents_for_lot(pieces, lot, lots_du_rc)
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


def chemin_tableur(piece: ProjectDocument) -> Optional[Path]:
    """Le tableur (.xlsx, .xlsm, .xls, .ods) de cette pièce, s'il est sur le disque, sous uploads/."""
    if not tableur_ancre.est_tableur(piece.file_url):
        return None
    racine = file_storage.UPLOADS_ROOT.resolve()
    chemin = (file_storage.UPLOADS_ROOT / piece.file_url.removeprefix("/uploads/").lstrip("/")).resolve()
    return chemin if racine in chemin.parents and chemin.is_file() else None


def _lots_du_rc(db: Session, project_id: str) -> list:
    """Ids des lots du RC (« lot1 »…) : les sous-lots « 01a » s'y rattachent (document_tagger)."""
    from models.project import Project
    lots = db.query(Project.lots_detectes).filter(Project.id == project_id).scalar() or []
    return [l.get("id") for l in lots if isinstance(l, dict) and l.get("id")]


def piece_de(db: Session, exigence: ComplianceItem) -> Optional[ProjectDocument]:
    pieces = db.query(ProjectDocument).filter(ProjectDocument.project_id == exigence.project_id).all()
    return trouver_piece(exigence.source_document, pieces, exigence.lot, _lots_du_rc(db, exigence.project_id))


def calculer_pour(db: Session, exigence: ComplianceItem, lever: tuple[str, ...] = ()) -> dict[str, int]:
    """Premier clic sur une exigence sans ancre (ancien AO, ou analyse sans calcul) : calcule
    celles de TOUTES les exigences de la même pièce qui n'en ont pas (un seul aller-retour,
    les clics suivants sont gratuits)."""
    pieces = db.query(ProjectDocument).filter(ProjectDocument.project_id == exigence.project_id).all()
    lots = _lots_du_rc(db, exigence.project_id)
    piece = trouver_piece(exigence.source_document, pieces, exigence.lot, lots)
    if piece is None:
        return {}
    # Une seule lecture par pièce : le préchargement envoie plusieurs exigences de la même pièce à la
    # fois ; sans ce verrou chacune relisait toute la pièce. La suivante attend la première au plus le
    # temps d'une place PDFium (5 s par défaut), connexion à la base rendue, puis reçoit le 503
    # « attente » habituel (Retry-After : le front réessaie et trouve l'ancre rangée).
    from services.pdfium_processus import TravailPdfiumEchoue, attente_interactive_s
    cle = (exigence.project_id, piece.id)   # lus avant le commit (qui les expire)
    db.commit()             # rien d'écrit ici : la transaction de lecture rend sa connexion avant d'attendre
    with _verrou_piece(*cle, min(attente_interactive_s(), DELAI_PAR_PIECE_S)) as pris:
        if not pris:
            if "attente" in lever:
                raise TravailPdfiumEchoue("attente", "pièce déjà en calcul")
            return {}
        memes = [e for e in db.query(ComplianceItem).filter(
                     ComplianceItem.project_id == cle[0], ComplianceItem.ancre.is_(None)).all()
                 if trouver_piece(e.source_document, pieces, e.lot, lots) is piece]
        return calculer_et_stocker(db, cle[0], memes, lever)


# Un verrou par pièce en cours de calcul (API à un seul processus : --workers 1). Valeurs faibles :
# l'entrée disparaît dès que plus aucune requête ne tient ni n'attend le verrou.
_verrous_pieces: "weakref.WeakValueDictionary[tuple[str, str], threading.Lock]" = weakref.WeakValueDictionary()
_verrou_registre = threading.Lock()


@contextmanager
def _verrou_piece(project_id: str, piece_id: str, attente_s: float) -> Iterator[bool]:
    """Prend le verrou de calcul de la pièce, en attendant au plus ``attente_s`` ; rend vrai s'il est pris."""
    with _verrou_registre:
        verrou = _verrous_pieces.get((project_id, piece_id))
        if verrou is None:
            verrou = threading.Lock()
            _verrous_pieces[(project_id, piece_id)] = verrou
    pris = verrou.acquire(timeout=max(0.0, attente_s))
    try:
        yield pris
    finally:
        if pris:
            verrou.release()


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
    lots = _lots_du_rc(db, project_id)

    # pièce -> (pièce, chemin, exigences, fonction de calcul, délai) : un PDF passe par PDFium, un
    # tableur par sa lecture bornée (même processus plafonné en mémoire, avec un délai)
    par_piece: dict[str, tuple[ProjectDocument, Path, list[ComplianceItem], object, int]] = {}
    for e in a_faire:
        piece = trouver_piece(e.source_document, pieces, e.lot, lots)
        if piece is None:
            continue
        chemin = chemin_tableur(piece)
        travail = (tableur_ancre.calculer_ancres, DELAI_TABLEUR_S)
        if chemin is None:
            chemin = chemin_pdf(piece)
            travail = (calculer_ancres, DELAI_PAR_PIECE_S)
        if chemin is not None:
            par_piece.setdefault(piece.id, (piece, chemin, [], *travail))[2].append(e)
    db.commit()     # plus de transaction ouverte pendant les calculs

    for piece, chemin, lignes, fonction, delai in par_piece.values():
        bilan["pieces"] += 1
        demandes = [{"id": e.id, "page": e.source_page, "extrait": e.source_excerpt} for e in lignes]
        try:
            ancres = pdfium_processus.executer(fonction, str(chemin), piece.id, demandes, delai_s=delai)
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
                ancre = (tableur_ancre.ancre_aucune(piece.id) if fonction is tableur_ancre.calculer_ancres
                         else ancre_aucune(piece.id))
            e.ancre = ancre
            bilan["ancres"] += 1
            bilan[{"passage": "passage", "page": "page"}.get(ancre["niveau"], "aucune")] += 1
        db.commit()
    logger.info("Ancres du projet %s : %s", project_id, bilan)
    return bilan
