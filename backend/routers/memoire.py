import asyncio
import logging
import threading
from datetime import datetime
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import or_, update as _sql_update
from sqlalchemy.orm import Session, defer

from database import SessionLocal, get_db, rendre_connexion
from models.user import User
from models.project import Project, ProjectDocument
from models.memoire import MemoireTechnique
from models.compliance_item import ComplianceItem
from services.ai.dtu_autorises import regle_dtu
from models.organization import Organization
from models.team_member import TeamMember
from models.reference import Reference
from models.memoire_config import MemoireConfig
from models.memoire_template import MemoireTemplate
from schemas.memoire import (
    MemoireGenerateRequest, MemoireUpdateRequest, MemoireResponse,
    PassageRewriteRequest, EtatSectionRequest,
)
from routers.auth import get_auth_user
from services import budget_ia
from services.budget_ia import exiger_budget_ia  # S-01 — filet du budget d'IA par organisation et par jour
from services.ai.memoire_generator import MemoireGenerator
from services.chrono import chronometre, lot_du_projet
from services.docx_exporter import build_memoire_docx
from services.raison_sociale import nom_entreprise_effectif, raison_sociale_de
from services.maps_service import generate_location_map, lieu_execution, lieu_source
from services.document_tagger import get_documents_for_lot


def _ids_des_lots(project) -> list:
    """Ids des lots du RC (« lot1 »…) : les sous-lots « 01a » s'y rattachent."""
    return [l.get("id") for l in (project.lots_detectes or []) if l.get("id")]
from services import pipeline_tracker, quota
from services.audit_logger import log_action
from services.project_status import ensure_relaunchable

logger = logging.getLogger(__name__)

router = APIRouter()
from services.rate_limit import limiter  # S1.2 — limiter partagé (org-keyed)


@router.get("/{project_id}/memoire", response_model=MemoireResponse,
            responses={204: {"description": "Pas encore de mémoire pour ce projet"}})
def get_memoire(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, user.organization_id, db)   # 404 : projet inconnu ou d'une autre organisation
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        # R31 : « pas encore de mémoire » est un état normal, pas une erreur : 204, la console du navigateur reste muette.
        return Response(status_code=204)
    return memoire


