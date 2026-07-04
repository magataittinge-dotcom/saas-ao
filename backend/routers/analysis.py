import asyncio
import hashlib
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from database import get_db
from models.organization import Organization
from models.user import User
from models.project import Project, ProjectDocument
from models.compliance_item import ComplianceItem
from models.checklist_item import ChecklistItem
from models.document import Document
from schemas.compliance import ComplianceItemResponse
from routers.auth import get_auth_user
from services.ai.dce_analyzer import DCEAnalyzer, ClaudeRateLimitError
from services.ai.checklist_matcher import ChecklistMatcher
from services.document_tagger import (
    get_documents_for_lot, extract_excel_sheet_for_lot, _normalize_lot_num,
)
from services import pipeline_tracker, quota
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
    #
    # Plus de troncature par cap (régression "30k → 71% du CCAP perdu", cf.
    # docs/rag/PHASE0-investigation-troncature.md). Le document ENTIER est
    # envoyé ; le découpage en tranches est fait par l'analyzer (chunking +
    # dédup). On garde un garde-fou anti-pathologique, JAMAIS silencieux.
    PASS1_TYPES = {"rc", "ccap", "acte_engagement"}
    PASS2_TYPES = {"cctp", "dpgf"}
    _SAFETY_MAX_CHARS = 300_000   # ~75 tranches : protège le serveur des cas extrêmes

    def _safety(text: str, fname: str) -> str:
        if len(text) > _SAFETY_MAX_CHARS:
            logger.warning(
                "[Analysis] %s : %d chars > garde-fou %d → tronqué "
                "(cas pathologique ; en deçà le chunking couvre 100%%)",
                fname, len(text), _SAFETY_MAX_CHARS,
            )
            print(
                f"[Analysis] ⚠ {fname}: {len(text):,} chars > garde-fou "
                f"{_SAFETY_MAX_CHARS:,} → tronqué",
                flush=True,
            )
            return text[:_SAFETY_MAX_CHARS]
        return text

    pass1_parts: list[str] = []
    pass2_parts: list[str] = []
    dpgf_sheet_text: str = ""

    for doc in deduped_docs:
        doc_type = doc.type or "autre"
        text = doc.extracted_text or ""
        if not text or text.startswith("[document volumineux"):
            continue

        # Skip types not in either pass (plan, autre, etc.)
        if doc_type not in PASS1_TYPES and doc_type not in PASS2_TYPES:
            continue

        # DPGF with lot: extract matching sheet only
        if doc_type == "dpgf" and lot_num_norm:
            sheet_text = _get_dpgf_sheet_text(doc, lot_num_norm)
            if sheet_text:
                dpgf_sheet_text = sheet_text
                label = f"DPGF — {doc.file_name} (onglet Lot {lot_num_norm})"
                pass2_parts.append(f"=== {label} ===\n{_safety(sheet_text, doc.file_name)}")
                continue

        label = doc_type.upper()
        entry = f"=== {label} — {doc.file_name} ===\n{_safety(text, doc.file_name)}"
        if doc_type in PASS1_TYPES:
            pass1_parts.append(entry)
        else:
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

    # ── Quota (C1) : 1 analyse décomptée AU LANCEMENT ─────────────────────────
    # Vérifié après les validations (une 400 ne consomme pas) mais avant tout
    # appel Claude — un échec d'analyse ultérieur reste décompté.
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    quota.check_quota(db, org, "analysis")
    quota.consume(db, org, "analysis", project_id=project_id, lot=project.selected_lot)

    # Update step before analysis
    project.current_step = 3
    project.status = "en_cours"
    db.commit()

    # ── Pipeline tracking: prep is done by the time we get here (upload +
    # lot detection happened on previous routes). We still emit a tracked
    # 'preparation' step so the UI bar starts at 0 and briefly ticks to
    # 5 %, then the IA passes own the rest of the cercle.
    pipeline_tracker.start_pipeline(project_id, "analysis")
    pipeline_tracker.start_step(project_id, "preparation")
    pipeline_tracker.complete_step(project_id, "preparation")

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
            # 15 min : avec le chunking (Option A), un gros DCE peut générer
            # plusieurs tranches séquentielles (CCAP/CCTP volumineux) + backoff
            # rate-limit Anthropic. Le streaming garde la connexion vivante.
            # Si des proxys prod coupent les requêtes longues → passer en async
            # (Option C) ; cf. docs/rag/PHASE0-investigation-troncature.md.
            timeout=900.0,
        )
        pipeline_tracker.complete_step(project_id, "analyzing_pass2")
        pipeline_tracker.start_step(project_id, "finalizing")
    except asyncio.TimeoutError:
        pipeline_tracker.fail_pipeline(project_id, "Timeout")
        project.current_step = 2
        db.commit()
        raise HTTPException(status_code=504, detail="L'analyse a pris trop de temps. Réessayez.")
    except ClaudeRateLimitError as e:
        # The Anthropic input-token rate limit is hard to predict per
        # workspace; surface it as a 503 with a clear message + Retry-After
        # header so the frontend can offer a meaningful "réessayer" CTA
        # instead of a scary 500.
        pipeline_tracker.fail_pipeline(project_id, "rate_limit")
        project.current_step = 2
        db.commit()
        logger.warning(f"Rate limit Anthropic projet {project_id}: {e}")
        raise HTTPException(
            status_code=503,
            detail="Limite Anthropic atteinte. Réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
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

    # ── C5 : champs critiques structurés, persistés PAR LOT ──────────────────
    # (une relance d'analyse sur un autre lot n'écrase pas ceux-ci)
    from services.critical_fields import build_critical_fields
    lot_key = project.selected_lot or "_all"
    fields = build_critical_fields(infos_marche, criteres_jugement, all_docs)
    existing_cf = dict(project.critical_fields or {})
    existing_cf[lot_key] = fields
    project.critical_fields = existing_cf

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

    # Advance to step 3 (analysis results) when done.
    # Also flip status from 'en_cours' to 'analyzed' so the frontend can
    # auto-route the user to the next step on the next project refetch.
    steps = dict(project.completed_steps or {})
    steps["3"] = True
    project.completed_steps = steps
    if project.current_step <= 3:
        project.current_step = 4
    if project.status in ("brouillon", "en_cours"):
        project.status = "analyzed"
    db.commit()

    # Generate checklist from candidature/offre requirements (best-effort)
    checklist_reqs = [r for r in requirements if r.get("category") in ("candidature", "offre")]
    if checklist_reqs:
        try:
            vault_docs = db.query(Document).filter(Document.organization_id == user.organization_id).all()
            matcher = ChecklistMatcher()
            checklist = await matcher.match(checklist_reqs, vault_docs, project_id=project_id, db=db)

            db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).delete()
            for idx, item_data in enumerate(checklist):
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
                    # C13b — ordre du RC (ordre des exigences de l'analyse)
                    rc_position=idx,
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


