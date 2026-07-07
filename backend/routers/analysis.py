import asyncio
import hashlib
import logging
import threading
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
    payload: dict | None = None,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Analyse d'un ou PLUSIEURS lots en un seul run (1 action utilisateur).

    Multi-lots mutualisé : le tronc commun (RC/CCAP/AE) est analysé UNE
    fois et partagé ; seul le spécifique (CCTP/DPGF filtrés) est analysé
    par lot. body optionnel : {"lots": ["lot1", "lot2"]}."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    all_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    docs_total = len(all_docs)

    if not all_docs:
        raise HTTPException(status_code=400, detail="Aucun document uploadé pour ce projet")

    lot_ids = (payload or {}).get("lots") or [project.selected_lot or "all"]
    lot_names = {l.get("id"): l.get("nom") for l in (project.lots_detectes or [])}

    # ── Tronc commun (pass1 : RC+CCAP+AE — identique quel que soit le lot) ──
    pass1_text, truncated1 = _build_pass1_text(all_docs)

    # ── Spécifique par lot (pass2 : CCTP+DPGF filtrés) ───────────────────────
    lot_specs = []
    truncated_files = list(truncated1)
    for lot_id in lot_ids:
        spec = _build_lot_spec(all_docs, lot_id, lot_names, project)
        truncated_files.extend(spec.pop("truncated"))
        lot_specs.append(spec)
    docs_sent = max((s["docs_sent"] for s in lot_specs), default=docs_total)

    if not pass1_text and not any(s["pass2_text"] for s in lot_specs):
        raise HTTPException(
            status_code=400,
            detail="Aucun texte extrait des documents. Assurez-vous d'uploader des PDF ou DOCX lisibles.",
        )

    logger.info("Analyse projet %s : %d lot(s) %s — tronc commun %d chars",
                project_id, len(lot_specs), [s["lot_id"] for s in lot_specs], len(pass1_text))

    # ── Quota (C1) : 1 unité PAR LOT, décomptée AU LANCEMENT ─────────────────
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    status = quota.get_quota_status(db, org)
    limit = status["analyses"]["limit"]
    if limit is not None and status["analyses"]["used"] + len(lot_specs) > limit:
        raise HTTPException(
            status_code=402,
            detail=(f"Quota insuffisant : {len(lot_specs)} lot(s) demandés, "
                    f"{limit - status['analyses']['used']} analyse(s) restante(s) ce mois."),
        )
    for spec in lot_specs:
        quota.check_quota(db, org, "analysis")
        quota.consume(db, org, "analysis", project_id=project_id, lot=spec["lot_id"])

    # Update step before analysis — current_step ne RÉGRESSE plus jamais :
    # un échec d'analyse laisse le projet à l'étape analyse avec un statut
    # d'erreur explicite et un bouton relancer (vision : état persistant).
    project.current_step = 3
    project.status = "en_cours"
    project.processing_status = "analyzing"
    project.processing_detail = ""
    db.commit()

    # Anti double-run : une analyse déjà en cours sur ce projet → 409.
    thread_name = f"synorix-analysis-{project_id[:12]}"
    if any(t.name == thread_name and t.is_alive() for t in threading.enumerate()):
        raise HTTPException(status_code=409, detail="Une analyse est déjà en cours pour ce projet.")

    pipeline_tracker.start_pipeline(project_id, "analysis")
    pipeline_tracker.start_step(project_id, "preparation")
    pipeline_tracker.complete_step(project_id, "preparation")

    # ── Run DÉTACHÉ (thread démon) : l'analyse survit à la navigation, au
    # rechargement de page et à la coupure de la connexion HTTP.
    org_id = user.organization_id
    thread = threading.Thread(
        target=_run_analysis_job,
        args=(project_id, org_id, pass1_text, lot_specs,
              docs_sent, docs_total, truncated_files),
        daemon=True,
        name=thread_name,
    )
    thread.start()

    return {
        "status": "started",
        "project_id": project_id,
        "lots": [s["lot_id"] for s in lot_specs],
        "docs_sent": docs_sent,
        "docs_total": docs_total,
    }


# ── Construction des textes (tronc commun / spécifique par lot) ──────────────