@router.get("/{project_id}/memoire/criteres")
def get_memoire_criteres(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """E1 — sous-critères du RC (hors prix) rattachés aux parties du mémoire, et ceux « À couvrir ».
    Calcul déterministe sur le texte enregistré (services/memoire_criteres.py) : aucun appel IA."""
    from services.memoire_criteres import rattacher

    project = _get_project_or_404(project_id, user.organization_id, db)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        # Pas encore de mémoire : un état normal (comme le GET du mémoire, R31), rien à rattacher ni « À couvrir ».
        return {"sous_criteres": [], "a_couvrir": []}
    return rattacher(memoire.content_json, project.criteres_jugement)


@router.get("/{project_id}/memoire/preflight")
def get_memoire_preflight(
    project_id: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C9a — pre-flight avant génération : profil condensé éditable,
    références classées par pertinence pour CE lot (5-8 pré-cochées),
    rappel quota (« consommera 1 mémoire — X/30 ce mois » en Pro)."""
    from services.ai.memoire_generator import _rank_references_for_lot
    from services import quota

    project = _get_project_or_404(project_id, user.organization_id, db)
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    cfg = db.query(MemoireConfig).filter(
        MemoireConfig.organization_id == user.organization_id,
    ).first()

    profil = {
        "nom": (cfg.nom_entreprise if cfg and cfg.nom_entreprise else raison_sociale_de(org, db)),
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
        "organigramme_available": organigramme_available(cfg, _membres_equipe(db, user.organization_id)),
        "vault_documents": vault_documents,
    }


@router.post("/{project_id}/memoire/generate", dependencies=[Depends(exiger_budget_ia)])
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
    ensure_relaunchable(project)  # R12 — pas de relance sur projet clôturé
    # S-04 — plafond de lancements par jour (toutes offres) : compté ici, refusés compris.
    from services import plafonds_ia
    plafonds_ia.compter_lancement(db, user, plafonds_ia.ACTION_LANCER_MEMOIRE)
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    quota.exiger_siret_pour_essai(org)   # S-05 — derrière ESSAI_EXIGE_SIRET (éteinte par défaut)

    # Route async : ne pas lire ici les textes du DCE (plusieurs Mo, bloquerait la
    # boucle) — le job les recharge ; seul compte qu'il y ait des pièces pour le lot.
    all_docs = (db.query(ProjectDocument)
                .options(defer(ProjectDocument.extracted_text))
                .filter(ProjectDocument.project_id == project_id).all())
    docs = get_documents_for_lot(all_docs, project.selected_lot, _ids_des_lots(project))
    if not docs:
        raise HTTPException(status_code=400, detail="Aucun document du DCE déposé")

    # ── Quota (C1) : blocage doux 402 AVANT lancement ; l'unité n'est
    # décomptée qu'AU SUCCÈS, dans le job — « 1 mémoire PAR LOT généré ».
    thread_name = f"synorix-memoire-{project_id[:12]}"
    statut_avant = project.processing_status

    # Anti double-run ATOMIQUE (R3) : réservation conditionnelle sur la ligne
    # projet. Le verrou de ligne Postgres sérialise les workers — deux
    # générations concurrentes ne peuvent plus consommer 2 unités pour un
    # seul mémoire. 0 ligne = déjà en cours → 409, avant toute écriture.
    # S-04 — l'unité n'est décomptée qu'au succès : les générations EN COURS de l'organisation comptent dans le
    # contrôle du quota, et la réservation du créneau est validée tout de suite (sans `await` entre le contrôle et le
    # commit), sinon des générations lancées en même temps sur plusieurs AO passaient toutes le contrôle.
    quota.check_quota(db, org, "memoire", en_cours=_generations_en_cours(db, org.id, project_id))
    claimed = db.execute(
        _sql_update(Project)
        .where(
            Project.id == project_id,
            or_(Project.processing_status.is_(None),
                Project.processing_status != "generating"),
        )
        .values(processing_status="generating", processing_detail="")
    ).rowcount
    if not claimed:
        raise HTTPException(status_code=409, detail="Une rédaction est déjà en cours pour cet appel d’offres.")
    db.commit()

    # ── Garde pré-vol IA (audit risque #4) : jamais de run condamné d'avance
    # (API down / crédit épuisé). asyncio.to_thread : règle WSL2.
    from services.ai.api_preflight import AIServiceUnavailable, ensure_ai_service_available
    try:
        await asyncio.to_thread(ensure_ai_service_available)
    except AIServiceUnavailable:
        db.rollback()
        # le créneau a été validé plus haut (S-04) : il est rendu explicitement
        db.execute(_sql_update(Project).where(Project.id == project_id, Project.processing_status == "generating")
                   .values(processing_status=statut_avant))
        db.commit()
        raise HTTPException(
            status_code=503,
            detail="Service IA momentanément indisponible — réessayez dans quelques minutes.",
        )

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
        kwargs={"reservation": budget_ia.reservation_de(request)},   # S-01 : sa réservation, exacte
        daemon=True,
        name=thread_name,
    )
    thread.start()

    return {"status": "started", "project_id": project_id, "lot": project.selected_lot}


def _memoire_content_all_placeholders(content: dict) -> bool:
    """True si AUCUNE section réelle n'a été générée (échec technique total —
    ex. crédit API épuisé : le générateur conserve des placeholders
    « [SECTION À RÉGÉNÉRER] » par segment). Un tel run est un ÉCHEC : pas de
    mémoire fantôme en base, pas d'unité consommée."""
    leaves: list[str] = []
    for key, val in (content or {}).items():
        if key.startswith("_"):      # _generation_meta, _etat_sections : techniques, pas des sections
            continue
        if isinstance(val, dict):
            leaves.extend(str(v) for v in val.values())
        elif val is not None:
            leaves.append(str(val))
    return not any(
        v.strip() and not v.strip().startswith("[SECTION À RÉGÉNÉRER")
        for v in leaves
    )


def _generations_en_cours(db, org_id: str, sauf_projet: str) -> int:
    """Générations de mémoire en cours pour l'organisation (créneau « generating » hors « Refaire », qui ne décompte
    aucune unité), le projet courant exclu."""
    return (db.query(Project)
            .filter(Project.organization_id == org_id, Project.id != sauf_projet,
                    Project.processing_status == "generating",
                    or_(Project.processing_detail.is_(None), ~Project.processing_detail.startswith(REFAIRE_DETAIL)))
            .count())


def _plan_valide(db, project, org_id: str, memoire_cfg) -> list[dict] | None:
    """B3 — le plan VALIDÉ du dossier pour le lot choisi, tel que le générateur le lit, ou None (aucun plan, plan non
    validé, plan illisible : le mémoire est alors rédigé comme avant le plan). Références et équipe : seulement celles
    de l'organisation (un identifiant étranger n'est jamais lu)."""
    from models.plan_memoire import PlanMemoire
    from services import plan_fiches, plan_memoire as service
    ligne = (db.query(PlanMemoire)
             .filter(PlanMemoire.project_id == project.id, PlanMemoire.organization_id == org_id,
                     PlanMemoire.lot == (project.selected_lot or "")[:64])
             .first())
    if ligne is None or ligne.valide_le is None:
        return None
    try:
        plan = service.valider(list(ligne.parties or []))
    except (ValueError, TypeError, AttributeError):
        logger.warning("Plan du mémoire illisible pour %s : ignoré", project.id)
        return None
    refs = {r.id: r for r in db.query(Reference).filter(
        Reference.organization_id == org_id, Reference.is_reference == True,  # noqa: E712
        Reference.deleted_at.is_(None)).all()}
    equipe = {m.id: m for m in db.query(TeamMember).filter(TeamMember.organization_id == org_id).all()}
    liste = (getattr(memoire_cfg, "materiel_liste", None) or []) if memoire_cfg else []
    materiel = {str(l.get("designation") or "").strip()[:160] for l in liste if isinstance(l, dict)}
    rattachement = service.rattacher_criteres(plan, project.criteres_jugement)
    return plan_fiches.pour_generation(plan, rattachement, refs, equipe, materiel) or None


def _lire_contexte_generation(db, project_id: str, org_id: str, reference_ids: list | None) -> dict:
    """Tout ce que le générateur lit en base pour construire le préfixe du mémoire.

    Source UNIQUE de la génération complète et de « Refaire cette partie » : même contexte, donc même préfixe
    (et même cache). Les objets rendus sont chargés en entier, utilisables après `db.close()`."""
    project = db.query(Project).filter(Project.id == project_id).first()
    org = db.query(Organization).filter(Organization.id == org_id).first()
    memoire_cfg = db.query(MemoireConfig).filter(
        MemoireConfig.organization_id == org_id).first()
    all_docs = db.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id).all()
    docs = get_documents_for_lot(all_docs, project.selected_lot, _ids_des_lots(project))
    refs = db.query(Reference).filter(
        Reference.organization_id == org_id,
        Reference.is_reference == True,
        Reference.deleted_at.is_(None),
    ).all()
    # C9a — sélection du pre-flight : si fournie, seules ces références
    # partent au générateur (ids étrangers ignorés par le scope org).
    if reference_ids is not None:
        wanted = set(reference_ids)
        refs = [r for r in refs if r.id in wanted]
    # Tranche A (bloc 3) : toutes les exigences du lot choisi (communes +
    # propres au lot), pas celles des autres lots ; le générateur les range.
    from services.exigences import exigences_pour_memoire
    compliance_items = exigences_pour_memoire(db, project)

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

    return {
        "plan": _plan_valide(db, project, org_id, memoire_cfg),
        "organization": org, "memoire_config": memoire_cfg, "tous_les_docs": all_docs, "docs": docs,
        "references": refs, "compliance_items": compliance_items,
        "reference_template_text": ref_template_text, "reglementaire_block": reglementaire_block,
        "snap": {
            "name": project.name,
            "maitre_ouvrage": project.maitre_ouvrage or "",
            "selected_lot": project.selected_lot,
            "selected_lot_name": project.selected_lot_name or "",
            "criteres_jugement": project.criteres_jugement or [],
            "lots_detectes": project.lots_detectes or [],
            "ids_des_lots": _ids_des_lots(project),
            # lue avant la fermeture de la session : le générateur ne reçoit jamais le nom du compte
            "raison_sociale": raison_sociale_de(org, db),
        },
    }


