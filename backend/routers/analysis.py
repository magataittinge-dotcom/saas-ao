import asyncio
import hashlib
import json
import logging
import re
import threading
from pathlib import Path
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy import or_, update as _sql_update
from sqlalchemy.orm import Session

from database import get_db
from models.organization import Organization
from models.user import User
from models.project import TYPE_AE, TYPE_DPGF, Project, ProjectDocument
from models.compliance_item import ComplianceItem
from models.checklist_item import ChecklistItem
from models.document import Document
from schemas.compliance import ComplianceItemResponse
from routers.auth import get_auth_user
from services.ai.api_preflight import AIServiceUnavailable, ensure_ai_service_available
from services.ai.dce_analyzer import (
    DCEAnalyzer, ClaudeAuthenticationError, ClaudeRateLimitError,
)
from services.ai.checklist_matcher import ChecklistMatcher
from services.document_tagger import (
    est_commune, get_documents_for_lot, _normalize_lot_num,
)
from services.dpgf_ouvrages import est_tableur, texte_ouvrages_du_lot
from services import pipeline_tracker, quota
from services.project_status import ensure_relaunchable

logger = logging.getLogger(__name__)

UPLOADS_ROOT = Path(__file__).parent.parent / "uploads"

router = APIRouter()
from services.rate_limit import limiter  # S1.2 — limiter partagé (org-keyed)

# B10 — borne d'UNE action : 40 lots (le quota mensuel Pro, PRD : 40 analyses).
_MAX_LOTS_PAR_ANALYSE = 40
# Lots ajoutés à la main dans l'écran Lots (AddLotForm : « lot1 » à « lot30 ») :
# jamais enregistrés dans lots_detectes, mais analysables (filtre par numéro).
_LOT_AJOUTE_A_LA_MAIN = re.compile(r"^lot(?:[1-9]|[12][0-9]|30)$")

IdentifiantLot = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class AnalyzeRequest(BaseModel):
    """B10 — corps de POST /analyze. Absent ou {} : le lot sélectionné.

    Avant : `dict` non validé — {"lots": "lot1"} était parcouru caractère par
    caractère (4 unités consommées) et un doublon faussait le remboursement."""
    model_config = ConfigDict(extra="forbid")

    lots: Optional[List[IdentifiantLot]] = Field(
        default=None, min_length=1, max_length=_MAX_LOTS_PAR_ANALYSE)

    @field_validator("lots")
    @classmethod
    def _sans_doublon(cls, lots):
        if lots is not None and len(set(lots)) != len(lots):
            raise ValueError("chaque lot ne figure qu'une fois")
        return lots


def _lots_inconnus(project, lot_ids: list) -> list:
    """Lots demandés qui ne sont ni détectés, ni sélectionnés, ni ajoutables
    à la main dans l'écran Lots."""
    connus = {l.get("id") for l in (project.lots_detectes or []) if isinstance(l, dict)}
    connus.add(project.selected_lot)
    return [l for l in lot_ids if l not in connus and not _LOT_AJOUTE_A_LA_MAIN.match(l)]