_PASS1_TYPES = {"rc", "ccap", "acte_engagement"}
_PASS2_TYPES = {"cctp", "dpgf"}
# Garde-fou anti-pathologique PAR DOCUMENT (~125 tranches). Le chunking
# anti-troncature couvre 100 % en deçà. Tout dépassement est REMONTÉ à
# l'utilisateur (processing_detail), jamais silencieux.
_SAFETY_MAX_CHARS = 500_000


def _dedup_by_content(docs) -> list:
    seen: set = set()
    out = []
    for doc in docs:
        if not doc.extracted_text:
            continue
        h = hashlib.md5(doc.extracted_text.encode()).hexdigest()
        if h in seen:
            continue
        seen.add(h)
        out.append(doc)
    return out


def _safety(text: str, fname: str, truncated: list) -> str:
    if len(text) > _SAFETY_MAX_CHARS:
        logger.warning("[Analysis] %s : %d chars > garde-fou %d → tronqué (REMONTÉ à l'utilisateur)",
                       fname, len(text), _SAFETY_MAX_CHARS)
        truncated.append(fname)
        return text[:_SAFETY_MAX_CHARS]
    return text


def _build_pass1_text(all_docs) -> tuple:
    """Texte du tronc commun (RC/CCAP/AE) — identique pour tous les lots."""
    truncated: list = []
    parts = []
    for doc in _dedup_by_content(all_docs):
        doc_type = doc.type or "autre"
        text = doc.extracted_text or ""
        if doc_type not in _PASS1_TYPES or not text or text.startswith("[document volumineux"):
            continue
        parts.append(f"=== {doc_type.upper()} — {doc.file_name} ===\n{_safety(text, doc.file_name, truncated)}")
    return "\n\n".join(parts), truncated


def _build_lot_spec(all_docs, lot_id, lot_names, project) -> dict:
    """pass2_text + en-tête de contexte pour UN lot."""
    truncated: list = []
    docs = get_documents_for_lot(all_docs, lot_id)
    lot_num_norm = _normalize_lot_num(lot_id) if lot_id and lot_id != "all" else None
    lot_label = (lot_names.get(lot_id)
                 or (project.selected_lot_name if lot_id == project.selected_lot else None)
                 or (f"Lot {lot_num_norm}" if lot_num_norm else None))

    parts: list = []
    dpgf_sheet_text = ""
    for doc in _dedup_by_content(docs):
        doc_type = doc.type or "autre"
        text = doc.extracted_text or ""
        if doc_type not in _PASS2_TYPES or not text or text.startswith("[document volumineux"):
            continue
        if doc_type == "dpgf" and lot_num_norm:
            sheet_text = _get_dpgf_sheet_text(doc, lot_num_norm)
            if sheet_text:
                dpgf_sheet_text = sheet_text
                parts.append(f"=== DPGF — {doc.file_name} (onglet Lot {lot_num_norm}) ===\n"
                             f"{_safety(sheet_text, doc.file_name, truncated)}")
                continue
        parts.append(f"=== {doc_type.upper()} — {doc.file_name} ===\n{_safety(text, doc.file_name, truncated)}")

    lot_header = ""
    if lot_label:
        lot_header = (
            f"IMPORTANT : Cette analyse concerne spécifiquement le {lot_label}. "
            f"Concentre-toi UNIQUEMENT sur les exigences relatives à ce lot. "
            f"Ignore les informations relatives aux autres lots.\n\n"
        )
        if dpgf_sheet_text:
            lot_header += f"DPGF DU {lot_label} :\n{dpgf_sheet_text[:3000]}\n\n"

    return {
        "lot_id": lot_id or "all",
        "lot_label": lot_label,
        "pass2_text": "\n\n".join(parts) if parts else None,
        "lot_header": lot_header,
        "docs_sent": len(docs),
        "truncated": truncated,
    }


def _fail_analysis(project_id: str, user_message: str, tracker_reason: str) -> None:
    """Échec du job : statut erreur EXPLICITE, jamais de régression d'étape."""
    from database import SessionLocal
    pipeline_tracker.fail_pipeline(project_id, tracker_reason)
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.processing_status = "error"
            project.processing_detail = user_message
            db.commit()
    finally:
        db.close()


