"""Veille des appels d'offres — `/api/veille` (contrat : .claude/echange/sprint-ozcan/veille/CONTRAT-API.md).

Les avis sont des données publiques partagées (table sans organization_id) ; les préférences sont par
utilisateur et rattachées à son organisation. Aucun avis, aucun conseil de prix : la veille liste des faits
publiés par l'acheteur.
"""
from __future__ import annotations

import base64
import json
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import get_db
from models.avis_veille import AvisVeille
from models.preferences_veille import PreferencesVeille
from models.project import Project
from models.user import User
from routers.auth import get_auth_user
from schemas.veille import (MAX_DEPARTEMENTS, MAX_MOTS_CLES, Metier, PreferencesIn, PreferencesOut, Procedure,
                            FiltresPreferences)
from services.rate_limit import limiter
from services.veille import comptes as service_comptes
from services.veille.comptes import Filtres, iso_utc, requete_avis
from services.veille.departements import departement_valide
from services.veille.metiers import LIBELLES

router = APIRouter()

LIMITE_LECTURE = "60/minute"
LIMITE_ECRITURE = "20/minute"
LIMITE_PAR_DEFAUT = 20
LIMITE_MAX = 50
_DEFAUT_FILTRES = {"metiers": [], "delai_jours": None, "procedures": [], "mots_cles": ""}


# ── Outils ─────────────────────────────────────────────────────────────────────────────────────

def _organisation(user: User) -> str:
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Aucune organisation associée à ce compte.")
    return user.organization_id


def _csv(texte: Optional[str], nom: str, valides: Optional[set[str]] = None, maximum: int = 50) -> tuple[str, ...]:
    if not texte:
        return ()
    valeurs: list[str] = []
    for brut in texte.split(","):
        valeur = brut.strip()
        if not valeur:
            continue
        if valides is not None and valeur not in valides:
            raise HTTPException(status_code=422, detail=f"{nom} : valeur inconnue ({valeur!r}).")
        if valeur not in valeurs:
            valeurs.append(valeur)
    if len(valeurs) > maximum:
        raise HTTPException(status_code=422, detail=f"{nom} : {maximum} valeurs au plus.")
    return tuple(valeurs)


def _filtres_depuis_requete(metiers, delai_jours, procedures, q) -> Filtres:
    if delai_jours is not None and delai_jours not in service_comptes.DELAIS:
        raise HTTPException(status_code=422, detail="delai_jours : 7, 15 ou 30.")
    texte = (q or "").strip()
    if len(texte) > MAX_MOTS_CLES:
        raise HTTPException(status_code=422, detail=f"q : {MAX_MOTS_CLES} caractères au plus.")
    return Filtres(
        metiers=_csv(metiers, "metiers", set(LIBELLES)),
        delai_jours=delai_jours,
        procedures=_csv(procedures, "procedures", set(Procedure.__args__)),
        q=texte,
    )


def _preferences_sortie(ligne: Optional[PreferencesVeille]) -> dict:
    if ligne is None:
        return {"departements": [], "ville": None, "filtres": dict(_DEFAUT_FILTRES), "tri": "date_limite",
                "derniere_visite": None}
    filtres = {**_DEFAUT_FILTRES, **(ligne.filtres or {})}
    return {
        "departements": list(ligne.departements or []),
        "ville": ligne.ville,
        "filtres": filtres,
        "tri": ligne.tri or "date_limite",
        "derniere_visite": iso_utc(ligne.derniere_visite),
    }


def _ligne_preferences(db: Session, user: User, creer: bool = False) -> Optional[PreferencesVeille]:
    ligne = db.query(PreferencesVeille).filter(PreferencesVeille.user_id == user.id).first()
    if ligne is None and creer:
        ligne = PreferencesVeille(user_id=user.id, organization_id=_organisation(user), departements=[],
                                  filtres=dict(_DEFAUT_FILTRES), tri="date_limite")
        db.add(ligne)
    return ligne