def _ouvrages_du_contexte(ctx: dict) -> str | None:
    """Les ouvrages du lot, lus sans IA dans la DPGF (à appeler hors session, dans le thread du job)."""
    from services.dpgf_ouvrages import texte_ouvrages_du_lot
    from services.file_storage import UPLOADS_ROOT as _uploads_root
    snap = ctx["snap"]
    return texte_ouvrages_du_lot(
        ctx["tous_les_docs"], snap["selected_lot"], _uploads_root, snap["selected_lot_name"],
        snap["ids_des_lots"])


def _arguments_generateur(ctx: dict, ouvrages_dpgf: str | None) -> dict:
    """Les arguments du préfixe du mémoire, communs à `generate` et `refaire_section`."""
    snap = ctx["snap"]
    return dict(
        organization=ctx["organization"],
        raison_sociale=snap["raison_sociale"],
        memoire_config=ctx["memoire_config"],
        project_name=snap["name"],
        maitre_ouvrage=snap["maitre_ouvrage"],
        selected_lot_name=snap["selected_lot_name"],
        all_docs=ctx["docs"],
        compliance_items=ctx["compliance_items"],
        references=ctx["references"],
        criteres_jugement=snap["criteres_jugement"],
        reference_template_text=ctx["reference_template_text"],
        reglementaire_block=ctx["reglementaire_block"],
        ouvrages_dpgf=ouvrages_dpgf,
        selected_lot=snap["selected_lot"],
        lots_detectes=snap["lots_detectes"],
    )


def _run_memoire_job(*args, **kwargs) -> None:
    """S-01 — le travail ci-dessous, et ses jetons facturés (lignes « jetons » du journal) inscrits dans `couts_ia`
    à la fin, réussite ou échec, et la réservation du budget d'IA réglée (services/budget_ia.py)."""
    from services import couts_ia, jetons
    reservation = kwargs.pop("reservation", None)      # référence exacte de la réservation du budget d'IA
    org_id = kwargs.get("org_id", args[1] if len(args) > 1 else None)
    project_id = kwargs.get("project_id", args[0] if args else None)
    with jetons.collecter() as collecte:
        try:
            return _run_memoire_job_corps(*args, **kwargs)
        finally:
            if org_id:
                couts_ia.enregistrer_collecte(
                    org_id, "memoire", collecte, reference=project_id,
                    reservation=reservation)


# Après un échec de la rédaction : ce qui s'est passé et que rien n'est décompté (l'unité « mémoire » ne l'est qu'au succès,
# `quota.consume` ci-dessous) ; l'écran propose « Relancer la rédaction » (rapport E2E-2).
MSG_ECHEC_REDACTION = "La rédaction du mémoire s’est arrêtée avant la fin. Rien n’a été décompté de votre abonnement."


