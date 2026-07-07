"""
Génération de la checklist de Vérification depuis la BASE (déterministe, 0 €).

Fix « Vérification vide » : la checklist n'était produite QUE pendant le run
d'analyse (bloc best-effort silencieux — un échec la laissait vide à jamais)
et ignorait les scopes multi-lots.

Agrégation du périmètre analysé :
  • communes  : exigences candidature/offre du tronc commun ('_commun' +
    legacy NULL) → une pièce UNE seule fois (lot NULL) ;
  • par lot   : exigences spécifiques (scope 'lotN') → pièce étiquetée
    lot='lotN', écartée si identique à une commune.
Rejouable à volonté (matcher coffre-fort déterministe) : POST
/checklist/regenerate ou fin d'analyse.
"""
import asyncio
import logging
import re
import unicodedata
from typing import Optional

from sqlalchemy.orm import Session

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.document import Document

logger = logging.getLogger(__name__)

_CHECKLIST_CATEGORIES = ("candidature", "offre")


def _norm_key(text: str) -> str:
    s = unicodedata.normalize("NFKD", (text or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\W+", " ", s).strip()[:80]


def generate_checklist_from_db(db: Session, project_id: str, org_id: str) -> int:
    """(Re)génère la checklist complète du projet. Retourne le nb d'items."""
    from services.ai.checklist_matcher import ChecklistMatcher

    rows = db.query(ComplianceItem).filter(
        ComplianceItem.project_id == project_id,
        ComplianceItem.category.in_(_CHECKLIST_CATEGORIES),
    ).order_by(ComplianceItem.created_at).all()
    if not rows:
        logger.info("Checklist %s : aucune exigence candidature/offre en base", project_id)
        return 0

    # Groupes : communes (_commun + legacy NULL) puis par lot, dédupliqués
    common_keys: set = set()
    groups: dict = {None: []}
    for r in rows:
        scope = None if r.lot in (None, "_commun") else r.lot
        key = _norm_key(r.exigence_text)
        if scope is None:
            if key in common_keys:
                continue
            common_keys.add(key)
            groups[None].append(r)
        else:
            if key in common_keys:
                continue  # pièce déjà couverte par le tronc commun
            groups.setdefault(scope, [])
            if key in {_norm_key(x.exigence_text) for x in groups[scope]}:
                continue
            groups[scope].append(r)

    vault_docs = db.query(Document).filter(Document.organization_id == org_id).all()
    matcher = ChecklistMatcher()

    def _to_req(r: ComplianceItem) -> dict:
        return {
            "exigence": r.exigence_text,
            "source_excerpt": r.source_excerpt,
            "source_kind": "vault",
        }

    # Remplacement idempotent
    db.query(ChecklistItem).filter(ChecklistItem.project_id == project_id).delete(
        synchronize_session=False)

    total = 0
    position = 0
    for scope, scope_rows in groups.items():
        if not scope_rows:
            continue
        matched = asyncio.run(matcher.match(
            [_to_req(r) for r in scope_rows], vault_docs,
            project_id=project_id, db=db,
        ))
        for item_data in matched:
            db.add(ChecklistItem(
                project_id=project_id,
                document_type_required=item_data.get("document_type_required", ""),
                source_kind=item_data.get("source_kind", "vault"),
                linked_document_id=item_data.get("linked_document_id"),
                template_project_doc_id=item_data.get("template_project_doc_id"),
                completed_project_doc_id=item_data.get("completed_project_doc_id"),
                status=item_data.get("status", "manquant"),
                # Colonnes VARCHAR(500) — le passage complet vit dans le
                # viewer via l'exigence source, ici on tronque proprement.
                details=(item_data.get("details") or "")[:490] or None,
                source_in_rc=(item_data.get("source_in_rc") or "")[:490] or None,
                rc_position=position,
                lot=scope,
            ))
            position += 1
            total += 1
    db.commit()
    logger.info("Checklist %s : %d pièces générées (%d communes, %d scopes lot)",
                project_id, total, len(groups.get(None, [])), len(groups) - 1)
    return total