def _encoder_curseur(valeur: date, identifiant: str) -> str:
    brut = json.dumps([valeur.isoformat(), identifiant]).encode("utf-8")
    return base64.urlsafe_b64encode(brut).decode("ascii").rstrip("=")


def _decoder_curseur(curseur: str) -> tuple[date, str]:
    try:
        brut = base64.urlsafe_b64decode(curseur + "=" * (-len(curseur) % 4))
        valeur, identifiant = json.loads(brut)
        return date.fromisoformat(valeur), str(identifiant)
    except Exception:
        raise HTTPException(status_code=422, detail="curseur invalide.")


def _avis_sortie(avis: AvisVeille, nouveau: bool) -> dict:
    return {
        "id": avis.id,
        "id_boamp": avis.id_boamp,
        "objet": avis.objet,
        "acheteur": avis.acheteur,
        "departements": list(avis.departements or []),
        "date_parution": avis.date_parution.isoformat(),
        "date_limite": avis.date_limite.isoformat() if avis.date_limite else None,
        "procedure": avis.procedure,
        "procedure_libelle": avis.procedure_libelle or "",
        "famille": avis.famille,
        "metiers": list(avis.metiers or []),
        "url_avis": avis.url_avis,
        "url_dossier": avis.url_dossier,
        "nouveau": nouveau,
    }


def _est_nouveau(avis: AvisVeille, derniere_visite: Optional[datetime], user: User, maintenant: datetime) -> bool:
    if derniere_visite is not None:
        return avis.date_parution > derniere_visite.date()
    cree = getattr(user, "created_at", None)
    return bool(cree and maintenant - cree < timedelta(hours=24))


# ── Routes ─────────────────────────────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=PreferencesOut)
@limiter.limit(LIMITE_LECTURE)
def lire_preferences(request: Request, user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    return _preferences_sortie(_ligne_preferences(db, user))


@router.put("/preferences", response_model=PreferencesOut)
@limiter.limit(LIMITE_ECRITURE)
def ecrire_preferences(request: Request, corps: PreferencesIn, user: User = Depends(get_auth_user),
                       db: Session = Depends(get_db)):
    ligne = _ligne_preferences(db, user, creer=True)
    fournis = corps.model_fields_set
    if "departements" in fournis and corps.departements is not None:
        ligne.departements = corps.departements
    if "ville" in fournis:
        ligne.ville = corps.ville.model_dump() if corps.ville else None
    if "filtres" in fournis and corps.filtres is not None:
        fusion = {**_DEFAUT_FILTRES, **(ligne.filtres or {})}
        fusion.update(corps.filtres.model_dump(include=corps.filtres.model_fields_set))
        ligne.filtres = fusion
    if "tri" in fournis and corps.tri is not None:
        ligne.tri = corps.tri
    ligne.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ligne)
    return _preferences_sortie(ligne)


