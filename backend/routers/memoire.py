import asyncio
import logging
import threading
from datetime import datetime
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from models.user import User
from models.project import Project, ProjectDocument
from models.memoire import MemoireTechnique
from models.compliance_item import ComplianceItem
from models.organization import Organization
from models.team_member import TeamMember
from models.reference import Reference
from models.memoire_config import MemoireConfig
from models.memoire_template import MemoireTemplate
from schemas.memoire import (
    MemoireGenerateRequest, MemoireUpdateRequest, MemoireResponse,
    PassageRewriteRequest,
)
from routers.auth import get_auth_user
from services.ai.memoire_generator import MemoireGenerator
from services.docx_exporter import build_memoire_docx
from services.maps_service import generate_location_map
from services.document_tagger import get_documents_for_lot
from services import pipeline_tracker, quota
from services.audit_logger import log_action

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/{project_id}/memoire", response_model=MemoireResponse)
def get_memoire(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")
    return memoire


@router.get("/{project_id}/memoire/preflight")
def get_memoire_preflight(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C9a — pre-flight avant génération : profil condensé éditable,
    références classées par pertinence pour CE lot (5-8 pré-cochées),
    rappel quota (« consommera 1 mémoire — X/40 ce mois »)."""
    from services.ai.memoire_generator import _rank_references_for_lot
    from services import quota

    project = _get_project_or_404(project_id, user.organization_id, db)
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    cfg = db.query(MemoireConfig).filter(
        MemoireConfig.organization_id == user.organization_id,
    ).first()

    profil = {
        "nom": (cfg.nom_entreprise if cfg and cfg.nom_entreprise else org.name),
        "gerant_nom": cfg.gerant_nom if cfg else None,
        "gerant_titre": cfg.gerant_titre if cfg else None,
        "zone_intervention": cfg.zone_intervention if cfg else None,
        "activites": (cfg.activites if cfg and cfg.activites else org.activites),
        "organigramme_description": (
            cfg.organigramme_description if cfg and cfg.organigramme_description
            else org.organigramme
        ),
        "moyens_informatiques": (
            cfg.moyens_informatiques if cfg and cfg.moyens_informatiques
            else org.moyens_informatiques
        ),
        "vehicules": (cfg.vehicules if cfg and cfg.vehicules else org.vehicules),
        "materiel": (cfg.materiel if cfg and cfg.materiel else org.materiel),
        "effectif_tranche": org.effectif_tranche,
    }

    refs = db.query(Reference).filter(
        Reference.organization_id == user.organization_id,
        Reference.is_reference == True,
        Reference.deleted_at.is_(None),
    ).all()
    ranked = _rank_references_for_lot(refs, project.selected_lot_name or "")
    # 5 à 8 pré-cochées : les plus pertinentes d'abord (jamais plus de 8).
    preselected_count = min(8, max(5, min(len(ranked), 8))) if ranked else 0
    references = [
        {
            "id": r.id,
            "intitule": r.intitule,
            "lot": r.lot,
            "maitre_ouvrage": r.maitre_ouvrage,
            "annee": r.annee,
            "montant_ht": r.montant_ht,
            "selected": i < preselected_count,
        }
        for i, r in enumerate(ranked)
    ]

    status = quota.get_quota_status(db, org)
    from services.organigramme import organigramme_available

    # BONUS — pièces du coffre proposées en annexes du ZIP d'export
    from models.document import Document as _VaultDoc
    vault_documents = [
        {"id": d.id, "file_name": d.file_name, "category": d.category}
        for d in db.query(_VaultDoc).filter(
            _VaultDoc.organization_id == user.organization_id,
            _VaultDoc.deleted_at.is_(None),
        ).order_by(_VaultDoc.category, _VaultDoc.file_name).all()
    ]

    return {
        "lot": project.selected_lot,
        "profil": profil,
        "references": references,
        "quota": status["memoires"],
        # C8a — l'option organigramme n'est proposée que si le profil équipe
        # permet un rendu réel (jamais d'organigramme vide).
        "organigramme_available": organigramme_available(cfg),
        "vault_documents": vault_documents,
    }


@router.post("/{project_id}/memoire/generate")
@limiter.limit("3/minute")
async def generate_memoire(
    request: Request,
    project_id: str,
    payload: MemoireGenerateRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Lance la génération en TÂCHE DE FOND — même architecture que l'analyse
    détachée : POST → {"status": "started"} immédiat, run en thread démon qui
    survit à la navigation, au reload et à la coupure HTTP/proxy. Suivi via
    /processing-status + SSE ; notification memoire_ready à la fin ; échec →
    statut error + relance, jamais de régression d'étape."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()

    all_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    docs = get_documents_for_lot(all_docs, project.selected_lot)
    if not docs:
        raise HTTPException(status_code=400, detail="Aucun document DCE uploadé")

    # ── Quota (C1) : blocage doux 402 AVANT lancement ; l'unité n'est
    # décomptée qu'AU SUCCÈS, dans le job — « 1 mémoire PAR LOT généré ».
    quota.check_quota(db, org, "memoire")

    # Anti double-run : une génération déjà en cours sur ce projet → 409
    # (AVANT toute écriture : un 409 ne modifie rien, ne consomme rien).
    thread_name = f"synorix-memoire-{project_id[:12]}"
    if any(t.name == thread_name and t.is_alive() for t in threading.enumerate()):
        raise HTTPException(status_code=409, detail="Une génération est déjà en cours pour ce projet.")

    variables = payload.model_dump(
        exclude_none=True,
        exclude={"profile_overrides", "reference_ids", "update_profile"},
    )
    profile_overrides = payload.profile_overrides or None

    # C9a — case « mettre à jour mon profil » : propage les overrides dans la
    # couche stable entreprise (MemoireConfig). Sans la case, ils restent
    # LOCAUX à ce mémoire. Écriture immédiate, hors run.
    if profile_overrides and payload.update_profile:
        memoire_cfg = db.query(MemoireConfig).filter(
            MemoireConfig.organization_id == user.organization_id).first()
        if not memoire_cfg:
            memoire_cfg = MemoireConfig(organization_id=user.organization_id)
            db.add(memoire_cfg)
        _CFG_FIELD_MAP = {"nom": "nom_entreprise"}
        for key, value in profile_overrides.items():
            setattr(memoire_cfg, _CFG_FIELD_MAP.get(key, key), value)

    # État persistant : un reload retrouve « génération en cours ». L'étape
    # ne bouge pas ici — elle n'avance qu'au succès, dans le job.
    project.status = "en_cours"
    project.processing_status = "generating"
    project.processing_detail = ""
    db.commit()

    pipeline_tracker.start_pipeline(project_id, "memoire")
    pipeline_tracker.start_step(project_id, "preparing")
    pipeline_tracker.complete_step(project_id, "preparing")

    # ── Run DÉTACHÉ (thread démon) avec sa propre session DB ────────────────
    thread = threading.Thread(
        target=_run_memoire_job,
        args=(project_id, user.organization_id, user.id, variables,
              profile_overrides, payload.reference_ids),
        daemon=True,
        name=thread_name,
    )
    thread.start()

    return {"status": "started", "project_id": project_id, "lot": project.selected_lot}


def _run_memoire_job(
    project_id: str, org_id: str, user_id: str, variables: dict,
    profile_overrides: dict | None, reference_ids: list | None,
) -> None:
    """Job de génération détaché — session DB propre, tout le contexte est
    rechargé par id (jamais d'objets ORM partagés entre threads)."""
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        org = db.query(Organization).filter(Organization.id == org_id).first()
        memoire_cfg = db.query(MemoireConfig).filter(
            MemoireConfig.organization_id == org_id).first()
        all_docs = db.query(ProjectDocument).filter(
            ProjectDocument.project_id == project_id).all()
        docs = get_documents_for_lot(all_docs, project.selected_lot)
        refs = db.query(Reference).filter(
            Reference.organization_id == org_id,
            Reference.is_reference == True,
        ).all()
        # C9a — sélection du pre-flight : si fournie, seules ces références
        # partent au générateur (ids étrangers ignorés par le scope org).
        if reference_ids is not None:
            wanted = set(reference_ids)
            refs = [r for r in refs if r.id in wanted]
        _CATEGORY_ORDER = {"technique": 0, "planning": 1, "offre": 2, "criteres_notation": 3, "candidature": 4}
        compliance_items_raw = (
            db.query(ComplianceItem)
            .filter(ComplianceItem.project_id == project_id)
            .all()
        )
        compliance_items = sorted(compliance_items_raw, key=lambda c: _CATEGORY_ORDER.get(c.category, 5))

        # Check for reference template (imported mémoire)
        ref_template = db.query(MemoireTemplate).filter(
            MemoireTemplate.organization_id == org_id,
        ).first()
        ref_template_text = None
        if ref_template and ref_template.content_json:
            cj = ref_template.content_json
            parts = [cj.get("preambule", "")]
            for section in ("partie_a", "partie_b", "partie_c"):
                sec = cj.get(section, {})
                if isinstance(sec, dict):
                    parts.extend(sec.values())
            ref_template_text = "\n\n".join(str(p) for p in parts if p)

        # Lot 7 T3 — enrichissement réglementaire, UNIQUEMENT si RAG_ENRICHMENT
        # (env, défaut false). Flag off → chemin strictement inchangé (testé).
        reglementaire_block = None
        from config import get_settings as _gs
        if _gs().RAG_ENRICHMENT:
            from services.rag.enrichment import build_reglementaire_block
            reglementaire_block = build_reglementaire_block(db, compliance_items)

        pipeline_tracker.start_step(project_id, "generating")
        generator = MemoireGenerator()
        content = asyncio.run(generator.generate(
            organization=org,
            memoire_config=memoire_cfg,
            project_name=project.name,
            maitre_ouvrage=project.maitre_ouvrage or "",
            selected_lot_name=project.selected_lot_name or "",
            all_docs=docs,
            compliance_items=compliance_items,
            references=refs,
            variables=variables,
            criteres_jugement=project.criteres_jugement or [],
            reference_template_text=ref_template_text,
            project_id=project_id,
            profile_overrides=profile_overrides,
            reglementaire_block=reglementaire_block,
        ))
        pipeline_tracker.complete_step(project_id, "generating")
        pipeline_tracker.start_step(project_id, "finalizing")

        # Upsert mémoire
        existing = db.query(MemoireTechnique).filter(
            MemoireTechnique.project_id == project_id).first()
        if existing:
            existing.content_json = content
            existing.version += 1
            existing.variables = variables
            existing.profile_overrides = profile_overrides
            existing.generated_at = datetime.utcnow()
            memoire = existing
        else:
            memoire = MemoireTechnique(
                project_id=project_id,
                content_json=content,
                variables=variables,
                profile_overrides=profile_overrides,
            )
            db.add(memoire)

        # Génération réussie → décompte de l'unité (1 mémoire = 1 lot).
        quota.consume(db, org, "memoire", project_id=project_id, lot=project.selected_lot)

        # C23 — notification sobre « mémoire prêt » (in-app + email best-effort).
        from services.notifications import notify as _notify
        _notify(
            db, org_id, "memoire_ready",
            titre=f"Mémoire technique prêt — {project.name}",
            corps=f"Le mémoire du projet « {project.name} »"
                  + (f" ({project.selected_lot_name})" if project.selected_lot_name else "")
                  + " est généré. Relisez-le avant export.",
            send_email=True,
        )

        # Mark steps 4+5 complete, advance to step 6 (export)
        steps = dict(project.completed_steps or {})
        steps["4"] = True
        steps["5"] = True
        project.completed_steps = steps
        if project.current_step < 6:
            project.current_step = 6
        project.status = "en_cours"
        project.processing_status = "ready"
        project.processing_detail = ""
        db.commit()
        pipeline_tracker.complete_pipeline(project_id)

        job_user = db.query(User).filter(User.id == user_id).first()
        if job_user is not None:
            log_action(
                db, job_user, "memoire.generate",
                target_type="project", target_id=project_id,
                extra={"version": memoire.version, "lot": project.selected_lot},
            )
    except Exception as e:
        logger.error(f"Erreur génération mémoire projet {project_id}: {e}", exc_info=True)
        db.rollback()
        pipeline_tracker.fail_pipeline(project_id, str(e))
        try:
            p = db.query(Project).filter(Project.id == project_id).first()
            if p is not None:
                # Jamais de régression d'étape : l'utilisateur retrouve son
                # écran mémoire avec un statut d'erreur et un bouton relancer.
                p.processing_status = "error"
                p.processing_detail = "La génération du mémoire a échoué. Relancez la génération."
                db.commit()
        except Exception:
            logger.exception("Impossible d'enregistrer l'échec mémoire %s", project_id)
    finally:
        db.close()


@router.post("/{project_id}/memoire/rewrite-passage")
@limiter.limit("10/minute")
async def rewrite_passage_endpoint(
    request: Request,
    project_id: str,
    payload: PassageRewriteRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C9b — réécrit le passage sélectionné SEUL (Opus 4.7).

    Ne modifie JAMAIS le mémoire en base : le front affiche le diff
    avant/après et applique (ou non) via le PATCH mémoire existant.
    Usage loggé par org (compteur simple, pas de quota V1)."""
    from services.ai.passage_rewriter import rewrite_passage

    _get_project_or_404(project_id, user.organization_id, db)

    try:
        rewritten = await rewrite_passage(
            payload.passage, payload.action, payload.instruction,
        )
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).error(
            f"Réécriture passage échouée (projet {project_id}): {e}", exc_info=True,
        )
        raise HTTPException(
            status_code=502,
            detail="La réécriture a échoué — réessayez dans un instant.",
        )

    log_action(
        db, user, "memoire.rewrite_passage",
        target_type="project", target_id=project_id,
        extra={"action": payload.action, "chars": len(payload.passage)},
    )
    return {
        "original": payload.passage,
        "rewritten": rewritten,
        "action": payload.action,
    }


def build_project_memoire_docx(project, memoire, org, db) -> bytes:
    """Construit le DOCX complet du mémoire (page de garde, carte,
    organigramme, logo) — source unique pour export-docx, export-pdf et ZIP."""
    org_name = org.name if org else "Entreprise"

    # Generate location map (graceful fallback to None)
    company_address = org.address if org else None
    project_address = project.maitre_ouvrage  # city/name of client as proxy
    map_image, map_caption = generate_location_map(
        company_address or "",
        project_address,
    )

    # C8a — organigramme si l'option a été cochée au pre-flight (fallback
    # gracieux : données devenues insuffisantes → pas d'image, pas d'erreur).
    organigramme_image = None
    if (memoire.variables or {}).get("include_organigramme"):
        from services.organigramme import generate_organigramme_svg, svg_to_png_bytes
        cfg = db.query(MemoireConfig).filter(
            MemoireConfig.organization_id == project.organization_id,
        ).first()
        svg = generate_organigramme_svg(cfg)
        if svg:
            try:
                organigramme_image = svg_to_png_bytes(svg)
            except Exception as e:
                import logging as _logging
                _logging.getLogger(__name__).warning(f"Organigramme non rasterisé: {e}")

    # C8b — logo pour la page de garde (fallback texte propre si absent/illisible)
    logo_image = None
    if org and org.logo_url and org.logo_url.startswith("/uploads/"):
        from services.file_storage import UPLOADS_ROOT as _uploads_root
        logo_path = _uploads_root / org.logo_url.removeprefix("/uploads/")
        if logo_path.exists():
            try:
                logo_image = logo_path.read_bytes()
            except Exception:
                logo_image = None

    # BONUS — Gantt du phasage si des phases ont été saisies au pre-flight
    gantt_image = None
    gantt_phases = (memoire.variables or {}).get("gantt_phases")
    if gantt_phases:
        from services.gantt import generate_gantt_svg
        from services.organigramme import svg_to_png_bytes as _svg_png
        svg = generate_gantt_svg(gantt_phases)
        if svg:
            try:
                gantt_image = _svg_png(svg)
            except Exception as e:
                import logging as _logging
                _logging.getLogger(__name__).warning(f"Gantt non rasterisé: {e}")

    return build_memoire_docx(
        content_json=memoire.content_json,
        project_name=project.name,
        org_name=org_name,
        map_image=map_image,
        map_caption=map_caption,
        organigramme_image=organigramme_image,
        gantt_image=gantt_image,
        logo_image=logo_image,
        lot_name=project.selected_lot_name,
        maitre_ouvrage=project.maitre_ouvrage,
        org_address=org.address if org else None,
        org_siret=org.siret if org else None,
    )


def _attachment_response(content: bytes, filename: str, media_type: str) -> Response:
    ascii_name = filename.encode("ascii", errors="replace").decode("ascii")
    utf8_name = quote(filename, safe="")
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"},
    )


@router.get("/{project_id}/memoire/export-docx")
def export_memoire_docx(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """DOCX = version retouche (le PDF est la version dépôt, cf. export-pdf)."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()

    docx_bytes = build_project_memoire_docx(project, memoire, org, db)
    return _attachment_response(
        docx_bytes,
        f"Memoire_Technique_{project.name.replace(' ', '_')}.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/{project_id}/memoire/export-pdf")
def export_memoire_pdf(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C13a — PDF fidèle du mémoire : la version dépôt par défaut."""
    from services.pdf_export import PdfConversionError, docx_to_pdf, soffice_available

    project = _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")
    if not soffice_available():
        raise HTTPException(
            status_code=503,
            detail="Export PDF indisponible sur ce serveur (LibreOffice manquant) — "
                   "utilisez l'export Word en attendant.",
        )
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()

    docx_bytes = build_project_memoire_docx(project, memoire, org, db)
    try:
        pdf_bytes = docx_to_pdf(docx_bytes)
    except PdfConversionError as exc:
        raise HTTPException(status_code=503, detail=f"Export PDF impossible : {exc}")

    return _attachment_response(
        pdf_bytes,
        f"Memoire_Technique_{project.name.replace(' ', '_')}.pdf",
        "application/pdf",
    )


@router.patch("/{project_id}/memoire", response_model=MemoireResponse)
def update_memoire(
    project_id: str,
    payload: MemoireUpdateRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire introuvable")
    memoire.content_json = payload.content_json
    db.commit()
    db.refresh(memoire)
    return memoire


def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project