def _build_anchor_docs(db: Session, project_id: str) -> tuple:
    """(textes, chemins PDF) des documents sources pour l'ancrage verbatim."""
    docs = db.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id).all()
    texts, paths = {}, {}
    for d in docs:
        txt = d.extracted_text or ""
        if len(txt) < 50 or txt.startswith("[document volumineux"):
            continue
        if (d.type or "autre") in ("rc", "ccap", "acte_engagement", "cctp", "dpgf",
                                   "acte_engagement_template", "dpgf_template"):
            texts[d.file_name] = txt
            if d.file_url and d.file_name.lower().endswith(".pdf"):
                p = UPLOADS_ROOT / d.file_url.removeprefix("/uploads/")
                if p.exists():
                    paths[d.file_name] = str(p)
    return texts, paths


def _anchor_and_persist(db: Session, project_id: str, requirements: list) -> None:
    """Ancrage verbatim (sourcé, jamais halluciné) + correction des pages,
    PUIS persistance."""
    from services.ai.excerpt_anchor import anchor_requirements, resolve_pages
    pipeline_tracker.update_step_progress(project_id, 0.1, detail="Ancrage des sources dans les documents…")
    try:
        texts, paths = _build_anchor_docs(db, project_id)
        anchor_requirements(requirements, texts)
        pipeline_tracker.update_step_progress(project_id, 0.4, detail="Vérification des pages sources…")
        resolve_pages(requirements, paths)
    except Exception:
        logger.warning("Ancrage des sources échoué (non bloquant)", exc_info=True)
    _persist_requirements(db, project_id, requirements)


def _persist_requirements(db: Session, project_id: str, requirements: list) -> None:
    """Écrit les exigences (delete + insert) — appelé au fil de l'eau après
    chaque passe : un crash en passe 2 ne perd pas la passe 1."""
    db.query(ComplianceItem).filter(ComplianceItem.project_id == project_id).delete()
    for req in requirements:
        db.add(ComplianceItem(
            project_id=project_id,
            exigence_text=req.get("exigence", ""),
            source_document=req.get("source_document"),
            source_page=req.get("source_page") or 1,
            source_excerpt=req.get("source_excerpt"),
            category=_safe_category(req.get("category")),
            priority=_safe_priority(req.get("priority")),
            status="non_couvert",
        ))
    db.commit()


def _requirements_from_rows(rows) -> list:
    return [{
        "exigence": r.exigence_text, "source_document": r.source_document,
        "source_page": r.source_page, "source_excerpt": r.source_excerpt,
        "category": r.category, "priority": r.priority,
    } for r in rows]


