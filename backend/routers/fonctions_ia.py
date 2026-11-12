"""Les routes des fonctions C1 à C4, chacune derrière son interrupteur ÉTEINT par défaut (services/fonctions_ia.py).

Ordre des dépendances de chaque route d'IA : l'interrupteur d'abord (404 si éteinte : ni budget, ni réservation, ni
audit), puis le budget d'IA du jour de l'organisation (`exiger_budget_ia` : contrôle + réservation, 429), puis le
projet de l'organisation (404 sinon : cloisonnement), puis le plafond du jour compté avant l'appel (429). Le coût réel
est inscrit dans `couts_ia` (collecte des jetons), même si la suite échoue ; un échec du fournisseur rend la demande
au plafond (`fonctions_ia.rendre`) et répond 502 avec une phrase claire.

GET /api/fonctions-ia : ce que l'écran lit pour montrer ou cacher les boutons (authentifié, sans coût).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.memoire import MemoireTechnique
from models.project import ProjectDocument
from models.user import User
from routers.auth import get_auth_user
from schemas.memoire import PassageRewriteRequest
from services import fonctions_ia as F
from services.ai import fonctions_c
from services.ai.dtu_autorises import regle_dtu
from services.budget_ia import exiger_budget_ia
from services.project_access import get_owned_project
from services.rate_limit import limiter

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/fonctions-ia")
def lire_fonctions_ia(user: User = Depends(get_auth_user)) -> dict[str, bool]:
    """Les quatre interrupteurs, lus à chaque appel. Éteints par défaut."""
    return F.etat()


def _reserver_reecriture(db: Session, user: User, action: str, project_id: str, extra: dict):
    """C1 et C2 partagent le plafond de la réécriture d'un passage (routers/memoire.py, REECRIRE_MAX_PAR_JOUR) : la
    place est réservée sous verrou AVANT toute attente (REVUE-2 P2-1)."""
    from routers.memoire import ACTIONS_PLAFOND_REECRIRE, REECRIRE_MAX_PAR_JOUR
    return F.reserver(db, user, action, ACTIONS_PLAFOND_REECRIRE, REECRIRE_MAX_PAR_JOUR, (
        f"Vous avez fait {REECRIRE_MAX_PAR_JOUR} réécritures ou propositions dans les dernières 24 heures : "
        "c'est le plafond du jour. Vous pourrez en demander d'autres demain."),
        target_type="project", target_id=project_id, extra=extra)


async def _avec_cout(user: User, usage: str, reference: str, ligne_audit, db: Session, appel):
    """L'appel, ses jetons inscrits dans `couts_ia` (réussite ou échec), et la demande rendue au plafond si le
    fournisseur échoue ou si la sortie n'a pas la forme attendue."""
    from services import couts_ia, jetons
    try:
        with jetons.collecter() as collecte:
            try:
                return await appel()
            finally:
                couts_ia.enregistrer_collecte(user.organization_id, usage, collecte, reference=reference)
    except fonctions_c.SortieIllisible as e:
        logger.warning("%s : sortie hors du format attendu (%s)", usage, e)
        F.rendre(db, ligne_audit)
        raise HTTPException(status_code=502, detail=F.MSG_SORTIE_ILLISIBLE)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("%s : échec du fournisseur (%s)", usage, type(e).__name__)
        F.rendre(db, ligne_audit)
        raise HTTPException(status_code=502, detail=F.MSG_ECHEC_FOURNISSEUR)


# ── C1 — « Proposer un paragraphe » sur une ligne « À couvrir » de la relecture ─────────────────────────────────────

class ProposerParagrapheIn(BaseModel):
    sous_critere: str = Field(min_length=2, max_length=300)
    critere: Optional[str] = Field(default=None, max_length=300)
    ancre: Optional[str] = Field(default=None, max_length=80)


@router.post("/projects/{project_id}/memoire/proposer-paragraphe",
             dependencies=[Depends(F.exiger("relecture_proposer")), Depends(exiger_budget_ia)])
