import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db
from models.user import User
from models.team_member import TeamMember
from routers.auth import get_auth_user
from services.file_storage import UPLOADS_ROOT

logger = logging.getLogger(__name__)
router = APIRouter()


class TeamMemberCreate(BaseModel):
    # S-17 — mêmes bornes que TeamMemberUpdate (colonnes de team_members) : 422, jamais 500.
    name: str = Field(max_length=255)
    role: str = Field(max_length=255)
    specialite: Optional[str] = Field(default=None, max_length=255)
    experience_years: Optional[int] = Field(default=None, ge=0, le=80)
    certifications: Optional[str] = Field(default=None, max_length=500)
    experience_resume: Optional[str] = Field(default=None, max_length=1000)  # migration 0029


class TeamMemberUpdate(BaseModel):
    """Modification d'une personne clé : seuls les champs envoyés changent."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    role: Optional[str] = Field(default=None, min_length=1, max_length=255)
    specialite: Optional[str] = Field(default=None, max_length=255)
    experience_years: Optional[int] = Field(default=None, ge=0, le=80)
    certifications: Optional[str] = Field(default=None, max_length=500)
    experience_resume: Optional[str] = Field(default=None, max_length=1000)


class TeamMemberResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    role: str
    specialite: Optional[str]
    experience_years: Optional[int]
    certifications: Optional[str]
    cv_url: Optional[str]
    experience_resume: Optional[str] = None

    model_config = {"from_attributes": True}


@router.get("/team", response_model=List[TeamMemberResponse])
def list_team(user: User = Depends(get_auth_user), db: Session = Depends(get_db)):
    return db.query(TeamMember).filter(TeamMember.organization_id == user.organization_id).all()


@router.post("/team", response_model=TeamMemberResponse)
def create_team_member(
    payload: TeamMemberCreate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    member = TeamMember(organization_id=user.organization_id, **payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.patch("/team/{member_id}", response_model=TeamMemberResponse)
def update_team_member(
    member_id: str,
    payload: TeamMemberUpdate,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.organization_id == user.organization_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    for champ, valeur in payload.model_dump(exclude_unset=True).items():
        if valeur is None and champ in {"name", "role"}:
            continue  # colonnes obligatoires : un null n'efface pas
        setattr(member, champ, valeur)
    db.commit()
    db.refresh(member)
    return member


def _date_iso(valeur) -> str | None:
    return valeur.isoformat() if valeur else None


RESERVE_ADMIN = ("La suppression du compte est réservée à l’administrateur de votre entreprise : "
                 "demandez-lui de la faire depuis Paramètres.")


def _exiger_admin(user: User) -> None:
    """Point 74 de DECISIONS.md — supprimer le compte efface TOUTE l'organisation : le geste (et son aperçu, et son
    annulation) est réservé à l'administrateur. Un membre reçoit un 403 qui dit à qui s'adresser."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail=RESERVE_ADMIN)


@router.get("/me/suppression")
def account_deletion_preview(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """D23 — ce que le dialogue « Supprimer mon compte » annonce (lu à son ouverture, jamais à chaque page) : immédiate
    sans abonnement payant ; sinon la date de fin de la période payée. Et la demande déjà posée, s'il y en a une."""
    _exiger_admin(user)
    from models.organization import Organization
    from services import resiliation_compte

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    try:
        fin = resiliation_compte.apercu_fin_de_periode(org)
    except resiliation_compte.ResiliationImpossible:
        raise HTTPException(status_code=502, detail="Le service de paiement n’a pas répondu. Réessayez dans un instant.")
    return {"immediate": fin is None, "fin_de_periode": _date_iso(fin),
            "suppression_prevue_le": _date_iso(org.suppression_prevue_le)}


@router.delete("/me", status_code=200)
def delete_my_account(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """RGPD droit à l'oubli — supprime le compte utilisateur et TOUTES ses données.

    D23 — avec un abonnement payant vivant, la suppression est PROGRAMMÉE à la fin de la période payée (l'abonnement
    s'arrête à l'échéance, l'accès reste ouvert, rien n'est effacé) : `{"deleted": false, "suppression_prevue_le": …}`.
    Sans abonnement payant : immédiate. S-02 — toutes les lignes de l'organisation (services/suppression_compte.py),
    dans une seule transaction ; les fichiers déposés sont effacés du disque après le commit. Détail :
    services/resiliation_compte.py."""
    _exiger_admin(user)
    from models.organization import Organization
    from services import resiliation_compte

    org_id = user.organization_id
    # S-03 — le fournisseur de paiement d'abord : un échec ne change rien.
    org = db.query(Organization).filter(Organization.id == org_id).first()
    try:
        fin = resiliation_compte.programmer_ou_resilier(org) if org is not None else None
    except resiliation_compte.ResiliationImpossible:
        raise HTTPException(status_code=502, detail="L’abonnement n’a pas pu être résilié : rien n’a été supprimé. "
                                                    "Réessayez dans quelques minutes ou écrivez-nous.")
    if fin is not None:
        org.suppression_prevue_le = fin
        db.commit()
        logger.info("RGPD: suppression du compte programmée — org=%s, le %s", org_id, fin.date().isoformat())
        return {"deleted": False, "suppression_prevue_le": _date_iso(fin)}

    try:
        bilan = resiliation_compte.executer_suppression(db, org_id, racine=UPLOADS_ROOT)
    except Exception:
        logger.exception("RGPD : suppression du compte impossible (org=%s)", org_id)
        raise HTTPException(status_code=500, detail="Le compte n’a pas pu être supprimé. Rien n’a été effacé ; "
                                                    "réessayez dans un instant ou écrivez-nous.")
    return {"deleted": True, "projects_deleted": len(bilan["project_ids"])}


@router.post("/me/annuler-suppression", status_code=200)
def cancel_account_deletion(
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """D23 — retire la demande de suppression tant que sa date n'est pas passée ; l'abonnement renouvelle de nouveau."""
    _exiger_admin(user)
    from datetime import datetime

    from models.organization import Organization
    from services import resiliation_compte

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if org is None or org.suppression_prevue_le is None:
        raise HTTPException(status_code=409, detail="Aucune suppression du compte n’est prévue.")
    if org.suppression_prevue_le <= datetime.utcnow():
        raise HTTPException(status_code=409, detail="La date de suppression est passée : la suppression est en cours.")
    try:
        resiliation_compte.reprendre_abonnements(org)
    except resiliation_compte.ResiliationImpossible:
        raise HTTPException(status_code=502, detail="L’abonnement n’a pas pu être repris : la suppression reste prévue. "
                                                    "Réessayez dans quelques minutes ou écrivez-nous.")
    org.suppression_prevue_le = None
    db.commit()
    logger.info("RGPD: suppression du compte annulée — org=%s", org.id)
    return {"suppression_prevue_le": None}


@router.delete("/team/{member_id}", status_code=204)
def delete_team_member(
    member_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    member = db.query(TeamMember).filter(
        TeamMember.id == member_id,
        TeamMember.organization_id == user.organization_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    db.delete(member)
    db.commit()
