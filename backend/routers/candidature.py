"""
Candidature checklist endpoints.

* GET    /{project_id}/checklist                              — read full checklist
* POST   /{project_id}/checklist/{item_id}/upload-completed   — upload a user-filled template
                                                                (source_kind='dce_template')
* PUT    /{project_id}/checklist/{item_id}/link               — link an existing vault doc
                                                                (source_kind='vault')
"""
import asyncio
import logging
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile,
)
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from database import get_db
from models.checklist_item import ChecklistItem
from models.document import Document
from models.project import Project, ProjectDocument
from models.user import User
from routers.auth import get_auth_user
from schemas.compliance import ChecklistItemResponse
from services.upload_validation import RegleDepot, recevoir_fichier

logger = logging.getLogger(__name__)

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"

_COMPLETED_ALLOWED_EXTENSIONS = frozenset({".pdf", ".docx", ".xlsx", ".xls"})
# B8 — ordre de grandeur : une trame remplie et signée (DC1, DC2, AE, DPGF) est
# souvent un scan PDF de 10 à 20 pages, jusqu'à 20-30 Mo en couleur à 300 dpi :
# 50 Mo (plafond inchangé, désormais appliqué avant toute lecture).
_COMPLETED_MAX_SIZE = 50 * 1024 * 1024

router = APIRouter()
from services.rate_limit import limiter  # S1.2 — limiter partagé (org-keyed)


@router.post("/{project_id}/checklist/regenerate")
def regenerate_checklist(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """(Re)génère la checklist depuis les exigences en base — déterministe,
    0 € API. Rétro-compatible : répare les projets analysés avant le
    multi-lots ou dont la génération de fin d'analyse a échoué."""
    _get_project_or_404(project_id, user.organization_id, db)
    from services.checklist_builder import generate_checklist_from_db
    n = generate_checklist_from_db(db, project_id, user.organization_id)
    return {"items": n}


@router.get("/{project_id}/checklist/score")
def get_checklist_score(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C10 — score de conformité « X/Y pièces conformes » de la checklist.

    Les ⚠️ (warning : présente mais problème) et les expirées ne comptent
    pas conformes ; les non_applicable sortent du dénominateur."""
    from services.ai.checklist_matcher import conformity_score
    from services.checklist_builder import sync_vault_lines_safe
    _get_project_or_404(project_id, user.organization_id, db)
    sync_vault_lines_safe(db, project_id, user.organization_id)  # B1 : état du jour
    items = db.query(ChecklistItem).filter(
        ChecklistItem.project_id == project_id,
    ).all()
    return conformity_score(items)


@router.get("/{project_id}/checklist", response_model=List[ChecklistItemResponse])
def get_checklist(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Checklist typée du projet. Filet paresseux : si le projet est analysé
    (des exigences candidature/offre existent) mais qu'aucune checklist n'a
    encore été matérialisée — cas des projets antérieurs au builder ou dont la
    génération de fin d'analyse a échoué — on la génère à la volée (déterministe,
    0 € API) pour que l'utilisateur n'ait JAMAIS à cliquer sur « Générer »."""
    from models.compliance_item import ComplianceItem

    project = _get_project_or_404(project_id, user.organization_id, db)

    has_checklist = db.query(ChecklistItem.id).filter(
        ChecklistItem.project_id == project_id).first() is not None
    if not has_checklist:
        analyzed = db.query(ComplianceItem.id).filter(
            ComplianceItem.project_id == project_id,
            ComplianceItem.category.in_(("candidature", "offre")),
        ).first() is not None
        if analyzed:
            from services.checklist_builder import generate_checklist_from_db
            try:
                generate_checklist_from_db(db, project_id, user.organization_id)
            except Exception:
                logger.exception("Génération paresseuse de la checklist échouée (%s)", project_id)
                db.rollback()

    # B1 — une pièce expirée ou retirée du coffre depuis la génération ne
    # reste pas « Conforme » à l'écran (le ZIP l'écarte).
    from services.checklist_builder import sync_vault_lines_safe
    sync_vault_lines_safe(db, project_id, user.organization_id)

    items = db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).all()
    return _avec_le_fait_jointe(db, project, items, user.organization_id)


def _avec_le_fait_jointe(db: Session, project, items, org_id: str) -> list:
    """« Jointe » à l'écran Vérification, avec la même règle que l'Export : le
    plan du ZIP dit ce qui part (routers/export._plan_du_zip, _etat_piece)."""
    from sqlalchemy.orm import defer
    from models.memoire import MemoireTechnique
    from routers.export import _etat_piece, _fin_validite_liee, _plan_du_zip
    project_docs = (db.query(ProjectDocument)
                    .options(defer(ProjectDocument.extracted_text))
                    .filter(ProjectDocument.project_id == project.id).all())
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project.id).first()
    lies = {i.linked_document_id for i in items if i.linked_document_id}
    docs_lies = {d.id: d for d in db.query(Document).filter(
        Document.id.in_(lies), Document.organization_id == org_id,
        Document.deleted_at.is_(None)).all()} if lies else {}
    plan = _plan_du_zip(db, project, org_id, checklist_items=items, project_docs=project_docs,
                        memoire=memoire, docs_par_id=docs_lies, nommer=False)
    docs_projet = {d.id: d for d in project_docs}
    reponse = []
    for item in items:
        ligne = ChecklistItemResponse.model_validate(item)
        ligne.jointe, ligne.piece_nom, ligne.valable_jusqu_au = _etat_piece(item, docs_lies, docs_projet, plan)
        ligne.valable_jusqu_au = ligne.valable_jusqu_au or _fin_validite_liee(item, docs_lies)
        reponse.append(ligne)
    return reponse