@router.post("/{project_id}/analyze")
@limiter.limit("5/minute")
async def trigger_analysis(
    request: Request,
    project_id: str,
    payload: AnalyzeRequest | None = None,
    user: User = Depends(get_auth_user),
    db: Session = Depends(get_db),
):
    """Analyse d'un ou PLUSIEURS lots en un seul run (1 action utilisateur).

    Multi-lots mutualisé : le tronc commun (RC/CCAP/AE) est analysé UNE
    fois et partagé ; seul le spécifique (CCTP/DPGF filtrés) est analysé
    par lot. body optionnel : {"lots": ["lot1", "lot2"]} (AnalyzeRequest)."""
    project = _get_project_or_404(project_id, user.organization_id, db)
    ensure_relaunchable(project)  # R12 — pas de relance sur projet clôturé
    all_docs = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    docs_total = len(all_docs)

    if not all_docs:
        raise HTTPException(status_code=400, detail="Aucun document déposé pour ce projet")

    lot_ids = (payload.lots if payload and payload.lots else None) or [project.selected_lot or "all"]
    inconnus = _lots_inconnus(project, lot_ids) if payload and payload.lots else []
    if inconnus:
        # B10 — refusé AVANT tout décompte d'unité.
        raise HTTPException(
            status_code=422,
            detail="Lot inconnu pour ce projet : " + ", ".join(inconnus)
                   + ". Choisissez les lots dans l'écran Lots.",
        )
    lot_names = {l.get("id"): l.get("nom") for l in (project.lots_detectes or [])}

    # Textes des passes, construits dans un thread : la liste des ouvrages lit
    # la DPGF (tableur) sur le disque — jamais dans la boucle d'événements (B2).
    pass1_text, lot_specs, truncated_files = await asyncio.to_thread(
        _build_texts, all_docs, lot_ids, lot_names,
        project.selected_lot, project.selected_lot_name,
    )
    docs_sent = max((s["docs_sent"] for s in lot_specs), default=docs_total)

    if not pass1_text and not any(s["pass2_text"] for s in lot_specs):
        raise HTTPException(
            status_code=400,
            detail="Aucun texte extrait des documents. Déposez des PDF ou DOCX lisibles.",
        )

    logger.info("Analyse projet %s : %d lot(s) %s — tronc commun %d chars",
                project_id, len(lot_specs), [s["lot_id"] for s in lot_specs], len(pass1_text))

    # ── Quota (C1) : 1 unité PAR LOT, décomptée AU LANCEMENT ─────────────────
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    status = quota.get_quota_status(db, org)
    limit = status["analyses"]["limit"]
    if limit is not None and status["analyses"]["used"] + len(lot_specs) > limit:
        # Audit #10 — même blocage doux que check_quota : CTA upgrade
        # explicite, et jamais « ce mois » en plan free (essai à vie).
        remaining = max(0, limit - status["analyses"]["used"])
        if (org.plan or "free") == "free":
            detail = (
                f"Quota insuffisant : {len(lot_specs)} lot(s) demandés, "
                f"{remaining} analyse(s) restante(s) sur votre essai gratuit. "
                + quota.upgrade_invitation("free")
            )
        else:
            detail = (
                f"Quota insuffisant : {len(lot_specs)} lot(s) demandés, "
                f"{remaining} analyse(s) restante(s) ce mois. "
                f"{quota.upgrade_invitation(org.plan)} ou attendez le renouvellement de votre période."
            )
        raise HTTPException(status_code=402, detail=detail)

    thread_name = f"synorix-analysis-{project_id[:12]}"

    # Anti double-run ATOMIQUE (R3) : réserve le créneau par une écriture
    # conditionnelle sur la ligne projet. Sur Postgres, le verrou de ligne
    # sérialise les workers concurrents — un double-clic réparti sur 2
    # workers ne peut plus lancer 2 runs. 0 ligne mise à jour = déjà en
    # cours → 409, AVANT toute consommation (rollback si 402/503 ensuite).
    claimed = db.execute(
        _sql_update(Project)
        .where(
            Project.id == project_id,
            or_(Project.processing_status.is_(None),
                Project.processing_status != "analyzing"),
        )
        .values(processing_status="analyzing")
    ).rowcount
    if not claimed:
        raise HTTPException(status_code=409, detail="Une analyse est déjà en cours pour ce projet.")

    # ── Garde pré-vol IA (audit risque #4) : jamais de run condamné d'avance
    # (API down / crédit épuisé) — vérifiée AVANT toute consommation de quota.
    # asyncio.to_thread : règle WSL2, jamais de SDK dans l'event-loop.
    try:
        await asyncio.to_thread(ensure_ai_service_available)
    except AIServiceUnavailable:
        db.rollback()  # relâche le créneau réservé + le verrou de ligne
        raise HTTPException(
            status_code=503,
            detail="Service IA momentanément indisponible — réessayez dans quelques minutes.",
        )

    # Verrou org (anti-TOCTOU R3) : check_quota + consume sérialisés pour
    # l'org — deux projets concurrents ne dépassent plus la limite. Les
    # lignes consommées sont retenues par id pour un refund exact (R4).
    quota.advisory_org_lock(db, org.id)
    consumed_rows = {}
    for spec in lot_specs:
        quota.check_quota(db, org, "analysis")
        consumed_rows[spec["lot_id"]] = quota.consume(
            db, org, "analysis", project_id=project_id, lot=spec["lot_id"])
    db.flush()  # attribue les ids des consommations (dispo sans commit)
    consumed_ids = {lot: row.id for lot, row in consumed_rows.items()}

    # Update step before analysis — current_step ne RÉGRESSE plus jamais :
    # un échec d'analyse laisse le projet à l'étape analyse avec un statut
    # d'erreur explicite et un bouton relancer (vision : état persistant).
    project.current_step = 3
    project.status = "en_cours"
    project.processing_status = "analyzing"
    project.processing_detail = ""
    # R5 — trace les unités du run EN COURS : si le process meurt avant la
    # livraison, la réconciliation au boot les recréditera exactement.
    project.active_run_consumptions = json.dumps(list(consumed_ids.values()))
    db.commit()  # persiste créneau + consommations + trace, relâche les verrous

    pipeline_tracker.start_pipeline(project_id, "analysis")
    pipeline_tracker.start_step(project_id, "preparation")
    pipeline_tracker.complete_step(project_id, "preparation")

    # ── Run DÉTACHÉ (thread démon) : l'analyse survit à la navigation, au
    # rechargement de page et à la coupure de la connexion HTTP.
    org_id = user.organization_id
    thread = threading.Thread(
        target=_run_analysis_job,
        args=(project_id, org_id, pass1_text, lot_specs,
              docs_sent, docs_total, truncated_files, consumed_ids),
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
#
# B2 (décision de Mohamed, 25/10/2026) : l'AE part en passe 1 ; la DPGF ne part
# jamais en tableur brut ni avec une colonne de prix : seule la liste de ses
# ouvrages (désignation, unité, quantité donnée par l'acheteur), lue sans IA,
# part en passe 2. Une pièce remplie par l'entreprise (DPGF chiffrée, AE signé)
# ne part jamais à l'IA.

_PASS1_TYPES = frozenset({"rc", "ccap", TYPE_AE})   # tronc commun, identique pour tous les lots
_PASS2_TYPES = frozenset({"cctp"})                  # + l'AE propre au lot, + les ouvrages de la DPGF
_TYPES_ANCRAGE = frozenset({"rc", "ccap", "cctp", TYPE_AE, TYPE_DPGF})
_LIBELLES = {TYPE_AE: "AE"}   # en-tête de section lu par l'IA


def _entete(doc) -> str:
    type_ = doc.type or "autre"
    return f"=== {_LIBELLES.get(type_, type_.upper())} — {doc.file_name} ===\n"


def _envoyable(doc) -> bool:
    """Texte brut qui peut partir à l'IA : ni pièce remplie par l'entreprise, ni
    tableur (grille de prix), ni texte provisoire."""
    text = doc.extracted_text or ""
    return (bool(text) and not getattr(doc, "is_user_completed", False)
            and not est_tableur(doc.file_name) and not text.startswith("[document volumineux"))


def _commune(doc) -> bool:
    """Pièce commune à tous les lots (non étiquetée, « all » ou lot 0)."""
    return est_commune(doc.related_lots)


def _build_texts(all_docs, lot_ids, lot_names, selected_lot, selected_lot_name) -> tuple:
    """(texte de la passe 1, spécification par lot, fichiers tronqués) — bloquant."""
    pass1_text, truncated = _build_pass1_text(all_docs)
    truncated_files = list(truncated)
    lot_specs = []
    for lot_id in lot_ids:
        spec = _build_lot_spec(all_docs, lot_id, lot_names, selected_lot, selected_lot_name)
        truncated_files.extend(spec.pop("truncated"))
        lot_specs.append(spec)
    return pass1_text, lot_specs, truncated_files


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
    """Texte du tronc commun (RC/CCAP/AE commun) — identique pour tous les lots.
    Un AE propre à un lot part avec ce lot (passe 2)."""
    truncated: list = []
    parts = []
    for doc in _dedup_by_content(d for d in all_docs if _envoyable(d)):
        doc_type = doc.type or "autre"
        if doc_type not in _PASS1_TYPES or (doc_type == TYPE_AE and not _commune(doc)):
            continue
        parts.append(_entete(doc) + _safety(doc.extracted_text, doc.file_name, truncated))
    return "\n\n".join(parts), truncated


def _build_lot_spec(all_docs, lot_id, lot_names, selected_lot, selected_lot_name) -> dict:
    """pass2_text + en-tête de contexte pour UN lot : CCTP, AE propre au lot, et la
    liste des ouvrages de la DPGF (jamais le tableur brut). Bloquant (DPGF lue)."""
    truncated: list = []
    lots_du_rc = list(lot_names)   # ids des lots du RC : sous-lots rattachés au lot
    docs = get_documents_for_lot(all_docs, lot_id, lots_du_rc)
    lot_num_norm = _normalize_lot_num(lot_id) if lot_id and lot_id != "all" else None
    lot_label = (lot_names.get(lot_id)
                 or (selected_lot_name if lot_id == selected_lot else None)
                 or (f"Lot {lot_num_norm}" if lot_num_norm else None))

    parts: list = []
    for doc in _dedup_by_content(d for d in docs if _envoyable(d)):
        doc_type = doc.type or "autre"
        if doc_type in _PASS2_TYPES or (doc_type == TYPE_AE and not _commune(doc)):
            parts.append(_entete(doc) + _safety(doc.extracted_text, doc.file_name, truncated))
    ouvrages = texte_ouvrages_du_lot(all_docs, lot_id, UPLOADS_ROOT, lot_label, lots_du_rc)
    if ouvrages:
        parts.append(ouvrages)

    lot_header = ""
    if lot_label:
        lot_header = (
            f"IMPORTANT : Cette analyse concerne spécifiquement le {lot_label}. "
            f"Concentre-toi UNIQUEMENT sur les exigences relatives à ce lot. "
            f"Ignore les informations relatives aux autres lots.\n\n"
        )

    return {
        "lot_id": lot_id or "all",
        "lot_label": lot_label,
        "pass2_text": "\n\n".join(parts) if parts else None,
        "lot_header": lot_header,
        "docs_sent": len(docs),
        "truncated": truncated,
    }


# B9 — même formule que la garde pré-vol (503) : le service ne peut pas servir.
_MSG_IA_INDISPONIBLE = "Service IA momentanément indisponible. Relancez l'analyse dans quelques minutes."


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
            project.active_run_consumptions = None  # R5 — run terminé (échec)
            db.commit()
    finally:
        db.close()


def _build_anchor_docs(db: Session, project_id: str, lot: str | None = None) -> tuple:
    """(textes, chemins PDF, rangs) des pièces où l'ancrage cherche les sources.

    Seules les pièces que l'IA a reçues pour la portée peuvent servir de
    source (sur Gueux, 73 exigences du lot 05 étaient sourcées dans le CCTP
    d'un autre lot, que l'IA n'avait pas reçu) :
      '_commun'       → pièces de la passe 1 (RC, CCAP, AE commun) ;
      'lotN' ou 'all' → pièces de la passe 2 (get_documents_for_lot) : CCTP, AE
                        propre au lot, et DPGF du lot, dont les ouvrages partent
                        à l'IA (son texte sert à retrouver les extraits qui les citent) ;
      None            → toutes les pièces ancrables.
    Une pièce remplie par l'entreprise n'est jamais une source.
    rangs : 0 = pièce propre au lot, 1 = pièce commune (« all », non rattachée)."""
    docs = db.query(ProjectDocument).filter(
        ProjectDocument.project_id == project_id).order_by(ProjectDocument.file_name).all()
    if lot == "_commun":
        retenus = [d for d in docs if (d.type or "autre") in _PASS1_TYPES
                   and ((d.type or "autre") != TYPE_AE or _commune(d))]
    elif lot:
        retenus = [d for d in get_documents_for_lot(docs, lot)
                   if (d.type or "autre") in _PASS2_TYPES or (d.type or "autre") == TYPE_DPGF
                   or ((d.type or "autre") == TYPE_AE and not _commune(d))]
    else:
        retenus = [d for d in docs if (d.type or "autre") in _TYPES_ANCRAGE]
    cible = _normalize_lot_num(lot) if lot and lot not in ("_commun", "all") else None
    texts, paths, rangs = {}, {}, {}
    for d in retenus:
        txt = d.extracted_text or ""
        if len(txt) < 50 or txt.startswith("[document volumineux") or d.is_user_completed:
            continue
        texts[d.file_name] = txt
        propre = cible is not None and any(
            _normalize_lot_num(str(t)) == cible for t in (d.related_lots or []) if t not in ("all", "info"))
        rangs[d.file_name] = 0 if propre else 1
        if d.file_url and d.file_name.lower().endswith(".pdf"):
            p = UPLOADS_ROOT / d.file_url.removeprefix("/uploads/")
            if p.exists():
                paths[d.file_name] = str(p)
    return texts, paths, rangs


def _requirements_from_rows(rows) -> list:
    return [{
        "exigence": r.exigence_text, "source_document": r.source_document,
        "source_page": r.source_page, "source_excerpt": r.source_excerpt,
        "category": r.category, "priority": r.priority,
    } for r in rows]


def _refund_lots(db, consumed_ids: dict, lot_ids: list) -> None:
    """Échec TECHNIQUE (panne API/5xx/crédit) : rembourse EXACTEMENT les
    unités décomptées par CE run pour les lots donnés, par id (R4) — jamais
    « la ligne la plus récente », donc jamais l'unité livrée d'un autre run.
    Idempotent (un lot déjà remboursé = id absent) ; jamais appelé quand
    l'IA a tourné mais que le DCE n'a rien donné (no_requirements : due)."""
    ids = [consumed_ids.get(lot_id) for lot_id in lot_ids]
    ids = [i for i in ids if i]
    if not ids:
        return
    try:
        quota.refund_ids(db, ids)
        db.commit()
    except Exception:
        logger.exception("Refund quota impossible (lots=%s)", lot_ids)
        db.rollback()


def _run_analysis_job(
    project_id: str,
    org_id: str,
    pass1_text: str,
    lot_specs: list,
    docs_sent: int,
    docs_total: int,
    truncated_files: list,
    consumed_ids: dict,
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
                _anchor_requirements_safe(db, project_id, commun_reqs, "_commun")
                _persist_scope(db, project_id, commun_reqs, "_commun", also_null=True)
        except ClaudeRateLimitError as e:
            logger.warning(f"Rate limit Anthropic projet {project_id}: {e}")
            _refund_lots(db, consumed_ids, [s["lot_id"] for s in lot_specs])
            _fail_analysis(project_id, "Limite Anthropic atteinte. Relancez dans une minute.", "rate_limit")
            return
        except ClaudeAuthenticationError as e:
            # B9 — clé refusée : échec propre, unités rendues (plus jamais de
            # jeu de démonstration enregistré comme une vraie analyse).
            logger.error("Clé API refusée (analyse %s) : %s", project_id, e)
            _refund_lots(db, consumed_ids, [s["lot_id"] for s in lot_specs])
            _fail_analysis(project_id, _MSG_IA_INDISPONIBLE, "auth")
            return
        except Exception as e:
            logger.error(f"Erreur analyse IA (tronc commun) {project_id}: {e}", exc_info=True)
            _refund_lots(db, consumed_ids, [s["lot_id"] for s in lot_specs])
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
        failed_lot_ids = set()
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [(pool.submit(_one_lot, spec), spec) for spec in lot_specs]
                for fut, spec in futures:
                    try:
                        results.append(fut.result(timeout=1200))
                    except ClaudeRateLimitError:
                        failed_lots.append("rate_limit")
                        failed_lot_ids.add(spec["lot_id"])
                        _refund_lots(db, consumed_ids, [spec["lot_id"]])
                    except ClaudeAuthenticationError:
                        failed_lots.append("auth")   # B9
                        failed_lot_ids.add(spec["lot_id"])
                        _refund_lots(db, consumed_ids, [spec["lot_id"]])
                    except Exception as e:
                        logger.error("Analyse lot échouée: %s", e, exc_info=True)
                        failed_lots.append(str(e))
                        failed_lot_ids.add(spec["lot_id"])
                        _refund_lots(db, consumed_ids, [spec["lot_id"]])
        except Exception as e:
            # Exception au niveau du pool (submit/__exit__) : les lots ni
            # aboutis ni déjà remboursés restent consommés sans livraison —
            # on les rembourse et on les signale (invariant « consommé ⇒
            # livré ou remboursé »), plus jamais avalé en silence.
            logger.error("Pool lots: %s", e, exc_info=True)
            done_ids = {rs["lot_id"] for rs, _ in results}
            orphaned = [s["lot_id"] for s in lot_specs
                        if s["lot_id"] not in done_ids and s["lot_id"] not in failed_lot_ids]
            for lot_id in orphaned:
                failed_lots.append(str(e))
                failed_lot_ids.add(lot_id)
            _refund_lots(db, consumed_ids, orphaned)

        if not results and failed_lots:
            _fail_analysis(project_id,
                           "Limite Anthropic atteinte. Relancez dans une minute."
                           if "rate_limit" in failed_lots else
                           _MSG_IA_INDISPONIBLE if "auth" in failed_lots else
                           "Erreur lors de l'analyse IA. Relancez l'analyse.",
                           ";".join(failed_lots))
            return

        pipeline_tracker.complete_step(project_id, "analyzing_pass2")
        pipeline_tracker.start_step(project_id, "finalizing")

        # ── Persistance par lot + finalisation ──────────────────────────────
        # delivered_lots : chaque lot dont la compliance est PERSISTÉE (donc
        # livrée). En cas de crash finalize, on ne rembourse QUE les lots non
        # livrés (R4/R6) — un lot déjà en base et consultable reste dû.
        all_requirements = list(commun_reqs)
        delivered_lots = set()
        for spec, r2 in results:
            reqs2 = _dedup_against(r2.get("requirements", []), commun_reqs)
            _anchor_requirements_safe(db, project_id, reqs2, spec["lot_id"])
            _persist_scope(db, project_id, reqs2, spec["lot_id"])
            delivered_lots.add(spec["lot_id"])
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
        # Refund EXACT : uniquement les lots NON livrés et pas déjà remboursés
        # (fini le blanket « tout rembourser » qui offrait les lots livrés et
        # pouvait supprimer l'unité d'un run historique, cf. R4).
        _delivered = locals().get("delivered_lots", set())
        _failed = locals().get("failed_lot_ids", set())
        undelivered = [s["lot_id"] for s in lot_specs
                       if s["lot_id"] not in _delivered and s["lot_id"] not in _failed]
        _refund_lots(db, consumed_ids, undelivered)
        _fail_analysis(project_id, "Erreur lors de l'enregistrement des résultats. Relancez l'analyse.", str(e))
    finally:
        db.close()


def _dedup_against(new_reqs: list, existing: list) -> list:
    """Écarte les exigences déjà présentes dans le tronc commun (mêmes 60
    premiers caractères normalisés)."""
    seen = {(r.get("exigence") or "").lower().strip()[:60] for r in existing}
    return [r for r in new_reqs
            if (r.get("exigence") or "").lower().strip()[:60] not in seen]


def _anchor_requirements_safe(db: Session, project_id: str, requirements: list,
                              lot: str | None = None) -> None:
    """Ancrage des sources d'une portée ('_commun' ou un lot), non bloquant."""
    from services.ai.excerpt_anchor import anchor_requirements, resolve_pages
    try:
        texts, paths, rangs = _build_anchor_docs(db, project_id, lot)
        anchor_requirements(requirements, texts, rangs)
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
            source_excerpt_ia=req.get("source_excerpt_ia"),
            ancrage_niveau=req.get("ancrage_niveau"),
            ancrage_score=req.get("ancrage_score"),
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
    project.active_run_consumptions = None  # R5 — run livré : plus rien à recréditer
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

    # Audit #12 — notification sobre « analyse terminée » (in-app + email),
    # même canal que memoire_ready. Best-effort : n'échoue jamais le run.
    try:
        from services.notifications import notify as _notify
        corps = (
            f"L'analyse du DCE « {project.name} » est terminée : "
            f"{len(requirements)} exigence(s) extraite(s)"
            + (f" sur {len(lot_specs)} lots" if lot_specs and len(lot_specs) > 1 else "")
            + ". La checklist de candidature est prête."
        )
        if failed_lots:
            corps += f" {len(failed_lots)} lot(s) à relancer depuis l'écran d'analyse."
        _notify(
            db, org_id, "analysis_ready",
            titre=f"Analyse terminée — {project.name}",
            corps=corps,
            send_email=True,
        )
        db.commit()
    except Exception:
        logger.exception("Notification analysis_ready échouée (non bloquant)")
        db.rollback()

    pipeline_tracker.complete_pipeline(project_id)
    logger.info(
        "Analyse %s terminée : %d exigences, %d critères (docs %d/%d%s%s)",
        project_id, len(requirements), len(criteres_jugement), docs_sent, docs_total,
        ", partielle" if partial_analysis else "",
        ", peu d'exigences" if low_requirement_count else "",
    )


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


# R11 — source UNIQUE (filtre org + soft-delete) ; fini les 7 copies.
from services.project_access import get_owned_project as _get_project_or_404
