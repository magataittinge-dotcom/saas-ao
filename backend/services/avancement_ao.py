"""Avancement de chaque AO dans la liste « Mes AO » : unités consommées, pièces du coffre-fort prêtes, plan validé, mémoire écrit.

Calcul déterministe, sans IA, en QUATRE requêtes groupées (une par table, `IN (...)` sur les identifiants de la page) : le nombre
de requêtes ne dépend pas du nombre d'AO. Isolation : les identifiants viennent d'une requête déjà filtrée par organisation, et
chaque table qui porte `organization_id` est filtrée aussi par lui (les journaux d'une autre organisation ne comptent jamais).
`checklist_items` et `memoires_techniques` n'ont pas de colonne d'organisation : leur seul lien est `project_id`, donc la liste
d'identifiants passée en entrée est la frontière.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique
from models.plan_memoire import PlanMemoire
from models.quota_consumption import QuotaConsumption
from schemas.project import AvancementAO, PiecesAO, UnitesAO


def avancements_par_projet(db: Session, organization_id: str, project_ids: Iterable[str]) -> dict[str, AvancementAO]:
    ids = list(project_ids)
    if not ids:
        return {}

    unites: dict[str, dict[str, int]] = defaultdict(dict)
    for pid, kind, n in (
        db.query(QuotaConsumption.project_id, QuotaConsumption.kind, func.count(QuotaConsumption.id))
        .filter(QuotaConsumption.organization_id == organization_id, QuotaConsumption.project_id.in_(ids))
        .group_by(QuotaConsumption.project_id, QuotaConsumption.kind)
    ):
        unites[pid][kind] = n

    # Pièces du coffre-fort demandées par l'AO ; « non applicable » n'est pas demandée. « Prête » = trouvée au coffre, valable.
    pieces: dict[str, PiecesAO] = {}
    for pid, total, pretes in (
        db.query(
            ChecklistItem.project_id,
            func.count(ChecklistItem.id),
            func.sum(case((ChecklistItem.status == "present", 1), else_=0)),
        )
        .filter(
            ChecklistItem.project_id.in_(ids),
            ChecklistItem.source_kind == "vault",
            ChecklistItem.status != "non_applicable",
        )
        .group_by(ChecklistItem.project_id)
    ):
        pieces[pid] = PiecesAO(total=int(total), pretes=int(pretes or 0))

    plans = dict(
        db.query(PlanMemoire.project_id, func.max(PlanMemoire.valide_le))
        .filter(PlanMemoire.organization_id == organization_id, PlanMemoire.project_id.in_(ids))
        .group_by(PlanMemoire.project_id)
    )
    memoires = dict(
        db.query(MemoireTechnique.project_id, func.max(MemoireTechnique.generated_at))
        .filter(MemoireTechnique.project_id.in_(ids))
        .group_by(MemoireTechnique.project_id)
    )

    return {
        pid: AvancementAO(
            unites=UnitesAO(analyses=unites[pid].get("analysis", 0), memoires=unites[pid].get("memoire", 0)),
            pieces=pieces.get(pid),
            plan_valide_le=plans.get(pid),
            memoire_ecrit_le=memoires.get(pid),
        )
        for pid in ids
    }