@chronometre("memoire", lot=lot_du_projet)
def _run_memoire_job_corps(
    project_id: str, org_id: str, user_id: str, variables: dict,
    profile_overrides: dict | None, reference_ids: list | None,
) -> None:
    """Job de génération détaché — session DB propre, tout le contexte est
    rechargé par id (jamais d'objets ORM partagés entre threads)."""
    db = SessionLocal()
    try:
        ctx = _lire_contexte_generation(db, project_id, org_id, reference_ids)
        # B5 — tout est lu : on RENDS la connexion au pool avant le travail long (lecture du
        # tableur DPGF, puis génération, plusieurs minutes). Les objets chargés restent
        # lisibles (détachés, aucun accès paresseux) ; on rouvre une session courte pour écrire.
        db.close()

        # B2 — la DPGF n'entre au mémoire que par la liste de ses ouvrages (lue sans
        # IA, ici dans le thread du job) : jamais son tableur brut ni ses prix.
        ouvrages_dpgf = _ouvrages_du_contexte(ctx)

        pipeline_tracker.start_step(project_id, "generating")
        generator = MemoireGenerator()
        content = asyncio.run(generator.generate(
            **_arguments_generateur(ctx, ouvrages_dpgf),
            variables=variables,
            project_id=project_id,
            profile_overrides=profile_overrides,
            plan=ctx["plan"],
        ))
        # Contenu 100 % placeholders = panne du service IA en plein run
        # (constat audit : crédit épuisé → 26/26 sections vides quand même
        # persistées ET décomptées). C'est un échec, pas un succès.
        if _memoire_content_all_placeholders(content):
            raise RuntimeError(
                "Génération vide : toutes les sections ont échoué (service IA indisponible)")
        pipeline_tracker.complete_step(project_id, "generating")
        pipeline_tracker.start_step(project_id, "finalizing")

        # B5 — session courte d'écriture : projet et organisation relus (la session de
        # lecture a été fermée avant la génération).
        project = db.query(Project).filter(Project.id == project_id).first()
        org = db.query(Organization).filter(Organization.id == org_id).first()

        # Upsert mémoire
        existing = db.query(MemoireTechnique).filter(
            MemoireTechnique.project_id == project_id).first()
        if existing:
            existing.content_json = content
            existing.version += 1
            existing.variables = _variables_stockees(variables, reference_ids)
            existing.profile_overrides = profile_overrides
            existing.generated_at = datetime.utcnow()
            memoire = existing
        else:
            memoire = MemoireTechnique(
                project_id=project_id,
                content_json=content,
                variables=_variables_stockees(variables, reference_ids),
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
            corps=f"Le mémoire de l’appel d’offres « {project.name} »"
                  + (f" ({project.selected_lot_name})" if project.selected_lot_name else "")
                  + " est rédigé. Relisez-le avant l’export.",
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
        # Le flux porte la phrase du produit (l'écran l'affiche) ; l'erreur technique est au journal, ci-dessus.
        echec = MSG_ECHEC_REDACTION
        pipeline_tracker.fail_pipeline(project_id, echec)
        try:
            p = db.query(Project).filter(Project.id == project_id).first()
            if p is not None:
                # Jamais de régression d'étape : l'utilisateur retrouve son
                # écran mémoire avec un statut d'erreur et un bouton relancer.
                p.processing_status = "error"
                p.processing_detail = echec
                db.commit()
        except Exception:
            logger.exception("Impossible d'enregistrer l'échec mémoire %s", project_id)
    finally:
        db.close()


def _section_connue(part: str, cle: str, contenu: dict | None = None) -> None:
    """404 si ``part.cle`` n'est pas une des 25 sous-sections rédigées du mémoire (jamais le préambule) ni une partie
    ajoutée par le patron dans le plan suivi de ce mémoire (``ajout_<n>``, présente dans ``_plan``)."""
    from services.ai.memoire_generator import _MEMOIRE_SEGMENTS
    sous = dict(_MEMOIRE_SEGMENTS).get(part)
    if sous and cle in sous:
        return
    plan = (contenu or {}).get("_plan") if isinstance(contenu, dict) else None
    suivies = plan.get("parties") if isinstance(plan, dict) else None
    if isinstance(suivies, list) and any(isinstance(p, dict) and p.get("partie") == part and p.get("sous_cle") == cle
                                         and cle.startswith("ajout_") for p in suivies):
        return
    raise HTTPException(status_code=404, detail="Partie du mémoire inconnue")


def _contenu_du_projet(db, project_id: str) -> dict | None:
    """Le JSON du mémoire du projet (pour reconnaître les parties ajoutées au plan) ; la propriété du projet est
    vérifiée juste après par chaque route."""
    ligne = db.query(MemoireTechnique.content_json).filter(MemoireTechnique.project_id == project_id).first()
    return ligne[0] if ligne else None


CLE_ETATS = "_etat_sections"   # {"partie_b.dechets": "a_refaire"} : seules les parties « À refaire » y figurent


@router.put("/{project_id}/memoire/sections/{part}/{cle}/etat")
def definir_etat_section(
    project_id: str,
    part: str,
    cle: str,
    payload: EtatSectionRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """E3 — « Rédigée » (par défaut) ou « À refaire » pour une partie du mémoire. Un seul état, aucun autre champ.

    Rangé dans le JSON du mémoire, sous une clé à part que l'export ignore : pas de migration."""
    import copy
    _get_project_or_404(project_id, user.organization_id, db)    # l'AO d'abord : rien ne se lit d'un AO d'autrui
    _section_connue(part, cle, _contenu_du_projet(db, project_id))
    memoire = (db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id)
               .with_for_update().first())
    if not memoire:
        raise HTTPException(status_code=409, detail="Aucun mémoire : générez d'abord le mémoire.")
    contenu = copy.deepcopy(memoire.content_json)
    etats = dict(contenu.get(CLE_ETATS) or {})
    if payload.etat == "a_refaire":
        etats[f"{part}.{cle}"] = "a_refaire"
    else:
        etats.pop(f"{part}.{cle}", None)
    if etats:
        contenu[CLE_ETATS] = etats
    else:
        contenu.pop(CLE_ETATS, None)
    memoire.content_json = contenu
    db.commit()
    return {"etats": etats}


REFAIRE_DETAIL = "refaire:"   # processing_detail pendant un « Refaire » : l'écran sait de quoi parle l'attente
# Plafond de dépense : « Refaire » est un appel payant (~0,30 €) qui ne décompte pas d'unité. Compté par
# organisation sur 24 heures glissantes, au DÉPART de chaque demande (ligne d'audit « memoire.refaire_section »).
REFAIRE_MAX_PAR_JOUR = 10
ACTION_REFAIRE = "memoire.refaire_section"
MSG_REFAIRE_PLAFOND = (f"Vous avez refait {REFAIRE_MAX_PAR_JOUR} parties dans les dernières 24 heures : "
                       "c'est le plafond du jour. Vous pourrez en refaire d'autres demain.")


def _refaire_des_dernieres_24h(db: Session, org_id: str) -> int:
    from datetime import timedelta
    from models.audit_log import AuditLog
    depuis = datetime.utcnow() - timedelta(hours=24)
    return (db.query(AuditLog)
            .filter(AuditLog.organization_id == org_id, AuditLog.action == ACTION_REFAIRE,
                    AuditLog.created_at >= depuis)
            .count())


@router.get("/{project_id}/memoire/sections/{part}/{cle}/refaire/estimation")
def estimation_refaire_section(
    project_id: str,
    part: str,
    cle: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """E2 — coût estimé de « Refaire cette partie », affiché avant de cliquer (déterministe, aucun appel IA)."""
    from services.ai.memoire_generator import modele_du_segment
    from services.memoire_refaire import estimer

    _get_project_or_404(project_id, user.organization_id, db)    # l'AO d'abord : rien ne se lit d'un AO d'autrui
    _section_connue(part, cle, _contenu_du_projet(db, project_id))
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=404, detail="Mémoire non généré")
    return estimer(memoire.content_json, part, cle, modele_du_segment(part))


@router.post("/{project_id}/memoire/sections/{part}/{cle}/refaire", dependencies=[Depends(exiger_budget_ia)])
@limiter.limit("3/minute")
async def refaire_section_memoire(
    request: Request,
    project_id: str,
    part: str,
    cle: str,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """E2 — « Refaire cette partie » : régénère UNE sous-section en TÂCHE DE FOND, le reste du mémoire intact.

    Même mécanisme détaché que la génération (POST -> « started », suivi par /processing-status et le flux SSE).
    Ne décompte AUCUNE unité de quota : le mémoire de ce lot est déjà décompté. Un seul « Refaire » (ou une seule
    génération) à la fois par projet."""
    project = _get_project_or_404(project_id, user.organization_id, db)    # l'AO d'abord (cloisonnement)
    _section_connue(part, cle, _contenu_du_projet(db, project_id))
    ensure_relaunchable(project)
    memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
    if not memoire:
        raise HTTPException(status_code=409, detail="Aucun mémoire à retoucher : générez d'abord le mémoire.")
    if _refaire_des_dernieres_24h(db, user.organization_id) >= REFAIRE_MAX_PAR_JOUR:
        raise HTTPException(status_code=429, detail=MSG_REFAIRE_PLAFOND)

    # Même réservation atomique que la génération : deux Refaire (ou un Refaire pendant une génération) ne
    # peuvent pas courir ensemble sur le même mémoire.
    claimed = db.execute(
        _sql_update(Project)
        .where(
            Project.id == project_id,
            or_(Project.processing_status.is_(None),
                Project.processing_status != "generating"),
        )
        .values(processing_status="generating", processing_detail=f"{REFAIRE_DETAIL}{part}.{cle}")
    ).rowcount
    if not claimed:
        raise HTTPException(status_code=409, detail="Une rédaction est déjà en cours pour cet appel d’offres.")

    from services.ai.api_preflight import AIServiceUnavailable, ensure_ai_service_available
    try:
        await asyncio.to_thread(ensure_ai_service_available)
    except AIServiceUnavailable:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Service IA momentanément indisponible — réessayez dans quelques minutes.",
        )
    db.commit()
    # Comptée dès le départ (plafond ci-dessus), même si l'appel échoue ensuite.
    log_action(db, user, ACTION_REFAIRE, target_type="project", target_id=project_id,
               extra={"part": part, "cle": cle})

    pipeline_tracker.start_pipeline(project_id, "memoire")
    pipeline_tracker.start_step(project_id, "preparing")
    pipeline_tracker.complete_step(project_id, "preparing")

    threading.Thread(
        target=_run_refaire_job,
        args=(project_id, user.organization_id, user.id, part, cle),
        kwargs={"reservation": budget_ia.reservation_de(request)},   # S-01 : sa réservation, exacte
        daemon=True,
        name=f"synorix-refaire-{project_id[:12]}",
    ).start()
    return {"status": "started", "project_id": project_id, "part": part, "cle": cle}


MSG_REFAIRE_ECHEC = "Cette partie n'a pas pu être refaite. Le mémoire est resté tel quel : réessayez dans un instant."



def _run_refaire_job(*args, **kwargs) -> None:
    """S-01 — le travail ci-dessous, et ses jetons facturés (lignes « jetons » du journal) inscrits dans `couts_ia`
    à la fin, réussite ou échec, et la réservation du budget d'IA réglée (services/budget_ia.py)."""
    from services import couts_ia, jetons
    reservation = kwargs.pop("reservation", None)      # référence exacte de la réservation du budget d'IA
    org_id = kwargs.get("org_id", args[1] if len(args) > 1 else None)
    project_id = kwargs.get("project_id", args[0] if args else None)
    with jetons.collecter() as collecte:
        try:
            return _run_refaire_job_corps(*args, **kwargs)
        finally:
            if org_id:
                couts_ia.enregistrer_collecte(
                    org_id, "memoire_refaire", collecte, reference=project_id,
                    reservation=reservation)


def _run_refaire_job_corps(project_id: str, org_id: str, user_id: str, part: str, cle: str) -> None:
    """Job « Refaire cette partie » — session propre, contexte rechargé par id comme la génération.

    Seule la sous-section visée est réécrite, à partir du contenu LU AU MOMENT D'ÉCRIRE (une retouche faite dans
    l'éditeur pendant l'attente sur une autre partie n'est pas écrasée). Échec : le mémoire n'est pas touché."""
    import copy
    db = SessionLocal()
    try:
        memoire = db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id).first()
        stockees = dict(memoire.variables or {})
        reference_ids = stockees.pop("reference_ids", None)
        profile_overrides = memoire.profile_overrides or None
        ctx = _lire_contexte_generation(db, project_id, org_id, reference_ids)
        contenu_actuel = memoire.content_json
        db.close()

        # B3 — la fiche de la partie (plan validé), ou à défaut son titre dans le plan suivi (partie ajoutée) ;
        # sans plan, « Refaire » est celui d'avant.
        plan_partie = next((p for p in (ctx["plan"] or []) if p["partie"] == part and p["sous_cle"] == cle), None)
        if plan_partie is None and cle.startswith("ajout_"):
            suivi = next((p for p in ((contenu_actuel or {}).get("_plan") or {}).get("parties", [])
                          if isinstance(p, dict) and p.get("partie") == part and p.get("sous_cle") == cle), None)
            if suivi:
                plan_partie = {"partie": part, "sous_cle": cle, "titre": suivi.get("titre") or cle, "ajout": True,
                               "criteres": [], "lignes": [], "voulu": ""}

        ouvrages_dpgf = _ouvrages_du_contexte(ctx)
        pipeline_tracker.start_step(project_id, "generating")
        texte, _meta = asyncio.run(MemoireGenerator().refaire_section(
            part, cle,
            plan_partie=plan_partie,
            **_arguments_generateur(ctx, ouvrages_dpgf),
            variables=stockees,
            project_id=project_id,
            profile_overrides=profile_overrides,
        ))
        pipeline_tracker.complete_step(project_id, "generating")
        pipeline_tracker.start_step(project_id, "finalizing")

        memoire = (db.query(MemoireTechnique).filter(MemoireTechnique.project_id == project_id)
                   .with_for_update().first())
        contenu = copy.deepcopy(memoire.content_json)
        contenu.setdefault(part, {})[cle] = texte
        # E3 — une partie refaite redevient « Rédigée » ; les autres gardent l'état choisi par le patron.
        etats = dict(contenu.get(CLE_ETATS) or {})
        etats.pop(f"{part}.{cle}", None)
        if etats:
            contenu[CLE_ETATS] = etats
        else:
            contenu.pop(CLE_ETATS, None)
        memoire.content_json = contenu
        project = db.query(Project).filter(Project.id == project_id).first()
        project.processing_status = "ready"
        project.processing_detail = ""
        db.commit()
        pipeline_tracker.complete_pipeline(project_id)
    except Exception as e:
        logger.error("Erreur « Refaire cette partie » projet %s (%s.%s): %s", project_id, part, cle, e, exc_info=True)
        db.rollback()
        pipeline_tracker.fail_pipeline(project_id, MSG_REFAIRE_ECHEC)
        try:
            p = db.query(Project).filter(Project.id == project_id).first()
            if p is not None:
                # Le mémoire n'a pas bougé : le projet reste utilisable, aucun statut d'erreur à relancer.
                p.processing_status = "ready"
                p.processing_detail = ""
                db.commit()
        except Exception:
            logger.exception("Impossible de rendre le projet %s après l'échec d'un « Refaire »", project_id)
    finally:
        db.close()


