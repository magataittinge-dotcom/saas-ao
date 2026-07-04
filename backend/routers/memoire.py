from datetime import datetime
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
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
    return {
        "lot": project.selected_lot,
        "profil": profil,
        "references": references,
        "quota": status["memoires"],
    }


@router.post("/{project_id}/memoire/generate", response_model=MemoireResponse)
@limiter.limit("3/minute")
async def generate_memoire(
    request: Request,
    project_id: str,
    payload: MemoireGenerateRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)

    # Fetch all context needed
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    memoire_cfg = db.query(MemoireConfig).filter(MemoireConfig.organization_id == user.organization_id).first()
    all_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    docs = get_documents_for_lot(all_docs, project.selected_lot)
    refs = db.query(Reference).filter(
        Reference.organization_id == user.organization_id,
        Reference.is_reference == True,
    ).all()
    # C9a — sélection du pre-flight : si fournie, seules ces références
    # partent au générateur (les ids étrangers sont ignorés par le scope org).
    if payload.reference_ids is not None:
        wanted = set(payload.reference_ids)
        refs = [r for r in refs if r.id in wanted]
    _CATEGORY_ORDER = {"technique": 0, "planning": 1, "offre": 2, "criteres_notation": 3, "candidature": 4}
    compliance_items_raw = (
        db.query(ComplianceItem)
        .filter(ComplianceItem.project_id == project_id)
        .all()
    )
    compliance_items = sorted(compliance_items_raw, key=lambda c: _CATEGORY_ORDER.get(c.category, 5))

    if not docs:
        raise HTTPException(status_code=400, detail="Aucun document DCE uploadé")

    # ── Quota (C1) : vérifié AVANT la génération (blocage doux 402) ; l'unité
    # n'est décomptée qu'au succès — « 1 mémoire PAR LOT généré ».
    quota.check_quota(db, org, "memoire")

    variables = payload.model_dump(
        exclude_none=True,
        exclude={"profile_overrides", "reference_ids", "update_profile"},
    )
    profile_overrides = payload.profile_overrides or None

    # C9a — case « mettre à jour mon profil » : propage les overrides dans la
    # couche stable entreprise (MemoireConfig). Sans la case, ils restent
    # LOCAUX à ce mémoire.
    if profile_overrides and payload.update_profile:
        if not memoire_cfg:
            memoire_cfg = MemoireConfig(organization_id=user.organization_id)
            db.add(memoire_cfg)
        _CFG_FIELD_MAP = {"nom": "nom_entreprise"}
        for key, value in profile_overrides.items():
            setattr(memoire_cfg, _CFG_FIELD_MAP.get(key, key), value)

    # Check for reference template (imported mémoire)
    ref_template = db.query(MemoireTemplate).filter(
        MemoireTemplate.organization_id == user.organization_id,
    ).first()
    ref_template_text = None
    if ref_template and ref_template.content_json:
        # Flatten content_json to text for style reference
        cj = ref_template.content_json
        parts = [cj.get("preambule", "")]
        for section in ("partie_a", "partie_b", "partie_c"):
            sec = cj.get(section, {})
            if isinstance(sec, dict):
                parts.extend(sec.values())
        ref_template_text = "\n\n".join(str(p) for p in parts if p)

    # ── Pipeline tracking for memoire generation ───────────────────────────
    pipeline_tracker.start_pipeline(project_id, "memoire")
    pipeline_tracker.start_step(project_id, "preparing")
    pipeline_tracker.complete_step(project_id, "preparing")
    pipeline_tracker.start_step(project_id, "generating")

    generator = MemoireGenerator()
    try:
        content = await generator.generate(
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
        )
        pipeline_tracker.complete_step(project_id, "generating")
        pipeline_tracker.start_step(project_id, "finalizing")
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).error(f"Erreur génération mémoire projet {project_id}: {e}", exc_info=True)
        pipeline_tracker.fail_pipeline(project_id, str(e))
        raise HTTPException(status_code=500, detail="Erreur lors de la génération du mémoire. Veuillez réessayer.")

    # Upsert mémoire
    existing = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
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

    pipeline_tracker.complete_pipeline(project_id)

    # Mark steps 4+5 complete, advance to step 6 (export)
    steps = dict(project.completed_steps or {})
    steps["4"] = True
    steps["5"] = True
    project.completed_steps = steps
    if project.current_step < 6:
        project.current_step = 6
    project.status = "en_cours"

    db.commit()
    db.refresh(memoire)
    log_action(
        db, user, "memoire.generate",
        target_type="project", target_id=project_id,
        extra={"version": memoire.version, "lot": project.selected_lot},
    )
    return memoire


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


@router.get("/{project_id}/memoire/export-docx")
def export_memoire_docx(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")

    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    org_name = org.name if org else "Entreprise"

    # Generate location map (graceful fallback to None)
    company_address = org.address if org else None
    project_address = project.maitre_ouvrage  # city/name of client as proxy
    map_image, map_caption = generate_location_map(
        company_address or "",
        project_address,
    )

    docx_bytes = build_memoire_docx(
        content_json=memoire.content_json,
        project_name=project.name,
        org_name=org_name,
        map_image=map_image,
        map_caption=map_caption,
    )

    filename = f"Memoire_Technique_{project.name.replace(' ', '_')}.docx"
    ascii_name = filename.encode("ascii", errors="replace").decode("ascii")
    utf8_name = quote(filename, safe="")
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"},
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
