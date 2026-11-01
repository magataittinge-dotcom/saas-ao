"""Fiches « Mon entreprise » à télécharger — /api/entreprise/fiches/{rubrique}.

Trois rubriques (identité, moyens, certifications). Chaque fiche a un aperçu (données relues à chaque appel,
jamais copiées) et un bordereau modifiable : titre, sous-titre, contact, couleur d'accent, lignes libres,
logo. Toutes les routes travaillent sur l'entreprise de l'utilisateur authentifié (``organization_id`` posé
par le serveur, jamais lu du corps ni de l'adresse) : aucune fiche d'une autre entreprise n'est atteignable.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fiche_entreprise import FicheEntreprise
from models.organization import Organization
from models.user import User
from routers.auth import get_auth_user
from schemas.fiches_entreprise import (
    COULEUR_PAR_DEFAUT, RUBRIQUES, SECTIONS, BordereauIn,
)
from services import fiches_donnees as donnees_fiche

router = APIRouter()



def _rubrique_ou_404(rubrique: str) -> str:
    if rubrique not in RUBRIQUES:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    return rubrique


def _org_ou_404(db: Session, user: User) -> Organization:
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    return org


def _fiche(db: Session, org_id: str, rubrique: str) -> Optional[FicheEntreprise]:
    return db.query(FicheEntreprise).filter(
        FicheEntreprise.organization_id == org_id, FicheEntreprise.rubrique == rubrique,
    ).first()


def valeurs_par_defaut(org: Organization, rubrique: str) -> dict:
    return {
        "titre": donnees_fiche.TITRES[rubrique],
        "sous_titre": f"Dossier entreprise · {donnees_fiche.mois_annee(donnees_fiche.aujourdhui())}",
        "contact": donnees_fiche.contact_par_defaut(org),
        "couleur": COULEUR_PAR_DEFAUT,
    }


def bordereau_effectif(org: Organization, fiche: Optional[FicheEntreprise], rubrique: str) -> dict:
    """Le bordereau tel qu'il s'imprime : valeur enregistrée, sinon valeur par défaut de la rubrique."""
    defauts = valeurs_par_defaut(org, rubrique)
    lignes = (fiche.lignes_libres if fiche is not None else None) or []
    return {
        "titre": (fiche.titre if fiche else None) or defauts["titre"],
        "sous_titre": (fiche.sous_titre if fiche else None) or defauts["sous_titre"],
        "contact": (fiche.contact if fiche else None) or defauts["contact"],
        "couleur": (fiche.couleur if fiche else None) or defauts["couleur"],
        "lignes_libres": [l for l in lignes if isinstance(l, dict) and l.get("section") in SECTIONS[rubrique]],
    }


def _reponse(db: Session, org: Organization, rubrique: str) -> dict:
    fiche = _fiche(db, org.id, rubrique)
    bordereau = bordereau_effectif(org, fiche, rubrique)
    return {
        "rubrique": rubrique,
        "libelle": donnees_fiche.LIBELLES_RUBRIQUE[rubrique],
        "bordereau": {**bordereau, "enregistre": fiche is not None, "logo_url": None},
        "valeurs_par_defaut": valeurs_par_defaut(org, rubrique),
        "sections_libres": list(SECTIONS[rubrique]),
        "palette": donnees_fiche.palette(bordereau["couleur"]),
        "donnees": donnees_fiche.assembler(db, org.id, rubrique),
    }


@router.get("/{rubrique}")
def lire_fiche(
    rubrique: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Données assemblées de la rubrique + bordereau (enregistré, sinon valeurs par défaut)."""
    _rubrique_ou_404(rubrique)
    return _reponse(db, _org_ou_404(db, user), rubrique)


@router.put("/{rubrique}")
def enregistrer_bordereau(
    rubrique: str,
    payload: BordereauIn,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Enregistre le bordereau de la rubrique. Un champ vide revient à la valeur par défaut."""
    _rubrique_ou_404(rubrique)
    org = _org_ou_404(db, user)
    autorisees = SECTIONS[rubrique]
    for ligne in payload.lignes_libres:
        if ligne.section not in autorisees:
            raise HTTPException(
                status_code=422,
                detail=f"Section « {ligne.section} » inconnue pour cette fiche (sections : {', '.join(autorisees)}).",
            )
    fiche = _fiche(db, org.id, rubrique)
    if fiche is None:
        fiche = FicheEntreprise(organization_id=org.id, rubrique=rubrique)
        db.add(fiche)
    fiche.titre = payload.titre
    fiche.sous_titre = payload.sous_titre
    fiche.contact = payload.contact
    fiche.couleur = payload.couleur
    fiche.lignes_libres = [l.model_dump() for l in payload.lignes_libres]
    db.commit()
    return _reponse(db, org, rubrique)