# Plafond de dépense de la réécriture de passage (éditeur) : un appel Sonnet 5.5 sur un passage (≤ 6 000 caractères),
# ~0,01 à 0,02 €, sans unité décomptée. Compté par organisation sur 24 heures glissantes, au DÉPART de chaque demande
# (ligne d'audit « memoire.rewrite_passage »), comme « Refaire » (10 par jour) mais plus haut : la reformulation est
# bien plus légère (60 appels ≈ 1 € au plus). Le front annonce la même valeur (RewritePassageBar.tsx : un test les compare).
REECRIRE_MAX_PAR_JOUR = 60
ACTION_REECRIRE = "memoire.rewrite_passage"
# Le plafond est partagé avec C1 (« Proposer un paragraphe ») et C2 (trois propositions), éteintes par défaut
# (services/fonctions_ia.py) : éteintes, elles n'écrivent aucune ligne et le compte d'aujourd'hui est inchangé.
ACTIONS_PLAFOND_REECRIRE = (ACTION_REECRIRE, "memoire.proposer_paragraphe", "memoire.reecrire_trois")
MSG_REECRIRE_PLAFOND = (f"Vous avez réécrit {REECRIRE_MAX_PAR_JOUR} passages dans les dernières 24 heures : "
                        "c'est le plafond du jour. Vous pourrez en réécrire d'autres demain.")