@router.get("/{project_id}/critical-fields")
def get_critical_fields(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C5 — champs critiques structurés du lot courant (bandeau d'analyse).

    Calcul paresseux pour les projets analysés avant l'existence du bandeau :
    reconstruit depuis infos_marche/criteres + RC/CCAP, puis persiste sous la
    clé du lot."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    lot_key = project.selected_lot or "_all"
    cache = dict(project.critical_fields or {})
    if lot_key not in cache:
        from services.critical_fields import build_critical_fields
        docs = db.query(ProjectDocument).filter(
            ProjectDocument.project_id == project_id,
        ).all()
        cache[lot_key] = build_critical_fields(
            project.infos_marche, project.criteres_jugement, docs,
        )
        project.critical_fields = cache
        db.commit()
    return {"lot": project.selected_lot, "fields": cache[lot_key]}


@router.get("/{project_id}/tresorerie")
def get_tresorerie(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C19 — trésorerie du marché « en clair » (lecture factuelle du CCAP).

    Déterministe, calculé à la volée depuis les données extraites + regex
    ciblées. Ne commente JAMAIS le prix ni le chiffrage."""
    from services.tresorerie import build_tresorerie
    project = _get_project_or_404(project_id, user.organization_id, db)
    docs = db.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id,
    ).all()
    lignes = build_tresorerie(project.infos_marche, docs)
    return {"lot": project.selected_lot, "lignes": lignes}


@router.get("/{project_id}/retroplanning")
def get_retroplanning(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C20 — rétro-planning du lot courant, dérivé des champs critiques (C5)."""
    from services.critical_fields import build_critical_fields
    from services.retroplanning import build_retroplanning

    project = _get_project_or_404(project_id, user.organization_id, db)
    lot_key = project.selected_lot or "_all"
    cache = dict(project.critical_fields or {})
    if lot_key not in cache:
        docs = db.query(ProjectDocument).filter(
            ProjectDocument.project_id == project_id,
        ).all()
        cache[lot_key] = build_critical_fields(
            project.infos_marche, project.criteres_jugement, docs,
        )
        project.critical_fields = cache
        db.commit()
    return {"lot": project.selected_lot, "steps": build_retroplanning(cache[lot_key])}


@router.get("/{project_id}/synorix-score")
def get_synorix_score(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C18 — Synorix Score go/no-go : croisement factuel DCE × profil org.

    Déterministe, aucun LLM, aucun commentaire de prix."""
    from models.memoire_config import MemoireConfig
    from services.critical_fields import build_critical_fields
    from services.synorix_score import build_score

    project = _get_project_or_404(project_id, user.organization_id, db)
    lot_key = project.selected_lot or "_all"
    cache = dict(project.critical_fields or {})
    if lot_key not in cache:
        docs = db.query(ProjectDocument).filter(
            ProjectDocument.project_id == project_id,
        ).all()
        cache[lot_key] = build_critical_fields(
            project.infos_marche, project.criteres_jugement, docs,
        )
        project.critical_fields = cache
        db.commit()

    memoire_config = db.query(MemoireConfig).filter(
        MemoireConfig.organization_id == user.organization_id,
    ).first()
    vault_docs = db.query(Document).filter(
        Document.organization_id == user.organization_id,
        Document.deleted_at.is_(None),
    ).all()
    compliance_items = db.query(ComplianceItem).filter(
        ComplianceItem.project_id == project_id,
    ).all()

    result = build_score(
        memoire_config=memoire_config,
        vault_docs=vault_docs,
        compliance_items=compliance_items,
        criteres_jugement=project.criteres_jugement,
        critical_fields=cache[lot_key],
        infos_marche=project.infos_marche,
    )
    result["lot"] = project.selected_lot
    return result


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