@limiter.limit("10/minute")
async def proposer_paragraphe(request: Request, project_id: str, payload: ProposerParagrapheIn,
                              user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """C1 — un paragraphe PROPOSÉ pour couvrir un sous-critère : rien n'est écrit dans le mémoire (l'utilisateur
    l'insère ou non). Sonnet 5.5 (`MEMOIRE_MODELE`), plafond partagé avec la réécriture d'un passage."""
    from services.exigences import exigences_pour_memoire
    from services.relecture_memoire import sections_du_memoire

    project = get_owned_project(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project.id).first()
    if memoire is None or not isinstance(memoire.content_json, dict):
        raise HTTPException(status_code=404, detail="Aucun mémoire pour ce dossier.")
    ligne = _reserver_reecriture(db, user, F.ACTION_PROPOSER_PARAGRAPHE, project.id, {})
    try:
        sections = sections_du_memoire(memoire.content_json)
        section = next((s.texte for s in sections if payload.ancre and s.ancre == payload.ancre), "")
        exigences = [e.exigence_text for e in exigences_pour_memoire(db, project) if e.exigence_text][:12]
        docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project.id).all()
        ids_lots = [l.get("id") for l in (project.lots_detectes or []) if l.get("id")]
        regle = await asyncio.to_thread(regle_dtu, docs, project.selected_lot, project.selected_lot_name,
                                        project.lots_detectes or [], ids_lots)
        message = fonctions_c.message_paragraphe(payload.sous_critere, payload.critere, section, exigences,
                                                 fonctions_c.profil_court(db, user.organization_id), regle.consigne())
        ligne.extra = {"chars": len(message)}
        db.commit()
    except BaseException:
        F.rendre(db, ligne)                    # échec avant l'appel au modèle : la place est rendue
        raise
    texte = await _avec_cout(user, "proposer_paragraphe", project.id, ligne, db,
                             lambda: fonctions_c.proposer_paragraphe(message, regle))
    return {"sous_critere": payload.sous_critere, "ancre": payload.ancre, "paragraphe": texte}


# ── C2 — la réécriture d'un passage en trois propositions, avec « Voir les différences » ───────────────────────────

@router.post("/projects/{project_id}/memoire/reecrire-trois",
             dependencies=[Depends(F.exiger("reecrire_trois")), Depends(exiger_budget_ia)])
@limiter.limit("10/minute")
async def reecrire_trois(request: Request, project_id: str, payload: PassageRewriteRequest,
                         user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """C2 — trois réécritures du passage sélectionné (mêmes gestes, même modèle, même règle DTU que la réécriture
    d'aujourd'hui, qui reste inchangée sur sa route). Ne modifie jamais le mémoire : le front montre les trois
    propositions et leurs différences, puis applique celle que l'utilisateur accepte par le PATCH existant."""
    project = get_owned_project(project_id, user.organization_id, db)
    ligne = _reserver_reecriture(db, user, F.ACTION_REECRIRE_TROIS, project.id,
                                 {"action": payload.action, "chars": len(payload.passage)})
    try:
        docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project.id).all()
        ids_lots = [l.get("id") for l in (project.lots_detectes or []) if l.get("id")]
        regle = await asyncio.to_thread(regle_dtu, docs, project.selected_lot, project.selected_lot_name,
                                        project.lots_detectes or [], ids_lots)
    except BaseException:
        F.rendre(db, ligne)                    # échec avant l'appel au modèle : la place est rendue
        raise
    propositions = await _avec_cout(user, "reecrire_trois", project.id, ligne, db,
                                    lambda: fonctions_c.reecrire_trois(payload.passage, payload.action,
                                                                       payload.instruction, regle))
    return {"original": payload.passage, "propositions": propositions, "action": payload.action}


# ── C3 — « Ce que vous voulez dire » de chaque fiche du plan, proposé puis validé ──────────────────────────────────

@router.post("/projects/{project_id}/plan-memoire/proposer-voulu",
             dependencies=[Depends(F.exiger("fiche_proposee")), Depends(exiger_budget_ia)])
@limiter.limit("5/minute")
async def proposer_voulu(request: Request, project_id: str, user: User = Depends(get_auth_user),
                         db: Session = Depends(get_db)):
    """C3 — une proposition de « Ce que vous voulez dire » par partie gardée du plan (enregistré, sinon proposé),
    par Haiku 4.5, depuis les exigences rattachées à la partie et Mon entreprise. Rien n'est enregistré : l'écran
    montre chaque proposition, l'utilisateur la prend ou non, et le texte pris suit le chemin d'aujourd'hui (champ
    `voulu` de la fiche, enregistré par PUT /plan-memoire, lu par le générateur sans changer son prompt)."""
    from routers.plan_memoire import _plan_enregistre, _reponse

    project = get_owned_project(project_id, user.organization_id, db)
    if F.demandes_24h(db, user.organization_id, (F.ACTION_FICHE_PROPOSEE,)) >= F.FICHE_PROPOSEE_MAX_PAR_JOUR:
        raise HTTPException(status_code=429, detail=(
            f"Vous avez demandé {F.FICHE_PROPOSEE_MAX_PAR_JOUR} propositions de fiches dans les dernières 24 heures : "
            "c'est le plafond du jour. Vous pourrez en demander d'autres demain."))
    vue = _reponse(db, project, _plan_enregistre(db, project, user.organization_id))
    parties = [p for p in vue.get("parties") or [] if isinstance(p, dict) and not p.get("retiree")]
    if not parties:
        raise HTTPException(status_code=409, detail="Le plan ne compte aucune partie à proposer.")
    profil = fonctions_c.profil_court(db, user.organization_id)
    ligne = F.compter(db, user, F.ACTION_FICHE_PROPOSEE, target_type="project", target_id=project.id,
                      extra={"parties": len(parties)})
    propositions = await _avec_cout(user, "fiche_proposee", project.id, ligne, db,
                                    lambda: fonctions_c.proposer_fiches(parties, profil))
    return {"propositions": propositions}