def _reecritures_des_dernieres_24h(db: Session, org_id: str) -> int:
    from datetime import timedelta
    from models.audit_log import AuditLog
    depuis = datetime.utcnow() - timedelta(hours=24)
    return (db.query(AuditLog)
            .filter(AuditLog.organization_id == org_id, AuditLog.action.in_(ACTIONS_PLAFOND_REECRIRE),
                    AuditLog.created_at >= depuis)
            .count())


@router.post("/{project_id}/memoire/rewrite-passage", dependencies=[Depends(exiger_budget_ia)])
@limiter.limit("10/minute")
async def rewrite_passage_endpoint(
    request: Request,
    project_id: str,
    payload: PassageRewriteRequest,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """C9b — réécrit le passage sélectionné SEUL (Sonnet 5.5, le modèle de la génération du mémoire).

    Ne modifie JAMAIS le mémoire en base : le front affiche le diff
    avant/après et applique (ou non) via le PATCH mémoire existant.
    Ne décompte aucune unité ; plafonné par jour et par organisation (REECRIRE_MAX_PAR_JOUR, 429)."""
    from services.ai.passage_rewriter import rewrite_passage

    project = _get_project_or_404(project_id, user.organization_id, db)
    if _reecritures_des_dernieres_24h(db, user.organization_id) >= REECRIRE_MAX_PAR_JOUR:
        raise HTTPException(status_code=429, detail=MSG_REECRIRE_PLAFOND)

    # Même règle DTU que la génération (décision du 27/10) : liste fermée du lot dans
    # la consigne, garde-fou déterministe sur la sortie. Lue ici, hors du thread SDK.
    docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    regle = await asyncio.to_thread(
        regle_dtu, docs, project.selected_lot, project.selected_lot_name,
        project.lots_detectes or [], _ids_des_lots(project))

    # Comptée dès le départ (plafond ci-dessus), même si l'appel échoue ensuite — comme « Refaire ».
    log_action(
        db, user, ACTION_REECRIRE,
        target_type="project", target_id=project_id,
        extra={"action": payload.action, "chars": len(payload.passage)},
    )
    from services import couts_ia, jetons
    try:
        # Dépense réelle inscrite dans couts_ia (budget d'IA du jour), même si la suite échoue après l'appel.
        with jetons.collecter() as collecte:
            try:
                rewritten = await rewrite_passage(
                    payload.passage, payload.action, payload.instruction, regle,
                )
            finally:
                couts_ia.enregistrer_collecte(user.organization_id, "reecriture_passage", collecte,
                                              reference=project_id)
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).error(
            f"Réécriture passage échouée (projet {project_id}): {e}", exc_info=True,
        )
        raise HTTPException(
            status_code=502,
            detail="La réécriture a échoué — réessayez dans un instant.",
        )

    return {
        "original": payload.passage,
        "rewritten": rewritten,
        "action": payload.action,
    }