def _run_analysis_job(
    project_id: str,
    org_id: str,
    pass1_text: str,
    lot_specs: list,
    docs_sent: int,
    docs_total: int,
    truncated_files: list,
) -> None:
    """Analyse multi-lots MUTUALISÉE — thread démon, session DB propre.

    Tronc commun (pass1) : réutilisé s'il existe déjà en base ('_commun'),
    sinon analysé une fois. Spécifique (pass2) : par lot, en parallèle
    borné (2). Jamais d'exception qui fuit."""
    from concurrent.futures import ThreadPoolExecutor
    from database import SessionLocal
    from services.ai.dce_analyzer import _build_dce_skills
    from services.ai.prompts import DCE_PASS1_SYSTEM, DCE_PASS2_SYSTEM

    analyzer = DCEAnalyzer()
    db = SessionLocal()
    try:
        # ── Tronc commun ────────────────────────────────────────────────────
        pipeline_tracker.start_step(project_id, "analyzing_pass1")
        commun_rows = db.query(ComplianceItem).filter(
            ComplianceItem.project_id == project_id,
            ComplianceItem.lot == "_commun",
        ).all()
        project = db.query(Project).filter(Project.id == project_id).first()

        try:
            if commun_rows:
                logger.info("Analyse %s : tronc commun RÉUTILISÉ (%d exigences, 0 appel Claude)",
                            project_id, len(commun_rows))
                commun_reqs = _requirements_from_rows(commun_rows)
                criteres = project.criteres_jugement or []
                infos = project.infos_marche or {}
            else:
                skills1, _ = _build_dce_skills(None)
                r1 = analyzer._run_pass_chunked(
                    pass1_text, DCE_PASS1_SYSTEM, "passe1-admin",
                    skills1, project_id, "", "Analyse administrative (tronc commun)",
                )
                commun_reqs = r1.get("requirements", [])
                criteres = r1.get("criteres_jugement", [])
                infos = r1.get("infos_marche", {})
                # Ancrage + persistance du tronc commun (scope '_commun' ;
                # les lignes legacy lot IS NULL sont remplacées ici).
                _anchor_requirements_safe(db, project_id, commun_reqs)
                _persist_scope(db, project_id, commun_reqs, "_commun", also_null=True)
        except ClaudeRateLimitError as e:
            logger.warning(f"Rate limit Anthropic projet {project_id}: {e}")
            _fail_analysis(project_id, "Limite Anthropic atteinte. Relancez dans une minute.", "rate_limit")
            return
        except Exception as e:
            logger.error(f"Erreur analyse IA (tronc commun) {project_id}: {e}", exc_info=True)
            _fail_analysis(project_id, "Erreur lors de l'analyse IA. Relancez l'analyse.", str(e))
            return

        pipeline_tracker.complete_step(project_id, "analyzing_pass1")
        pipeline_tracker.start_step(project_id, "analyzing_pass2")

        # ── Spécifique par lot, parallèle borné (2) ─────────────────────────
        def _one_lot(spec):
            if not spec["pass2_text"]:
                return spec, {"requirements": []}
            skills_lot, _ = _build_dce_skills(spec["lot_label"])
            r2 = analyzer._run_pass_chunked(
                spec["pass2_text"], DCE_PASS2_SYSTEM, f"passe2-{spec['lot_id']}",
                skills_lot, project_id, spec["lot_header"],
                f"Analyse technique — {spec['lot_label'] or spec['lot_id']}",
            )
            return spec, r2

        results = []
        failed_lots = []
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(_one_lot, spec) for spec in lot_specs]
                for fut in futures:
                    try:
                        results.append(fut.result(timeout=1200))
                    except ClaudeRateLimitError:
                        failed_lots.append("rate_limit")
                    except Exception as e:
                        logger.error("Analyse lot échouée: %s", e, exc_info=True)
                        failed_lots.append(str(e))
        except Exception as e:
            logger.error("Pool lots: %s", e, exc_info=True)

        if not results and failed_lots:
            _fail_analysis(project_id,
                           "Limite Anthropic atteinte. Relancez dans une minute."
                           if "rate_limit" in failed_lots else
                           "Erreur lors de l'analyse IA. Relancez l'analyse.",
                           ";".join(failed_lots))
            return

        pipeline_tracker.complete_step(project_id, "analyzing_pass2")
        pipeline_tracker.start_step(project_id, "finalizing")

        # ── Persistance par lot + finalisation ──────────────────────────────
        all_requirements = list(commun_reqs)
        for spec, r2 in results:
            reqs2 = _dedup_against(r2.get("requirements", []), commun_reqs)
            _anchor_requirements_safe(db, project_id, reqs2)
            _persist_scope(db, project_id, reqs2, spec["lot_id"])
            all_requirements.extend(reqs2)
            logger.info("Analyse %s : lot %s → %d exigences spécifiques",
                        project_id, spec["lot_id"], len(reqs2))

        analysis = {
            "requirements": all_requirements,
            "criteres_jugement": criteres,
            "infos_marche": infos,
        }
        _finalize_analysis(db, project_id, org_id, analysis, docs_sent, docs_total,
                           lot_specs=lot_specs, truncated_files=truncated_files,
                           failed_lots=failed_lots)
    except Exception as e:
        logger.error(f"Analyse {project_id} : échec de finalisation: {e}", exc_info=True)
        _fail_analysis(project_id, "Erreur lors de l'enregistrement des résultats. Relancez l'analyse.", str(e))
    finally:
        db.close()


def _dedup_against(new_reqs: list, existing: list) -> list:
    """Écarte les exigences déjà présentes dans le tronc commun (mêmes 60
    premiers caractères normalisés)."""
    seen = {(r.get("exigence") or "").lower().strip()[:60] for r in existing}
    return [r for r in new_reqs
            if (r.get("exigence") or "").lower().strip()[:60] not in seen]


def _anchor_requirements_safe(db: Session, project_id: str, requirements: list) -> None:
    from services.ai.excerpt_anchor import anchor_requirements, resolve_pages
    try:
        texts, paths = _build_anchor_docs(db, project_id)
        anchor_requirements(requirements, texts)
        resolve_pages(requirements, paths)
    except Exception:
        logger.warning("Ancrage des sources échoué (non bloquant)", exc_info=True)


