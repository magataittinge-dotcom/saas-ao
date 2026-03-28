import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from models.project import Project, ProjectDocument
from models.compliance_item import ComplianceItem
from models.checklist_item import ChecklistItem
from models.document import Document
from schemas.compliance import ComplianceItemResponse
from routers.auth import get_auth_user
from services.ai.dce_analyzer import DCEAnalyzer
from services.ai.checklist_matcher import ChecklistMatcher
from services.document_tagger import (
    get_documents_for_lot, extract_excel_sheet_for_lot, _normalize_lot_num,
)
from typing import List

logger = logging.getLogger(__name__)

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"

router = APIRouter()


@router.post("/{project_id}/analyze")
async def trigger_analysis(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)
    all_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    docs_total = len(all_docs)

    if not all_docs:
        raise HTTPException(status_code=400, detail="Aucun document uploadé pour ce projet")

    # ── Filter documents by selected lot ──────────────────────────────────────
    selected_lot = project.selected_lot   # e.g. "lot4", "lot05", None
    docs = get_documents_for_lot(all_docs, selected_lot)
    docs_sent = len(docs)

    lot_num_norm = _normalize_lot_num(selected_lot) if selected_lot and selected_lot != "all" else None
    lot_label = project.selected_lot_name or (f"Lot {lot_num_norm}" if lot_num_norm else None)

    if lot_label:
        logger.info(
            f"Analyse {lot_label} (projet {project_id}): "
            f"envoi de {docs_sent}/{docs_total} documents à Claude"
        )
    else:
        logger.info(f"Analyse projet {project_id}: envoi de {docs_sent}/{docs_total} documents à Claude")

    # ── Combine extracted text — prioritise RC and CCTP ───────────────────────
    PRIORITY = {"rc": 0, "ccap": 1, "cctp": 2, "acte_engagement": 3, "dpgf": 4, "plan": 5, "autre": 6}
    docs_sorted = sorted(docs, key=lambda d: PRIORITY.get(d.type, 5))

    dpgf_sheet_text: str = ""   # targeted DPGF sheet text (PARTIE 3)

    parts = []
    for doc in docs_sorted:
        # ── DPGF with lot selected: try extracting the matching sheet only ────
        if doc.type == "dpgf" and lot_num_norm:
            sheet_text = _get_dpgf_sheet_text(doc, lot_num_norm)
            if sheet_text:
                dpgf_sheet_text = sheet_text
                label = f"DPGF — {doc.file_name} (onglet Lot {lot_num_norm})"
                parts.append(f"=== {label} ===\n{sheet_text}")
                continue   # skip full extracted_text for this doc

        if doc.extracted_text:
            label = doc.type.upper() if doc.type != "autre" else "DOCUMENT"
            parts.append(f"=== {label} — {doc.file_name} ===\n{doc.extracted_text}")

    if not parts:
        raise HTTPException(
            status_code=400,
            detail="Aucun texte extrait des documents. Assurez-vous d'uploader des PDF ou DOCX lisibles.",
        )

    combined_text = "\n\n".join(parts)

    # ── Build lot context header ──────────────────────────────────────────────
    lot_header = ""
    if lot_label:
        lot_header = (
            f"IMPORTANT : Cette analyse concerne spécifiquement le {lot_label}. "
            f"Concentre-toi UNIQUEMENT sur les exigences, obligations et prescriptions techniques "
            f"relatives à ce lot. Ignore les informations relatives aux autres lots. "
            f"Les documents fournis ({docs_sent} sur {docs_total} du DCE) ont été filtrés "
            f"pour ne contenir que les pièces pertinentes pour ce lot.\n\n"
        )
        if dpgf_sheet_text:
            lot_header += (
                f"DPGF DU {lot_label} :\n{dpgf_sheet_text[:3000]}\n\n"
            )

    # Update step before analysis
    project.current_step = 3
    project.status = "en_cours"
    db.commit()

    # Run AI analysis (synchronous — waits for Claude response)
    analyzer = DCEAnalyzer()
    try:
        analysis = await asyncio.wait_for(
            analyzer.extract_full_analysis(lot_header + combined_text),
            timeout=280.0
        )
    except asyncio.TimeoutError:
        project.current_step = 2
        db.commit()
        raise HTTPException(status_code=504, detail="L'analyse a pris trop de temps. Essayez avec moins de documents ou des fichiers moins volumineux.")
    except Exception as e:
        project.current_step = 2
        db.commit()
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'analyse IA : {str(e)}")

    requirements = analysis.get("requirements", [])
    criteres_jugement = analysis.get("criteres_jugement", [])
    infos_marche = analysis.get("infos_marche", {})

    if not requirements:
        project.current_step = 2
        db.commit()
        raise HTTPException(status_code=422, detail="L'IA n'a pas pu extraire d'exigences. Vérifiez que les documents contiennent du texte lisible.")

    # Store critères and infos on project
    project.criteres_jugement = criteres_jugement or None
    project.infos_marche = infos_marche or None

    # Auto-fill maitre_ouvrage from infos_marche if not already set
    if infos_marche and infos_marche.get("maitre_ouvrage") and not project.maitre_ouvrage:
        project.maitre_ouvrage = infos_marche["maitre_ouvrage"]

    # Clear existing and insert new compliance items
    db.query(ComplianceItem).filter(ComplianceItem.project_id == project_id).delete()
    for req in requirements:
        item = ComplianceItem(
            project_id=project_id,
            exigence_text=req.get("exigence", ""),
            source_document=req.get("source_document"),
            source_page=req.get("source_page") or 1,
            source_excerpt=req.get("source_excerpt"),
            category=_safe_category(req.get("category")),
            priority=_safe_priority(req.get("priority")),
            status="non_couvert",
        )
        db.add(item)
    db.commit()

    # Advance to step 3 (analysis results) when done
    steps = dict(project.completed_steps or {})
    steps["3"] = True
    project.completed_steps = steps
    if project.current_step <= 3:
        project.current_step = 4
    db.commit()

    # Generate checklist from candidature requirements (best-effort)
    candidature_reqs = [r for r in requirements if r.get("category") == "candidature"]
    if candidature_reqs:
        try:
            vault_docs = db.query(Document).filter(Document.organization_id == user.organization_id).all()
            matcher = ChecklistMatcher()
            checklist = await matcher.match(candidature_reqs, vault_docs)

            db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).delete()
            for item_data in checklist:
                db.add(ChecklistItem(
                    project_id=project_id,
                    document_type_required=item_data.get("document_type_required", ""),
                    linked_document_id=item_data.get("matched_document_id"),
                    status=item_data.get("status", "manquant"),
                    details=item_data.get("details"),
                    source_in_rc=item_data.get("source_in_rc"),
                ))
            db.commit()
        except Exception:
            pass  # Checklist failure is non-blocking

    return {
        "status": "done",
        "project_id": project_id,
        "requirements_count": len(requirements),
        "criteres_count": len(criteres_jugement),
        "demo_mode": analyzer.is_demo,
        "docs_sent": docs_sent,
        "docs_total": docs_total,
    }


def _get_dpgf_sheet_text(doc, lot_num_norm: str) -> str:
    """Try to extract the Excel sheet matching lot_num_norm from a DPGF document."""
    try:
        file_url = doc.file_url or ""
        if not file_url.startswith("/uploads/"):
            return ""
        rel = file_url.removeprefix("/uploads/")
        file_path = UPLOADS_ROOT / rel
        if not file_path.exists():
            return ""
        suffix = file_path.suffix.lower()
        if suffix not in (".xlsx", ".xls", ".xlsm", ".ods"):
            return ""
        text = extract_excel_sheet_for_lot(file_path, lot_num_norm)
        return text or ""
    except Exception as e:
        logger.debug(f"DPGF sheet extraction failed for {doc.file_name}: {e}")
        return ""


def _safe_category(value: str | None) -> str:
    valid = {"candidature", "offre", "technique", "planning", "criteres_notation"}
    return value if value in valid else "offre"


def _safe_priority(value: str | None) -> str:
    return value if value in ("obligatoire", "souhaitée") else "obligatoire"


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
