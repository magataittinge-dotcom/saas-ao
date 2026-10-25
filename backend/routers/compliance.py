from datetime import datetime
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.project import Project
from models.compliance_item import ComplianceItem, STATUT_A_CONFIRMER, STATUT_CONFIRMEE
from schemas.compliance import ComplianceItemResponse
from routers.auth import get_auth_user
from services.exigences import GROUPES_EXIGENCES, requete_exigences_du_dossier

router = APIRouter()


def _doc_rank(doc: str) -> int:
    """Ordre de lecture métier du DCE : RC → CCAP → AE → CCTP → prix → autres.

    Matching robuste aux sous-chaînes (« maRChé » ne matche pas RC,
    « chaussée » ne matche pas AE)."""
    d = doc.lower()
    if d.startswith("rc") or "règlement" in d or "reglement" in d:
        return 0
    if "ccap" in d:
        return 1
    if "acte" in d or d.startswith("ae"):
        return 2
    if "cctp" in d:
        return 3
    if "dpgf" in d or "bpu" in d or "dqe" in d:
        return 4
    return 5


@router.get("/{project_id}/compliance", response_model=List[ComplianceItemResponse])
def get_compliance_matrix(
    project_id: str,
    lot: str | None = None,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Exigences du projet. ?lot=lotN → tronc commun ('_commun') + spécifique
    du lot ; défaut : lot sélectionné du projet ; legacy (lot NULL) inclus."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    items = requete_exigences_du_dossier(db, project, lot).all()
    # Audit #6 — l'écran suit l'ORDRE DE LECTURE du DCE (RC → CCAP → AE →
    # CCTP → prix, page croissante), pas l'ordre de sortie de l'IA. Le front
    # regroupe par catégorie en préservant cet ordre à l'intérieur des groupes.
    items.sort(key=lambda i: (
        i.category or "",
        _doc_rank(i.source_document or ""),
        i.source_page if i.source_page is not None else 10**6,
        i.created_at or datetime.min,
    ))
    return items


@router.get("/{project_id}/compliance/lots")
def get_analyzed_lots(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Lots ayant des exigences analysées (multi-lots) — pour le sélecteur."""
    _get_project_or_404(project_id, user.organization_id, db)
    rows = db.query(ComplianceItem.lot).filter(
        ComplianceItem.project_id == project_id,
        ComplianceItem.lot.isnot(None),
        ComplianceItem.lot != "_commun",
    ).distinct().all()
    return {"lots": sorted(r[0] for r in rows)}


# ── Confirmation par l'utilisateur (décision du 25/10, export « 0/N ») ──────
# Le SEUL geste qui pose « confirmée » (STATUT_CONFIRMEE) : jamais l'analyse,
# jamais un mot-clé. Chaque confirmation est journalisée (qui, quand).

class ConfirmationExigence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmee: bool


class ConfirmationGroupe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    groupe: Literal["candidature", "offre_technique", "execution"]
    lot: Optional[str] = Field(default=None, min_length=1, max_length=64)
    confirmee: bool = True


@router.patch("/{project_id}/compliance/{item_id}", response_model=ComplianceItemResponse)
def confirmer_exigence(
    project_id: str,
    item_id: str,
    body: ConfirmationExigence,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """L'utilisateur confirme (ou reprend) une exigence relevée."""
    _get_project_or_404(project_id, user.organization_id, db)
    item = db.query(ComplianceItem).filter(
        ComplianceItem.id == item_id,
        ComplianceItem.project_id == project_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Exigence introuvable")
    item.status = STATUT_CONFIRMEE if body.confirmee else STATUT_A_CONFIRMER
    db.commit()
    from services.audit_logger import log_action
    log_action(db, user, "compliance.confirmer" if body.confirmee else "compliance.reprendre",
               target_type="compliance_item", target_id=item_id,
               extra={"project_id": project_id})
    db.refresh(item)
    return item


@router.post("/{project_id}/compliance/confirmer-groupe")
def confirmer_groupe(
    project_id: str,
    body: ConfirmationGroupe,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """« Tout confirmer » : toutes les exigences d'un groupe, dans le périmètre
    du dossier (tronc commun + lot), pour ne pas les cocher une à une."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    statut = STATUT_CONFIRMEE if body.confirmee else STATUT_A_CONFIRMER
    n = (
        requete_exigences_du_dossier(db, project, body.lot)
        .filter(ComplianceItem.category.in_(GROUPES_EXIGENCES[body.groupe]))
        .update({ComplianceItem.status: statut}, synchronize_session=False)
    )
    db.commit()
    from services.audit_logger import log_action
    log_action(db, user, "compliance.confirmer_groupe" if body.confirmee else "compliance.reprendre_groupe",
               target_type="project", target_id=project_id,
               extra={"groupe": body.groupe, "lot": body.lot or project.selected_lot, "exigences": n})
    return {"groupe": body.groupe, "exigences": n, "confirmee": body.confirmee}


# R11 — source UNIQUE (filtre org + soft-delete) ; fini les 7 copies.
from services.project_access import get_owned_project as _get_project_or_404
