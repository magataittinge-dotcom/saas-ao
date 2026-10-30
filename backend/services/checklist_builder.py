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
from services.vault_classifier import is_document_expired

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


def _piece_du_lot(pieces: list, lot: Optional[str]):
    """B2 §7 n°3 — la trame (ou la pièce remplie) du BON lot, d'après le
    rattachement des pièces aux lots (related_lots ; numéros comparés avec
    document_tagger._normalize_lot_num). Sans lot, ou une seule pièce : celle-ci.
    Sinon celle du lot, à défaut l'unique pièce commune (« all » ou non
    rattachée) ; plusieurs pièces et aucune pour ce lot → None : jamais la
    trame d'un autre lot."""
    from services.document_tagger import _normalize_lot_num
    if not pieces:
        return None
    if not lot or lot in ("all", "_commun") or len(pieces) == 1:
        return pieces[0]
    cible = _normalize_lot_num(lot)
    du_lot = [p for p in pieces
              if any(_normalize_lot_num(t) == cible for t in (p.related_lots or []) if t not in ("all", "info"))]
    if du_lot:
        return du_lot[0]
    communes = [p for p in pieces if not p.related_lots or "all" in p.related_lots]
    return communes[0] if len(communes) == 1 else None


def _template_status(project_id: str, db: Session, template_type: str, lot: Optional[str] = None):
    """(template_id, completed_id, status) pour un formulaire/DPGF fourni au DCE,
    pour le lot de la ligne (ou le lot sélectionné)."""
    from sqlalchemy.orm import load_only
    pieces = (
        db.query(ProjectDocument)
        .options(load_only(ProjectDocument.id, ProjectDocument.related_lots,
                           ProjectDocument.is_user_completed))
        .filter(ProjectDocument.project_id == project_id,
                ProjectDocument.type == template_type)
        .all()
    )
    template = _piece_du_lot([p for p in pieces if not p.is_user_completed], lot)
    completed = _piece_du_lot([p for p in pieces if p.is_user_completed], lot)
    if template and completed:
        return template.id, completed.id, "present"
    if template:
        return template.id, None, "manquant"
    return None, None, "manquant"


def _line_to_item(line: ChecklistLine, project_id: str, db: Session,
                  vault_by_type: dict, position: int,
                  selected_lot: Optional[str] = None) -> ChecklistItem:
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
        template_id, completed_id, status = _template_status(
            project_id, db, tt, line.scope or selected_lot)
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


def _cle_ligne(item) -> tuple:
    """Même pièce, même lot. Les pièces inconnues (« autre ») ne sont jamais
    fusionnées : leur libellé les distingue."""
    type_ = item.document_type_required
    return (type_, item.lot, item.details if type_ == "autre" else None)


def _choix_de(item) -> dict:
    """Ce que l'utilisateur a pu poser sur une ligne (copie détachée de l'ORM)."""
    return dict(
        linked_document_id=item.linked_document_id,
        completed_project_doc_id=item.completed_project_doc_id,
        signature_confirmed=bool(item.signature_confirmed),
        status=item.status,
        details=item.details,
        depose_le=item.depose_le,
        depose_par_id=item.depose_par_id,
    )


def _reprendre_les_choix(item, ancien: Optional[dict], docs_par_id: dict, completes: set) -> None:
    """B2 §7 n°2 — la ligne régénérée reprend les choix de celle qu'elle remplace :
    pièce choisie au coffre (tant qu'elle n'est ni supprimée ni expirée — sinon
    le choix automatique B1 s'applique), trame déposée et son contrôle,
    confirmation de signature, « Non concerné »."""
    if not ancien:
        return
    item.signature_confirmed = ancien["signature_confirmed"]
    if item.source_kind == "vault" and item.document_group != "synorix":
        doc = docs_par_id.get(ancien["linked_document_id"]) if ancien["linked_document_id"] else None
        if doc is not None and not is_document_expired(doc):
            item.linked_document_id = doc.id
            item.status = _vault_doc_status(doc)
            if doc.id == ancien["linked_document_id"]:   # le choix repris garde son dépôt
                item.depose_le, item.depose_par_id = ancien["depose_le"], ancien["depose_par_id"]
    elif item.source_kind == "dce_template" and ancien["completed_project_doc_id"] in completes:
        # la trame déposée reste celle de la ligne, avec son contrôle (DPGF)
        item.completed_project_doc_id = ancien["completed_project_doc_id"]
        item.depose_le, item.depose_par_id = ancien["depose_le"], ancien["depose_par_id"]
        if ancien["status"] in ("present", "warning"):
            item.status, item.details = ancien["status"], ancien["details"]
        else:
            item.status = "present"
    if ancien["status"] == "non_applicable":
        item.status = "non_applicable"


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
    coffre = db.query(Document).filter(Document.organization_id == org_id,
                                       Document.deleted_at.is_(None)).all()
    vault_by_type = _index_vault_by_type(coffre)

    # B2 §7 n°2 — « Actualiser » garde les choix : relevés AVANT le
    # remplacement, puis repris par la ligne qui remplace la même pièce.
    choix = {_cle_ligne(c): _choix_de(c) for c in
             db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).all()}
    completes = {d.id for d in db.query(ProjectDocument.id).filter(
        ProjectDocument.project_id == project_id,
        ProjectDocument.is_user_completed.is_(True))}

    # Remplacement idempotent
    db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).delete(
        synchronize_session=False)

    docs_par_id = {d.id: d for d in coffre}
    from models.project import Project
    selected_lot = db.query(Project.selected_lot).filter(Project.id == project_id).scalar()
    for position, line in enumerate(plan.lines):
        item = _line_to_item(line, project_id, db, vault_by_type, position, selected_lot)
        _reprendre_les_choix(item, choix.get(_cle_ligne(item)), docs_par_id, completes)
        db.add(item)
    db.commit()

    logger.info("Checklist %s : %s (entrée=%d exigences)",
                project_id, plan.summary(), len(rows))
    return len(plan.lines)
