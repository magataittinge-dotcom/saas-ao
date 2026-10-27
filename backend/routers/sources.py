"""« Voir dans le DCE » côté serveur — sujet A, tranches A5 et A6.

GET /api/sources/{exigence_id}
    L'ancre de la source de l'exigence (page, rotation, rectangles, niveau, citation), calculée
    au premier clic pour un ancien AO puis rangée. Jamais de 500 pour une pièce illisible :
    repli sur la page citée par l'analyse (niveau « page »), ou niveau « aucun ».
GET /api/sources/{exigence_id}/apercu?vue=passage|page&largeur=
    Image WebP : « passage » = loupe recadrée autour des rectangles, « page » = page entière
    (le front pose les rectangles de l'ancre par-dessus).
GET /api/sources/{exigence_id}/tableau
    Tableur (DPGF, BPU, DQE) : l'en-tête et une fenêtre de lignes autour de la ligne citée, en
    texte, tels que le fichier les contient (aucun calcul). Même sécurité ; lecture bornée dans
    le processus plafonné en mémoire et à délai.

Sécurité by-design :
- l'exigence doit appartenir à un projet (non supprimé) de l'organisation de l'utilisateur,
  sinon 404 — indistinguable d'une exigence inexistante ;
- la pièce lue est celle de l'ancre, retrouvée DANS le même projet, et son fichier doit se
  trouver sous uploads/ ; le client ne donne ni chemin, ni texte, ni numéro de page ;
- aucun texte du DCE dans l'URL (B26) ; le PDF n'est jamais réécrit (B17) : on le rend ;
- limite de débit par organisation (rendu = endpoint coûteux) ; largeur bornée et ramenée à
  quelques paliers (moins d'entrées de cache, rendu borné) ;
- les rendus passent par le processus PDFium (mémoire plafonnée, délai) et le cache par contenu.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from database import get_db, rendre_connexion
from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from models.user import User
from routers.auth import get_auth_user
from services import ancres_projet, pdf_positions, pdfium_processus, tableur_ancre
from services.cache_apercus import cache_par_defaut
from services.pdf_lecture import PdfIllisible
from services.pdf_rendu import RenduRefuse, rendre_page_webp
from services.pdfium_processus import TravailPdfiumEchoue
from services.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter()

LIMITE_ANCRE = "120/minute"
LIMITE_APERCU = "300/minute"      # le front précharge les passages des exigences visibles
LIMITE_TABLEAU = "120/minute"
DELAI_TABLEAU_S = 20              # lecture d'une fenêtre de tableur, dans le processus plafonné

# Largeurs d'image servies (px) : la demande est ramenée au palier supérieur.
PALIERS_LARGEUR = (480, 720, 960, 1280, 1600)
LARGEUR_DEFAUT = 960

# Loupe « passage » : marge autour des rectangles, taille minimale de la zone (fractions de
# la page affichée) pour qu'un mot seul reste lisible dans son entourage.
_MARGE_X, _MARGE_Y = 0.04, 0.02
_MIN_X, _MIN_Y = 0.5, 0.12


# ─── Accès ────────────────────────────────────────────────────────────────────

def _exigence_de_l_org(db: Session, exigence_id: str, org_id: str) -> ComplianceItem:
    item = (db.query(ComplianceItem)
            .join(Project, Project.id == ComplianceItem.project_id)
            .filter(ComplianceItem.id == exigence_id,
                    Project.organization_id == org_id,
                    Project.deleted_at.is_(None))
            .first())
    if item is None:
        raise HTTPException(status_code=404, detail="Source introuvable")
    return item


def _ancre_de(db: Session, item: ComplianceItem) -> dict:
    """L'ancre rangée ; sinon calculée (premier clic) ; sinon le repli, jamais d'erreur 500.
    Bloquant (processus PDFium) : à appeler dans ``asyncio.to_thread``."""
    if item.ancre is None and (item.source_excerpt or "").strip():
        try:
            # attente / indisponible : 503 + Retry-After (gestionnaire de pdfium_http)
            ancres_projet.calculer_pour(db, item, lever=("attente", "indisponible"))
            db.refresh(item)
        except TravailPdfiumEchoue:
            raise
        except Exception as e:
            logger.warning("Ancre au premier clic en échec (%s)", type(e).__name__)
            db.rollback()
    if item.ancre is not None:
        return item.ancre
    return _repli(db, item)


def _repli(db: Session, item: ComplianceItem) -> dict:
    """Pas d'ancre calculable (délai, plantage, pièce non PDF) : la page citée par l'analyse
    si elle existe, sinon rien. Non rangé : un prochain clic peut réussir."""
    piece = ancres_projet.piece_de(db, item)
    if piece is not None and tableur_ancre.est_tableur(piece.file_url):
        return tableur_ancre.ancre_aucune(piece.id)       # pas de page dans un tableur
    page = item.source_page if item.source_page and item.source_page >= 1 else None
    if piece is None or page is None or ancres_projet.chemin_pdf(piece) is None:
        return ancres_projet.ancre_aucune(piece.id if piece else None)
    return {"version": 1, "doc_id": piece.id, "page": page, "rotation": 0, "rects": [],
            "niveau": "page", "citation": None}


# ─── A5 : l'ancre ─────────────────────────────────────────────────────────────

@router.get("/{exigence_id}")
@limiter.limit(LIMITE_ANCRE)
async def lire_ancre(
    request: Request,
    exigence_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    item = _exigence_de_l_org(db, exigence_id, user.organization_id)
    ancre = await asyncio.to_thread(_ancre_de, db, item)
    return JSONResponse(ancre, headers={"Cache-Control": "private, no-store"})


# ─── A6 : l'aperçu ────────────────────────────────────────────────────────────

def palier_largeur(largeur: int) -> int:
    """La largeur demandée ramenée au palier supérieur (bornée aux paliers extrêmes)."""
    return next((p for p in PALIERS_LARGEUR if largeur <= p), PALIERS_LARGEUR[-1])


def cadrage_passage(ancre: dict) -> Optional[tuple[float, float, float, float]]:
    """Zone de la page AFFICHÉE (fractions, origine en haut à gauche) à montrer pour le
    passage : l'union de ses rectangles (tournés comme la page), avec une marge, au moins
    ``_MIN_X`` × ``_MIN_Y`` de la page, ramenée dans la page. None si l'ancre n'a pas de
    rectangle (la vue « passage » montre alors la page entière)."""
    rects = ancre.get("rects") or []
    if ancre.get("niveau") != "passage" or not rects:
        return None
    tournes = [pdf_positions.tourner_rectangle(r, int(ancre.get("rotation") or 0)) for r in rects]
    x0, y0 = min(r[0] for r in tournes) - _MARGE_X, min(r[1] for r in tournes) - _MARGE_Y
    x1, y1 = max(r[2] for r in tournes) + _MARGE_X, max(r[3] for r in tournes) + _MARGE_Y

    def etendre(a: float, b: float, minimum: float) -> tuple[float, float]:
        if b - a < minimum:
            milieu = (a + b) / 2
            a, b = milieu - minimum / 2, milieu + minimum / 2
        a, b = max(a, 0.0), min(b, 1.0)            # ramener dans la page sans rétrécir
        if b - a < minimum:
            a, b = (0.0, minimum) if a <= 0.0 else (1.0 - minimum, 1.0)
        return a, b

    x0, x1 = etendre(x0, x1, _MIN_X)
    y0, y1 = etendre(y0, y1, _MIN_Y)
    return (round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3))


def _preparer_apercu(db: Session, item: ComplianceItem, vue: str):
    """(chemin du PDF, index de page, cadrage) ; 404 si rien à montrer. Bloquant."""
    ancre = _ancre_de(db, item)
    piece = None
    if ancre.get("doc_id") and ancre.get("page"):
        # la pièce de l'ancre, DANS le projet de l'exigence
        piece = (db.query(ProjectDocument)
                 .filter(ProjectDocument.id == ancre["doc_id"],
                         ProjectDocument.project_id == item.project_id).first())
    chemin = ancres_projet.chemin_pdf(piece) if piece else None
    if chemin is None:
        raise HTTPException(status_code=404, detail="Aperçu indisponible")
    cadrage = cadrage_passage(ancre) if vue == "passage" else None
    return chemin, int(ancre["page"]) - 1, cadrage


@router.get("/{exigence_id}/apercu")
@limiter.limit(LIMITE_APERCU)
async def apercu(
    request: Request,
    exigence_id: str,
    vue: Literal["passage", "page"] = Query("passage"),
    largeur: int = Query(LARGEUR_DEFAUT, ge=1, le=10_000),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    item = _exigence_de_l_org(db, exigence_id, user.organization_id)
    chemin, page_index, cadrage = await asyncio.to_thread(_preparer_apercu, db, item, vue)
    rendre_connexion(db)         # plus de base ensuite : le rendu peut durer
    largeur_px = palier_largeur(largeur)
    try:
        octets = await asyncio.to_thread(
            cache_par_defaut().obtenir_ou_calculer, chemin, page_index, cadrage, largeur_px, vue,
            lambda: rendre_page_webp(chemin, page_index, largeur_px, cadrage))
    except (RenduRefuse, PdfIllisible):
        raise HTTPException(status_code=404, detail="Aperçu indisponible") from None
    return Response(
        content=octets, media_type="image/webp",
        headers={"Cache-Control": "private, max-age=86400, immutable",
                 "X-Content-Type-Options": "nosniff"})


# ─── Tableur : la fenêtre autour de la ligne citée ────────────────────────────

def _preparer_tableau(db: Session, item: ComplianceItem):
    """(chemin du tableur, ancre) ; 404 si l'exigence ne cite pas un tableur lisible. Bloquant."""
    ancre = _ancre_de(db, item)
    piece = None
    if ancre.get("format") == "tableur" and ancre.get("feuille") and ancre.get("doc_id"):
        # la pièce de l'ancre, DANS le projet de l'exigence
        piece = (db.query(ProjectDocument)
                 .filter(ProjectDocument.id == ancre["doc_id"],
                         ProjectDocument.project_id == item.project_id).first())
    chemin = ancres_projet.chemin_tableur(piece) if piece else None
    if chemin is None:
        raise HTTPException(status_code=404, detail="Tableau indisponible")
    return chemin, ancre