def _membres_equipe(db, org_id):
    """Membres de l'équipe de l'organisation (seconde source de l'organigramme)."""
    from models.team_member import TeamMember
    return db.query(TeamMember).filter(TeamMember.organization_id == org_id).all()


def _references_du_memoire(db, org_id, variables: dict):
    """Références de l'organisation pour le tableau : celles choisies au pre-flight si la
    sélection a été conservée, sinon toutes (comme le générateur). Jamais celles d'une autre org."""
    refs = db.query(Reference).filter(
        Reference.organization_id == org_id,
        Reference.is_reference == True,  # noqa: E712
        Reference.deleted_at.is_(None),
    ).all()
    ids = variables.get("reference_ids")
    if ids is not None:
        voulues = set(ids)
        refs = [r for r in refs if r.id in voulues]
    return refs


def _variables_stockees(variables: dict, reference_ids) -> dict:
    """Variables rangées avec le mémoire : celles du générateur + la sélection de références
    (pour le tableau de l'export). Le générateur, lui, reçoit `variables` sans cette clé."""
    stockees = dict(variables)
    if reference_ids is not None:
        stockees["reference_ids"] = list(reference_ids)
    return stockees


def _visuels_du_memoire(project, memoire, db, logo_image) -> list:
    """Visuels du mémoire (organigramme, Gantt, moyens, références, plan, schéma), tirés des
    seules données saisies. Sans base ou en cas d'erreur : aucun visuel, l'export continue."""
    if db is None:
        return []
    try:
        from services.visuels.assemblage import construire_visuels
        variables = getattr(memoire, "variables", None) or {}
        cfg = db.query(MemoireConfig).filter(
            MemoireConfig.organization_id == project.organization_id,
        ).first()
        return construire_visuels(
            variables, cfg, logo_image,
            _membres_equipe(db, project.organization_id),
            _references_du_memoire(db, project.organization_id, variables),
            getattr(memoire, "profile_overrides", None) or None,
            getattr(memoire, "content_json", None))
    except Exception as exc:
        import logging as _logging
        _logging.getLogger(__name__).warning("Visuels omis : %s", type(exc).__name__)
        return []


