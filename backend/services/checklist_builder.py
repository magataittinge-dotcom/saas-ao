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

def type_coffre_pour_piece(type_demande: Optional[str], nom_fichier: str) -> str:
    """Type du coffre d'un fichier déposé depuis une ligne de checklist (B2 §7 n°4).

    La modale « Choisir une pièce » envoie le type de la LIGNE (typologie des
    pièces, ex. « qualibat_rge ») : il est traduit en type du coffre (le nom du
    fichier départage « qualibat » et « rge ») ; un type du coffre est gardé ;
    sinon le nom du fichier classe la pièce. Jamais un type que la contrainte
    CHECK refuserait (erreur 500 après stockage)."""
    from models.document import DOCUMENT_TYPES
    from services.vault_classifier import detect_vault_type
    detecte = detect_vault_type(nom_fichier or "")
    if type_demande in DOCUMENT_TYPES and type_demande != "autre":
        return type_demande
    candidats = _VAULT_TYPES_FOR.get(type_demande or "", [])
    if candidats:
        return detecte if detecte in candidats else candidats[0]
    return detecte


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
    best = _pick_best_vault_doc(candidates)   # B1 : valable > expirée, jamais supprimée
    if best is None:
        return None, "manquant"
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


def recaler_lignes_coffre(lines, docs_by_id: dict) -> int:
    """B1 — recale les pièces du coffre liées sur l'état du document AUJOURD'HUI.

    Le statut d'une ligne est figé quand elle est générée ou liée : une
    attestation qui expire ensuite, ou un document retiré du coffre, restait
    « Conforme » à l'écran alors que le ZIP l'écarte. Ne touche ni une ligne
    « non applicable », ni un formulaire du DCE ; ne change jamais le document
    lié (le choix reste celui de la génération ou de l'utilisateur) ; un
    document absent de ``docs_by_id`` (retiré du coffre, ou d'une autre org)
    n'est plus lié. Modifie les lignes en mémoire, sans commit ; retourne le
    nombre de lignes modifiées.

    ``docs_by_id`` : documents de l'org du projet, NON supprimés, par id."""
    changed = 0
    for line in lines:
        if (line.source_kind != "vault" or not line.linked_document_id
                or line.status == "non_applicable"):
            continue
        doc = docs_by_id.get(line.linked_document_id)
        if doc is None:
            line.linked_document_id = None
            line.status = "manquant"
            changed += 1
            continue
        status = _vault_doc_status(doc)
        if line.status != status:
            line.status = status
            changed += 1
    return changed


def sync_vault_lines(db: Session, project_id: str, org_id: str) -> int:
    """Recalage (voir ``recaler_lignes_coffre``) appelé à la lecture de la
    checklist et du score. Idempotent : n'écrit que ce qui change."""
    lines = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.project_id == project_id,
                ChecklistItem.source_kind == "vault",
                ChecklistItem.linked_document_id.isnot(None),
                ChecklistItem.status != "non_applicable")
        .all()
    )
    if not lines:
        return 0
    docs = {
        d.id: d for d in db.query(Document).filter(
            Document.id.in_({l.linked_document_id for l in lines}),
            Document.organization_id == org_id,
            Document.deleted_at.is_(None),
        ).all()
    }
    changed = recaler_lignes_coffre(lines, docs)
    if changed:
        db.commit()
        logger.info("Checklist %s : %d pièce(s) du coffre recalée(s) sur leur état du jour",
                    project_id, changed)
    return changed


def sync_vault_lines_safe(db: Session, project_id: str, org_id: str) -> None:
    """Lecture d'abord : un échec du recalage ne casse jamais l'affichage."""
    try:
        sync_vault_lines(db, project_id, org_id)
    except Exception:
        logger.exception("Recalage des pièces du coffre impossible (%s)", project_id)
        db.rollback()


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
    # B1 — un document supprimé du coffre n'est jamais candidat.
    vault_by_type = _index_vault_by_type(
        db.query(Document).filter(Document.organization_id == org_id,
                                  Document.deleted_at.is_(None)).all()
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