def _persist_scope(db: Session, project_id: str, requirements: list,
                   lot: str, also_null: bool = False) -> None:
    """Remplace les exigences d'UN scope (lot) — ne touche JAMAIS les
    autres lots (fini l'écrasement global)."""
    q = db.query(ComplianceItem).filter(ComplianceItem.project_id == project_id)
    if also_null:
        q = q.filter((ComplianceItem.lot == lot) | (ComplianceItem.lot.is_(None)))
    else:
        q = q.filter(ComplianceItem.lot == lot)
    q.delete(synchronize_session=False)
    for req in requirements:
        db.add(ComplianceItem(
            project_id=project_id,
            exigence_text=req.get("exigence", ""),
            source_document=req.get("source_document"),
            source_page=req.get("source_page") or 1,
            source_excerpt=req.get("source_excerpt"),
            category=_safe_category(req.get("category")),
            priority=_safe_priority(req.get("priority")),
            status="non_couvert",
            lot=lot,
        ))
    db.commit()


def _finalize_analysis(
    db: Session, project_id: str, org_id: str, analysis: dict,
    docs_sent: int, docs_total: int,
    lot_specs: list | None = None, truncated_files: list | None = None,
    failed_lots: list | None = None,
) -> None:
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        return
    all_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()

    requirements = analysis.get("requirements", [])
    criteres_jugement = analysis.get("criteres_jugement", [])
    infos_marche = analysis.get("infos_marche", {})
    partial_analysis = analysis.get("partial_analysis", False)
    low_requirement_count = analysis.get("low_requirement_count", False)

    if not requirements:
        _fail_analysis(project_id,
                       "L'IA n'a pas pu extraire d'exigences. Vérifiez que les documents "
                       "contiennent du texte lisible, puis relancez.", "no_requirements")
        return

    # Store critères and infos on project
    project.criteres_jugement = criteres_jugement or None
    project.infos_marche = infos_marche or None

    # Auto-fill maitre_ouvrage from infos_marche if not already set
    if infos_marche and infos_marche.get("maitre_ouvrage") and not project.maitre_ouvrage:
        project.maitre_ouvrage = infos_marche["maitre_ouvrage"]

    # ── C5 : champs critiques structurés, persistés PAR LOT ──────────────────
    # (une relance d'analyse sur un autre lot n'écrase pas ceux-ci)
    from services.critical_fields import build_critical_fields
    fields = build_critical_fields(infos_marche, criteres_jugement, all_docs)
    existing_cf = dict(project.critical_fields or {})
    for lot_key in ([s_["lot_id"] for s_ in (lot_specs or [])] or [project.selected_lot or "_all"]):
        existing_cf[lot_key] = fields
    project.critical_fields = existing_cf

    # (ancrage + persistance déjà faits PAR SCOPE — commun et chaque lot)
    pipeline_tracker.update_step_progress(project_id, 0.6, detail="Enregistrement des résultats…")

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
    project.processing_status = "ready"
    warnings_ui = []
    if truncated_files:
        warnings_ui.append(
            f"{len(set(truncated_files))} document(s) exceptionnellement long(s) tronqué(s) "
            f"au garde-fou de 500 000 caractères : {', '.join(sorted(set(truncated_files))[:3])}")
    if failed_lots:
        warnings_ui.append(f"{len(failed_lots)} lot(s) en échec — relancez-les.")
    project.processing_detail = " · ".join(warnings_ui)
    db.commit()

    # Checklist de Vérification — générée depuis la BASE (scopes multi-lots
    # agrégés, dédupliqués) ; échec loggé ET visible, plus jamais silencieux.
    pipeline_tracker.update_step_progress(
        project_id, 0.8, detail="Génération de la checklist de candidature…")
    try:
        from services.checklist_builder import generate_checklist_from_db
        n_checklist = generate_checklist_from_db(db, project_id, org_id)
        if n_checklist == 0:
            logger.warning("Checklist vide après analyse %s", project_id)
    except Exception as e:
        logger.error(f"Génération checklist échouée (réparable via "
                     f"/checklist/regenerate): {e}", exc_info=True)
        db.rollback()

    pipeline_tracker.complete_pipeline(project_id)
    logger.info(
        "Analyse %s terminée : %d exigences, %d critères (docs %d/%d%s%s)",
        project_id, len(requirements), len(criteres_jugement), docs_sent, docs_total,
        ", partielle" if partial_analysis else "",
        ", peu d'exigences" if low_requirement_count else "",
    )


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