def build_project_memoire_docx(project, memoire, org, db) -> bytes:
    """Construit le DOCX complet du mémoire (page de garde, carte,
    organigramme, logo) — source unique pour export-docx, export-pdf et ZIP."""
    org_name = nom_entreprise_effectif(org, db) if org else ""   # vide : la page de garde dit « À compléter »

    # Generate location map (graceful fallback to None)
    # Carte IGN : le siège, et le CHANTIER seulement si l'analyse en a extrait le
    # lieu d'exécution — jamais le nom de l'acheteur (bloc 3, tranche B).
    company_address = org.address if org else None
    map_image, map_caption = generate_location_map(
        company_address or "",
        lieu_execution(project),
        source_lieu=lieu_source(project),
    )

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

    visuels = _visuels_du_memoire(project, memoire, db, logo_image)

    return build_memoire_docx(
        content_json=memoire.content_json,
        project_name=project.name,
        org_name=org_name,
        map_image=map_image,
        map_caption=map_caption,
        visuels=visuels,
        logo_image=logo_image,
        lot_name=project.selected_lot_name,
        maitre_ouvrage=project.maitre_ouvrage,
        org_address=org.address if org else None,
        org_siret=org.siret if org else None,
        objet_marche=(project.infos_marche or {}).get("objet") if isinstance(project.infos_marche, dict) else None,
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
@limiter.limit("20/minute")          # comme /export/docx : la numérotation du sommaire passe par LibreOffice
@chronometre("export", lot=lot_du_projet)
def export_memoire_docx(
    request: Request,
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

    from services.pdf_export import docx_numerote
    docx_bytes = build_project_memoire_docx(project, memoire, org, db)
    nom = f"Memoire_Technique_{project.name.replace(' ', '_')}.docx"
    rendre_connexion(db)                       # avant LibreOffice : jamais une connexion prise pendant la conversion
    return _attachment_response(
        docx_numerote(docx_bytes),             # sommaire numéroté ; LibreOffice occupé ou absent : tel quel
        nom,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/{project_id}/memoire/export-pdf")
@limiter.limit("20/minute")          # conversion LibreOffice : bornée par organisation
@chronometre("export", lot=lot_du_projet)
def export_memoire_pdf(
    request: Request,
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
            detail="Export PDF indisponible sur ce serveur (LibreOffice non installé) — "
                   "utilisez l'export Word en attendant.",
        )
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()

    docx_bytes = build_project_memoire_docx(project, memoire, org, db)
    nom = f"Memoire_Technique_{project.name.replace(' ', '_')}.pdf"
    rendre_connexion(db)                       # avant LibreOffice : jamais une connexion prise pendant la conversion
    try:
        pdf_bytes = docx_to_pdf(docx_bytes)
    except PdfConversionError as exc:
        # message écrit pour l'utilisateur (services/libreoffice_isole.py), réessai proposé
        raise HTTPException(status_code=503, detail=str(exc),
                            headers={"Retry-After": str(exc.retry_apres_s)})

    return _attachment_response(pdf_bytes, nom, "application/pdf")


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
    # E3 — l'état des parties (« À refaire ») est choisi par le patron via sa propre route : l'enregistrement du
    # texte depuis l'éditeur ne le modifie jamais.
    nouveau = dict(payload.content_json)
    etats = (memoire.content_json or {}).get(CLE_ETATS)
    if etats:
        nouveau[CLE_ETATS] = etats
    else:
        nouveau.pop(CLE_ETATS, None)
    # B3 — le plan suivi à la rédaction (titres, ordre, parties ajoutées) est posé par le serveur : un envoi du client ne
    # le remplace jamais.
    suivi = (memoire.content_json or {}).get("_plan")
    if suivi:
        nouveau["_plan"] = suivi
    else:
        nouveau.pop("_plan", None)
    memoire.content_json = nouveau
    db.commit()
    db.refresh(memoire)
    return memoire


# R11 — source UNIQUE (filtre org + soft-delete) ; fini les 7 copies.
from services.project_access import get_owned_project as _get_project_or_404