# ── C4 — « Le style de mon entreprise », lu dans un ancien mémoire, montré dans Mon entreprise (lecture seule) ──────

def _style_en_dict(ligne) -> dict:
    return {"style": ligne.style, "source_fichier": ligne.source_fichier,
            "lu_le": ligne.lu_le.isoformat() if ligne.lu_le else None}


@router.get("/entreprise/style", dependencies=[Depends(F.exiger("style_entreprise"))])
def lire_style_entreprise(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """Le style enregistré de l'organisation, ou {"style": null}. Jamais celui d'une autre organisation."""
    from models.style_entreprise import StyleEntreprise
    ligne = db.query(StyleEntreprise).filter(StyleEntreprise.organization_id == user.organization_id).first()
    return _style_en_dict(ligne) if ligne else {"style": None, "source_fichier": None, "lu_le": None}


@router.delete("/entreprise/style", dependencies=[Depends(F.exiger("style_entreprise"))])
def effacer_style_entreprise(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    from models.style_entreprise import StyleEntreprise
    db.query(StyleEntreprise).filter(StyleEntreprise.organization_id == user.organization_id).delete(
        synchronize_session=False)
    db.commit()
    return {"style": None, "source_fichier": None, "lu_le": None}


@router.post("/entreprise/style",
             dependencies=[Depends(F.exiger("style_entreprise")), Depends(exiger_budget_ia)])
@limiter.limit("3/minute")
async def lire_style_d_un_memoire(request: Request, file: UploadFile = File(...),
                                  user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    """C4 — lit la façon d'écrire d'un ancien mémoire (.docx ou .pdf, mêmes contrôles que l'import d'un mémoire) avec
    Haiku 4.5, et l'enregistre pour l'organisation (une ligne, remplacée à chaque lecture). Le fichier n'est pas gardé.
    LECTURE SEULE (décision D5) : rien ici n'est lu par le générateur du mémoire."""
    from models.style_entreprise import StyleEntreprise
    from routers.memoire_config import _IMPORT_EXTENSIONS, _IMPORT_MAX_SIZE, _texte_pdf_importe
    from services import extraction_processus
    from services.document_processor import DocumentProcessor
    from services.upload_validation import RegleDepot, recevoir_fichier

    # REVUE-2 P2-1 — place réservée sous verrou AVANT les attentes (réception, lecture du fichier), rendue si la
    # demande échoue avant l'appel au modèle (format refusé, texte trop court…).
    ligne = F.reserver(db, user, F.ACTION_STYLE_ENTREPRISE, (F.ACTION_STYLE_ENTREPRISE,), F.STYLE_MAX_PAR_JOUR, (
        f"Vous avez fait lire {F.STYLE_MAX_PAR_JOUR} mémoires dans les dernières 24 heures : c'est le plafond du "
        "jour. Vous pourrez en faire lire un autre demain."), target_type="organization", target_id=user.organization_id)
    try:
        nom = (file.filename or "memoire")[-255:]
        with await recevoir_fichier(request, file,
                                    RegleDepot(_IMPORT_EXTENSIONS, _IMPORT_MAX_SIZE, "DOCX ou PDF")) as recu:
            contenu = await recu.octets()
        if nom.lower().endswith(".pdf") and extraction_processus.actif():
            texte = await asyncio.to_thread(_texte_pdf_importe, contenu, nom)
        else:
            texte, _ = await asyncio.to_thread(DocumentProcessor().extract, contenu, nom)
        if not texte or len(texte.strip()) < fonctions_c.STYLE_MIN_CARACTERES:
            raise HTTPException(status_code=422, detail=(
                "Ce document ne contient pas assez de texte pour y lire une façon d'écrire. "
                "Déposez un mémoire rédigé, en Word ou en PDF texte."))
        ligne.extra = {"chars": min(len(texte), fonctions_c.STYLE_MAX_CARACTERES)}
        db.commit()
    except BaseException:
        F.rendre(db, ligne)                    # échec avant l'appel au modèle : la place est rendue
        raise
    style = await _avec_cout(user, "style_entreprise", user.organization_id, ligne, db,
                             lambda: fonctions_c.lire_style(texte))
    enregistre = db.query(StyleEntreprise).filter(StyleEntreprise.organization_id == user.organization_id).first()
    if enregistre is None:
        enregistre = StyleEntreprise(organization_id=user.organization_id, style=style, source_fichier=nom,
                                     modele=fonctions_c.HAIKU)
        db.add(enregistre)
    else:
        enregistre.style, enregistre.source_fichier, enregistre.modele = style, nom, fonctions_c.HAIKU
        from datetime import datetime
        enregistre.lu_le = datetime.utcnow()
    db.commit()
    db.refresh(enregistre)
    return _style_en_dict(enregistre)