@router.get("/{exigence_id}/tableau")
@limiter.limit(LIMITE_TABLEAU)
async def tableau(
    request: Request,
    exigence_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """La ligne citée d'un tableur (DPGF, BPU, DQE) avec quelques lignes autour et l'en-tête,
    en texte, tels que le fichier les contient : aucun calcul, aucun montant mis en avant.
    Le client ne donne ni chemin, ni feuille, ni numéro de ligne : tout vient de l'ancre."""
    item = _exigence_de_l_org(db, exigence_id, user.organization_id)
    chemin, ancre = await asyncio.to_thread(_preparer_tableau, db, item)
    rendre_connexion(db)         # plus de base ensuite : la lecture peut durer
    try:
        fenetre = await asyncio.to_thread(
            pdfium_processus.executer, tableur_ancre.fenetre, str(chemin), ancre["feuille"],
            ancre.get("ligne"), delai_s=DELAI_TABLEAU_S)
    except TravailPdfiumEchoue as e:
        if e.raison in ("attente", "indisponible"):
            raise            # 503 + Retry-After (gestionnaire de pdfium_http)
        raise HTTPException(status_code=404, detail="Tableau indisponible") from None
    except Exception as e:   # fichier illisible, bombe refusée : le même 404, rien du fichier dans la réponse
        logger.warning("Tableau illisible (%s)", type(e).__name__)
        raise HTTPException(status_code=404, detail="Tableau indisponible") from None
    if fenetre is None:
        raise HTTPException(status_code=404, detail="Tableau indisponible")
    return JSONResponse(fenetre, headers={"Cache-Control": "private, no-store"})
