"""
Génération de la checklist de Vérification depuis la BASE (déterministe, 0 €).

Fix « Vérification vide » (racine) : la checklist n'était produite QUE pendant
le run d'analyse (bloc best-effort silencieux — un échec la laissait vide à
jamais) et ignorait les scopes multi-lots.

Consolidation experte (typologie 4 groupes — cf. ``checklist_typology``) :
chaque exigence candidature/offre est classée en ``fournir`` / ``completer`` /
``synorix`` / ``workflow``, les variantes d'une même pièce physique sont
fusionnées, et les non-pièces (dépôt, format, chiffrage, contenu de mémoire…)
sont exclues et loggées — jamais mappées en upload, jamais perdues.

Statut par groupe :
  • ``fournir``   → matching coffre-fort (✓/⚠️/✗) par type de pièce ;
  • ``completer`` → template DCE lié si présent, sinon « à compléter » ;
  • ``workflow``  → template DCE (DPGF/BPU) lié, complétion suivie par C12 ;
  • ``synorix``   → jalon ``non_applicable`` (produit à l'étape Mémoire).

Rejouable à volonté : POST /checklist/regenerate ou fin d'analyse.
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.document import Document
from models.project import ProjectDocument
from services.ai.checklist_matcher import (
    _index_vault_by_type,
    _pick_best_vault_doc,
    _vault_doc_status,
)
from services.checklist_typology import ChecklistLine, plan_checklist

logger = logging.getLogger(__name__)

_CHECKLIST_CATEGORIES = ("candidature", "offre")

# Pièce à fournir → type(s) de document du coffre-fort à matcher (C10).
_VAULT_TYPES_FOR: dict[str, list[str]] = {
    "urssaf": ["urssaf"], "fiscal": ["fiscal"], "decennale": ["decennale"],
    "rc_civile": ["rc_civile"], "pro_btp": ["pro_btp"], "cibtp": ["cibtp"],
    "qualibat_rge": ["qualibat", "rge"], "caces": ["caces"], "amiante_ss4": ["amiante_ss4"],
    "chiffre_affaires": ["chiffre_affaires"], "effectifs": ["effectifs"],
    "attestation_travaux": ["attestation_travaux"], "kbis": ["kbis"],
    "organigramme_doc": ["organigramme_doc"], "dume": ["dume"], "pouvoir": ["pouvoir"],
    "rib": ["rib"],
}

# Formulaire à compléter / workflow → type de template DCE (ProjectDocument).
_TEMPLATE_TYPE_FOR: dict[str, str] = {
    "dc1": "dc1_template", "dc2": "dc2_template",
    "acte_engagement": "acte_engagement_template",
    "attestation_visite": "attestation_visite_template",
    "dpgf": "dpgf_template", "bpu": "bpu_template", "dqe": "dqe_template",
}


def _vault_status(ctype: str, vault_by_type: dict) -> tuple[Optional[str], str]:
    """(linked_document_id, status) pour une pièce à fournir depuis le coffre."""
    candidates: list[Document] = []
    for t in _VAULT_TYPES_FOR.get(ctype, []):
        candidates += vault_by_type.get(t, [])
    if not candidates:
        return None, "manquant"
    best = _pick_best_vault_doc(candidates)
    return str(best.id), _vault_doc_status(best)


def _template_status(project_id: str, db: Session, template_type: str):
    """(template_id, completed_id, status) pour un formulaire/DPGF fourni au DCE."""
    templates = (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == project_id,
                ProjectDocument.type == template_type,
                ProjectDocument.is_user_completed.is_(False))
        .all()
    )
    completed = (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == project_id,
                ProjectDocument.type == template_type,
                ProjectDocument.is_user_completed.is_(True))
        .all()
    )
    if templates and completed:
        return templates[0].id, completed[0].id, "present"
    if templates:
        return templates[0].id, None, "manquant"
    return None, None, "manquant"


def _line_to_item(line: ChecklistLine, project_id: str, db: Session,
                  vault_by_type: dict, position: int) -> ChecklistItem:
    excerpt = (line.source_excerpt or "")[:490] or None
    suffix = f" ({line.merged_count} exigences du RC regroupées)" if line.merged_count > 1 else ""
    base = dict(
        project_id=project_id,
        document_type_required=line.canonical_type,
        details=(line.label + suffix)[:490],
        source_in_rc=excerpt,
        rc_position=position,
        lot=line.scope,
        document_group=line.group,
    )

    if line.group == "synorix":
        # Jalon : produit par Synorix à l'étape Mémoire — jamais un upload.
        base.update(source_kind="vault", status="non_applicable",
                    details=(f"{line.label} — généré par Synorix à l'étape Mémoire")[:490])
        return ChecklistItem(**base)

    if line.group == "fournir":
        linked, status = _vault_status(line.canonical_type, vault_by_type)
        base.update(source_kind="vault", linked_document_id=linked, status=status)
        return ChecklistItem(**base)

    # completer / workflow : template DCE si un type est connu, sinon « à compléter »
    tt = _TEMPLATE_TYPE_FOR.get(line.canonical_type)
    if tt:
        template_id, completed_id, status = _template_status(project_id, db, tt)
        base.update(source_kind="dce_template", document_type_required=tt,
                    template_project_doc_id=template_id,
                    completed_project_doc_id=completed_id, status=status)
    else:
        base.update(source_kind="dce_template", status="manquant")
    return ChecklistItem(**base)


def generate_checklist_from_db(db: Session, project_id: str, org_id: str) -> int:
    """(Re)génère la checklist typée du projet. Retourne le nb de lignes."""
    rows = (
        db.query(ComplianceItem)
        .filter(ComplianceItem.project_id == project_id,
                ComplianceItem.category.in_(_CHECKLIST_CATEGORIES))
        .order_by(ComplianceItem.created_at)
        .all()
    )
    if not rows:
        logger.info("Checklist %s : aucune exigence candidature/offre en base", project_id)
        return 0

    plan = plan_checklist(rows)
    vault_by_type = _index_vault_by_type(
        db.query(Document).filter(Document.organization_id == org_id).all()
    )

    # Remplacement idempotent
    db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).delete(
        synchronize_session=False)

    for position, line in enumerate(plan.lines):
        db.add(_line_to_item(line, project_id, db, vault_by_type, position))
    db.commit()

    logger.info("Checklist %s : %s (entrée=%d exigences)",
                project_id, plan.summary(), len(rows))
    return len(plan.lines)
