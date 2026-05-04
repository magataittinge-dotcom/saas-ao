import asyncio
import hashlib
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
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
from services import pipeline_tracker
from typing import List

logger = logging.getLogger(__name__)

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/{project_id}/analyze")
@limiter.limit("5/minute")
async def trigger_analysis(
    request: Request,
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

    # ── Deduplicate by content hash ────────────────────────────────────────
    seen_hashes: set[str] = set()
    deduped_docs = []
    for doc in docs:
        if not doc.extracted_text:
            continue
        h = hashlib.md5(doc.extracted_text.encode()).hexdigest()
        if h in seen_hashes:
            print(f"[Analysis] Doublon détecté : {doc.file_name} (hash={h[:8]}), skip", flush=True)
            continue
        seen_hashes.add(h)
        deduped_docs.append(doc)

    # ── Separate documents by type for 2-pass analysis ───────────────────────
    # Pass 1: RC + CCAP + AE ONLY (no "autre" — they bloat the context)
    # Pass 2: CCTP + DPGF ONLY
    PASS1_CAPS = {"rc": 50_000, "ccap": 30_000, "acte_engagement": 10_000}
    PASS2_CAPS = {"cctp": 30_000, "dpgf": 10_000}

    pass1_parts: list[str] = []
    pass2_parts: list[str] = []
    dpgf_sheet_text: str = ""

    for doc in deduped_docs:
        doc_type = doc.type or "autre"
        text = doc.extracted_text or ""
        if not text or text.startswith("[document volumineux"):
            continue

        # Skip types not in either pass (plan, autre, etc.)
        if doc_type not in PASS1_CAPS and doc_type not in PASS2_CAPS:
            continue

        # DPGF with lot: extract matching sheet only
        if doc_type == "dpgf" and lot_num_norm:
            sheet_text = _get_dpgf_sheet_text(doc, lot_num_norm)
            if sheet_text:
                dpgf_sheet_text = sheet_text
                cap = PASS2_CAPS["dpgf"]
                label = f"DPGF — {doc.file_name} (onglet Lot {lot_num_norm})"
                pass2_parts.append(f"=== {label} ===\n{sheet_text[:cap]}")
                continue

        label = doc_type.upper()
        if doc_type in PASS1_CAPS:
            cap = PASS1_CAPS[doc_type]
            entry = f"=== {label} — {doc.file_name} ===\n{text[:cap]}"
            pass1_parts.append(entry)
        elif doc_type in PASS2_CAPS:
            cap = PASS2_CAPS[doc_type]
            entry = f"=== {label} — {doc.file_name} ===\n{text[:cap]}"
            pass2_parts.append(entry)

    if not pass1_parts and not pass2_parts:
        raise HTTPException(
            status_code=400,
            detail="Aucun texte extrait des documents. Assurez-vous d'uploader des PDF ou DOCX lisibles.",
        )

    pass1_text = "\n\n".join(pass1_parts)
    pass2_text = "\n\n".join(pass2_parts) if pass2_parts else None

    p1_tokens = len(pass1_text) // 4
    p2_tokens = (len(pass2_text) // 4) if pass2_text else 0
    print(
        f"[Analysis] 2-pass: "
        f"passe1={len(pass1_text):,} chars (~{p1_tokens:,} tokens, {len(pass1_parts)} docs), "
        f"passe2={len(pass2_text):,} chars (~{p2_tokens:,} tokens, {len(pass2_parts)} docs)"
        if pass2_text else
        f"[Analysis] 2-pass: "
        f"passe1={len(pass1_text):,} chars (~{p1_tokens:,} tokens, {len(pass1_parts)} docs), "
        f"passe2=skip (pas de CCTP/DPGF)",
        flush=True,
    )

    # ── Build lot context header ──────────────────────────────────────────────
    lot_header = ""
    if lot_label:
        lot_header = (
            f"IMPORTANT : Cette analyse concerne spécifiquement le {lot_label}. "
            f"Concentre-toi UNIQUEMENT sur les exigences relatives à ce lot. "
            f"Ignore les informations relatives aux autres lots.\n\n"
        )
        if dpgf_sheet_text:
            lot_header += (
                f"DPGF DU {lot_label} :\n{dpgf_sheet_text[:3000]}\n\n"
            )

    # Update step before analysis
    project.current_step = 3
    project.status = "en_cours"
    db.commit()

    # ── Pipeline tracking: mark upload+extraction+lots as already done ────────
    pipeline_tracker.start_pipeline(project_id, "analysis")
    pipeline_tracker.start_step(project_id, "upload")
    pipeline_tracker.complete_step(project_id, "upload")
    pipeline_tracker.start_step(project_id, "extraction")
    pipeline_tracker.complete_step(project_id, "extraction")
    pipeline_tracker.start_step(project_id, "detecting_lots")
    pipeline_tracker.complete_step(project_id, "detecting_lots")

    # Run 2-pass AI analysis — each pass <60s, total <3min with retries
    analyzer = DCEAnalyzer()
    try:
        # ── Passe 1 ──────────────────────────────────────────────────────────
        pipeline_tracker.start_step(project_id, "analyzing_pass1")
        analysis = await asyncio.wait_for(
            analyzer.extract_full_analysis_multi_pass(
                pass1_text=pass1_text,
                pass2_text=pass2_text,
                lot_header=lot_header,
                selected_lot_name=lot_label,
                on_pass1_done=lambda: (
                    pipeline_tracker.complete_step(project_id, "analyzing_pass1"),
                    pipeline_tracker.start_step(project_id, "analyzing_pass2"),
                ),
                project_id=project_id,
            ),
            timeout=480.0,  # 8 min total (2 passes × 3 retries × ~60s + overhead)
        )
        pipeline_tracker.complete_step(project_id, "analyzing_pass2")
        pipeline_tracker.start_step(project_id, "finalizing")
    except asyncio.TimeoutError:
        pipeline_tracker.fail_pipeline(project_id, "Timeout")
        project.current_step = 2
        db.commit()
        raise HTTPException(status_code=504, detail="L'analyse a pris trop de temps. Réessayez.")
    except Exception as e:
        pipeline_tracker.fail_pipeline(project_id, str(e))
        project.current_step = 2
        db.commit()
        logger.error(f"Erreur analyse IA projet {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de l'analyse IA. Veuillez réessayer.")

    requirements = analysis.get("requirements", [])
    criteres_jugement = analysis.get("criteres_jugement", [])
    infos_marche = analysis.get("infos_marche", {})
    partial_analysis = analysis.get("partial_analysis", False)
    low_requirement_count = analysis.get("low_requirement_count", False)

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

    # Generate checklist from candidature/offre requirements (best-effort)
    checklist_reqs = [r for r in requirements if r.get("category") in ("candidature", "offre")]
    if checklist_reqs:
        try:
            vault_docs = db.query(Document).filter(Document.organization_id == user.organization_id).all()
            matcher = ChecklistMatcher()
            checklist = await matcher.match(checklist_reqs, vault_docs, project_id=project_id, db=db)

            db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).delete()
            for item_data in checklist:
                db.add(ChecklistItem(
                    project_id=project_id,
                    document_type_required=item_data.get("document_type_required", ""),
                    source_kind=item_data.get("source_kind", "vault"),
                    linked_document_id=item_data.get("linked_document_id"),
                    template_project_doc_id=item_data.get("template_project_doc_id"),
                    completed_project_doc_id=item_data.get("completed_project_doc_id"),
                    status=item_data.get("status", "manquant"),
                    details=item_data.get("details"),
                    source_in_rc=item_data.get("source_in_rc"),
                ))
            db.commit()
        except Exception as e:
            logger.warning(f"Checklist generation failed (non-blocking): {e}", exc_info=True)
            db.rollback()

    pipeline_tracker.complete_pipeline(project_id)

    return {
        "status": "done",
        "project_id": project_id,
        "requirements_count": len(requirements),
        "criteres_count": len(criteres_jugement),
        "demo_mode": analyzer.is_demo,
        "docs_sent": docs_sent,
        "docs_total": docs_total,
        **({"partial_analysis": True} if partial_analysis else {}),
        **({"low_requirement_count": True} if low_requirement_count else {}),
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