@router.post("/visite")
@limiter.limit(LIMITE_ECRITURE)
def poser_visite(request: Request, user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    ligne = _ligne_preferences(db, user, creer=True)
    ligne.derniere_visite = datetime.utcnow()
    db.commit()
    return {"derniere_visite": iso_utc(ligne.derniere_visite)}


@router.get("/metiers")
@limiter.limit(LIMITE_LECTURE)
def lister_metiers(request: Request, user: User = Depends(get_auth_user)):
    return {"metiers": [{"code": code, "libelle": libelle} for code, libelle in LIBELLES.items()]}


@router.get("/comptes")
@limiter.limit(LIMITE_LECTURE)
def lire_comptes(request: Request, metiers: Optional[str] = None, delai_jours: Optional[int] = None,
                 procedures: Optional[str] = None, q: Optional[str] = None,
                 user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    filtres = _filtres_depuis_requete(metiers, delai_jours, procedures, q)
    return service_comptes.comptes(db, filtres)


@router.get("/avis")
@limiter.limit(LIMITE_LECTURE)
def lister_avis(request: Request, departements: str = Query(..., description="codes séparés par des virgules"),
                metiers: Optional[str] = None, delai_jours: Optional[int] = None,
                procedures: Optional[str] = None, q: Optional[str] = None, tri: str = "date_limite",
                curseur: Optional[str] = None, limite: int = Query(LIMITE_PAR_DEFAUT, ge=1, le=LIMITE_MAX),
                user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    if tri not in ("date_limite", "date_parution"):
        raise HTTPException(status_code=422, detail="tri : date_limite ou date_parution.")
    codes = _csv(departements, "departements", maximum=MAX_DEPARTEMENTS)
    for code in codes:
        if not departement_valide(code):
            raise HTTPException(status_code=422, detail=f"departements : code inconnu ({code!r}).")
    filtres = _filtres_depuis_requete(metiers, delai_jours, procedures, q)
    if not codes:
        return {"items": [], "curseur_suivant": None, "total": 0}

    requete = requete_avis(db, filtres, codes)
    total = requete.count()
    colonne = AvisVeille.date_limite if tri == "date_limite" else AvisVeille.date_parution
    if curseur:
        valeur, identifiant = _decoder_curseur(curseur)
        apres = colonne > valeur if tri == "date_limite" else colonne < valeur
        requete = requete.filter(or_(apres, and_(colonne == valeur, AvisVeille.id > identifiant)))
    ordre = colonne.asc() if tri == "date_limite" else colonne.desc()
    lignes = requete.order_by(ordre, AvisVeille.id.asc()).limit(limite + 1).all()
    page, suite = lignes[:limite], len(lignes) > limite

    ligne_pref = _ligne_preferences(db, user)
    visite = ligne_pref.derniere_visite if ligne_pref else None
    maintenant = datetime.utcnow()
    items = [_avis_sortie(a, _est_nouveau(a, visite, user, maintenant)) for a in page]
    suivant = None
    if suite and page:
        dernier = page[-1]
        suivant = _encoder_curseur(getattr(dernier, tri), dernier.id)
    return {"items": items, "curseur_suivant": suivant, "total": total}


@router.post("/avis/{avis_id}/creer-ao")
@limiter.limit(LIMITE_ECRITURE)
def creer_ao_depuis_avis(request: Request, avis_id: str, user: User = Depends(get_auth_user),
                         db: Session = Depends(get_db)):
    """Projet prérempli depuis l'avis, dans l'organisation de l'utilisateur. Un projet vide ne consomme
    aucune unité de quota (l'unité se consomme à l'analyse et au mémoire). Rejouable : si l'AO existe déjà
    dans l'organisation, son identifiant est renvoyé."""
    organisation = _organisation(user)
    avis = db.query(AvisVeille).filter(AvisVeille.id == avis_id, AvisVeille.date_limite >= date.today()).first()
    if avis is None:
        raise HTTPException(status_code=404, detail="Avis introuvable ou clos.")
    existants = (db.query(Project).filter(Project.organization_id == organisation, Project.deleted_at.is_(None),
                                          Project.infos_marche.isnot(None)).all())
    for projet in existants:
        source = (projet.infos_marche or {}).get("source_avis") if isinstance(projet.infos_marche, dict) else None
        if isinstance(source, dict) and source.get("id_boamp") == avis.id_boamp:
            return {"project_id": projet.id}
    projet = Project(
        organization_id=organisation,
        name=avis.objet[:500],
        maitre_ouvrage=(avis.acheteur or None) and avis.acheteur[:255],
        deadline=avis.date_limite,
        status="brouillon",
        current_step=1,
        infos_marche={"source_avis": {"id_boamp": avis.id_boamp, "url_avis": avis.url_avis,
                                      "url_dossier": avis.url_dossier}},
    )
    db.add(projet)
    db.commit()
    db.refresh(projet)
    from services.cache import org_cache
    org_cache.invalidate(f"dashboard_stats:{organisation}")
    return {"project_id": projet.id}