@router.post(
    "/{project_id}/checklist/{item_id}/upload-completed",
    response_model=ChecklistItemResponse,
)
@limiter.limit("10/minute")
async def upload_completed_template(
    request: Request,
    project_id: str,
    item_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """User uploads a completed copy of a DCE template (DC1 signé, DPGF rempli, …)."""
    _get_project_or_404(project_id, user.organization_id, db)
    item = _get_checklist_item_or_404(item_id, project_id, db)

    if item.source_kind != "dce_template":
        raise HTTPException(
            status_code=400,
            detail="Cet item n'est pas un template DCE — utilisez l'endpoint /link à la place.",
        )

    raw_name = file.filename or ""
    safe_name = Path(raw_name).name  # strip any path components → defeats traversal
    if not safe_name or ".." in safe_name:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")

    regle = RegleDepot(_COMPLETED_ALLOWED_EXTENSIONS, _COMPLETED_MAX_SIZE, "PDF, DOCX, XLSX ou XLS")
    with await recevoir_fichier(request, file, regle) as recu:
        ext = recu.extension
        file_size = recu.taille
        # Store under projects/<id>/completed so file_serve._authorize_path accepts it
        # (it scopes access by reading the second path segment as the project_id).
        stored_name = f"{uuid.uuid4()}_{safe_name}"
        rel_path = Path("projects") / project_id / "completed" / stored_name
        abs_path = UPLOADS_ROOT / rel_path
        await recu.enregistrer_sous(abs_path)   # copie hors de la boucle
    file_url = f"/uploads/{rel_path.as_posix()}"

    # Deduce the ProjectDocument.type from the linked template (e.g. 'dc1_template').
    # Fallback to 'autre' when the template reference is missing — covers the rare
    # case where the IA flagged a template but no template was uploaded in the DCE.
    doc_type = "autre"
    if item.template_project_doc_id:
        template = db.query(ProjectDocument).filter(
            ProjectDocument.id == item.template_project_doc_id,
            ProjectDocument.project_id == project_id,
        ).first()
        if template:
            doc_type = template.type

    pd = ProjectDocument(
        project_id=project_id,
        type=doc_type,
        file_url=file_url,
        file_name=safe_name,
        file_size=file_size,
        is_user_completed=True,
    )
    db.add(pd)
    db.flush()  # need pd.id before updating item

    item.completed_project_doc_id = pd.id
    item.status = "present"
    if item.details:
        item.details = f"Template complété : {safe_name}"

    # ── C12 : une DPGF re-uploadée passe au contrôle formel automatique ──────
    # (lignes vides, totaux) — on lit le CONTRAT, jamais de jugement de prix.
    if doc_type == "dpgf_template" and ext in (".xlsx", ".xlsm", ".xls", ".ods"):
        from services.dpgf_checker import check_dpgf
        try:
            # R8 — parse openpyxl/xlrd hors event-loop (règle WSL2).
            report = await asyncio.to_thread(check_dpgf, abs_path)
        except Exception as exc:
            logger.warning("Contrôle DPGF impossible pour %s : %s", safe_name, exc)
            report = None
        if report is not None:
            if report.get("valid") and not report.get("nb_lignes_vides"):
                item.status = "present"
                item.details = (
                    f"DPGF vérifiée : {report.get('nb_lignes_remplies', 0)} lignes remplies"
                    + (f", total {report['total_ht']:,.2f} € HT".replace(",", " ")
                       if report.get("total_ht") else "")
                )
            else:
                item.status = "warning"
                vides = report.get("nb_lignes_vides", 0)
                warnings_txt = " · ".join(report.get("warnings", [])[:3])
                item.details = (
                    f"DPGF : {vides} ligne(s) sans prix"
                    + (f" — {warnings_txt}" if warnings_txt else "")
                )

    db.commit()
    db.refresh(item)
    return item


class LinkVaultDocBody(BaseModel):
    document_id: str


@router.put(
    "/{project_id}/checklist/{item_id}/link",
    response_model=ChecklistItemResponse,
)
def link_vault_document(
    project_id: str,
    item_id: str,
    body: LinkVaultDocBody,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Link a vault Document to a checklist item (source_kind='vault')."""
    _get_project_or_404(project_id, user.organization_id, db)
    item = _get_checklist_item_or_404(item_id, project_id, db)

    if item.source_kind != "vault":
        raise HTTPException(
            status_code=400,
            detail="Cet item attend un template DCE, pas un document du coffre-fort.",
        )

    # B1 — un document supprimé du coffre ne se lie plus (il ne partirait pas
    # dans le ZIP alors que la ligne le dirait présent).
    doc = db.query(Document).filter(
        Document.id == body.document_id,
        Document.organization_id == user.organization_id,
        Document.deleted_at.is_(None),
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document du coffre-fort introuvable.")

    item.linked_document_id = doc.id
    item.status = _vault_doc_status(doc)
    db.commit()
    db.refresh(item)
    return item


class ChecklistItemPatch(BaseModel):
    """Manual overrides on a checklist item.

    `status='non_applicable'` lets the user mark an exigence as N/A without
    having to attach a doc — useful when the IA is over-zealous. `details`
    receives the user's free-form comment (kept for export traceability)."""
    status: Optional[str] = None  # one of CHECKLIST_STATUSES + 'non_applicable'
    details: Optional[str] = None
    unlink: Optional[bool] = False  # detach linked vault / completed template
    # C12 — « Je confirme avoir signé » : demandé seulement quand
    # checklist_matcher.signature_requise le dit (RC qui l'exige, DSH)
    signature_confirmed: Optional[bool] = None


@router.patch(
    "/{project_id}/checklist/{item_id}",
    response_model=ChecklistItemResponse,
)
def patch_checklist_item(
    project_id: str,
    item_id: str,
    payload: ChecklistItemPatch,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Manual overrides: mark N/A, edit comment, or detach a linked doc."""
    _get_project_or_404(project_id, user.organization_id, db)
    item = _get_checklist_item_or_404(item_id, project_id, db)

    allowed_statuses = {
        "present", "manquant", "expire", "expiration_proche", "warning", "non_applicable",
    }
    if payload.signature_confirmed is not None:
        item.signature_confirmed = payload.signature_confirmed
    if payload.status is not None:
        if payload.status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Statut invalide. Valeurs acceptées : {sorted(allowed_statuses)}",
            )
        item.status = payload.status

    if payload.details is not None:
        item.details = payload.details[:500]

    if payload.unlink:
        item.linked_document_id = None
        item.completed_project_doc_id = None
        if item.status == "present":
            item.status = "manquant"

    db.commit()
    db.refresh(item)
    return item


class NonConcerneBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    non_concerne: bool


@router.post(
    "/{project_id}/checklist/{item_id}/non-concerne",
    response_model=ChecklistItemResponse,
)
def marquer_non_concerne(
    project_id: str,
    item_id: str,
    body: NonConcerneBody,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """B2 §7 n°8 — « Non concerné » (pièce conditionnelle : DC4 « le cas
    échéant », habilitation « si groupement »…) : persisté, exclu du score,
    réversible, journalisé comme la confirmation des exigences. Repris, le
    statut revient aux faits : pièce du coffre liée, ou trame déposée."""
    _get_project_or_404(project_id, user.organization_id, db)
    item = _get_checklist_item_or_404(item_id, project_id, db)
    if item.document_group == "synorix":
        raise HTTPException(status_code=400,
                            detail="Pièce produite par Synorix à l'étape Mémoire.")
    if body.non_concerne:
        item.status = "non_applicable"
    elif item.status == "non_applicable":
        item.status = _statut_des_faits(item, user.organization_id, db)
    db.commit()
    from services.audit_logger import log_action
    log_action(db, user, "checklist.non_concerne" if body.non_concerne else "checklist.concerne",
               target_type="checklist_item", target_id=item_id,
               extra={"project_id": project_id, "piece": item.document_type_required})
    db.refresh(item)
    return item


def _statut_des_faits(item: ChecklistItem, org_id: str, db: Session) -> str:
    """Statut d'une pièce d'après ce qui existe vraiment : document du coffre
    lié (de l'org, non supprimé, jugé à la date du jour) ou trame déposée."""
    if item.source_kind == "vault":
        doc = db.query(Document).filter(
            Document.id == item.linked_document_id,
            Document.organization_id == org_id,
            Document.deleted_at.is_(None),
        ).first() if item.linked_document_id else None
        return _vault_doc_status(doc) if doc else "manquant"
    complet = db.query(ProjectDocument.id).filter(
        ProjectDocument.id == item.completed_project_doc_id,
        ProjectDocument.project_id == item.project_id,
    ).first() if item.completed_project_doc_id else None
    return "present" if complet else "manquant"


# ── Helpers ──────────────────────────────────────────────────────────────────

# R11 — source UNIQUE (filtre org + soft-delete) ; fini les 7 copies.
from services.project_access import get_owned_project as _get_project_or_404


def _get_checklist_item_or_404(item_id: str, project_id: str, db: Session) -> ChecklistItem:
    item = db.query(ChecklistItem).filter(
        ChecklistItem.id == item_id,
        ChecklistItem.project_id == project_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de checklist introuvable")
    return item


# Source unique du mapping statut coffre → statut checklist (C10 compris) :
# services/ai/checklist_matcher._vault_doc_status
from services.ai.checklist_matcher import _vault_doc_status  # noqa: E402
