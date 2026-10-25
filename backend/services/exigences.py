"""Exigences du dossier : groupes de confirmation et périmètre du lot.

Décision du 25/10 (export « 0/N ») : l'utilisateur confirme les exigences, une
à une ou par groupe (« Tout confirmer »). Groupes → catégories réelles des
exigences (définitions de services/ai/prompts.py) :

  • candidature     ← « candidature » (pièces administratives et capacités) ;
  • offre_technique ← « offre » (documents de l'offre à remettre) et
                      « criteres_notation » (critères d'évaluation des offres) ;
  • execution       ← « technique » (exigences d'exécution du CCTP et du CCAP)
                      et « planning » (délais, jalons, pénalités).

Les pièces à joindre vivent dans la checklist : leur état est un fait vérifié
par Synorix (« Jointe »), jamais une confirmation.
"""
from typing import Optional

from sqlalchemy.orm import Session

from models.compliance_item import COMPLIANCE_CATEGORIES, ComplianceItem

GROUPES_EXIGENCES: dict[str, tuple[str, ...]] = {
    "candidature": ("candidature",),
    "offre_technique": ("offre", "criteres_notation"),
    "execution": ("technique", "planning"),
}

_GROUPE_DE: dict[str, str] = {cat: g for g, cats in GROUPES_EXIGENCES.items() for cat in cats}


def groupe_de_categorie(category: Optional[str]) -> str:
    """Groupe de confirmation d'une catégorie (toutes les COMPLIANCE_CATEGORIES
    ont le leur, vérifié par test_export_exigences_confirmees)."""
    return _GROUPE_DE.get(category or "", "execution")


def categories_sans_groupe() -> set[str]:
    return set(COMPLIANCE_CATEGORIES) - set(_GROUPE_DE)


def requete_exigences_du_dossier(db: Session, project, lot: Optional[str] = None):
    """Exigences du dossier : tronc commun ('_commun'), lot demandé (défaut :
    lot sélectionné du projet) et lignes anciennes sans lot. Sans lot : tout."""
    q = db.query(ComplianceItem).filter(ComplianceItem.project_id == project.id)
    scope = lot or project.selected_lot
    if scope:
        q = q.filter(
            (ComplianceItem.lot == "_commun")
            | (ComplianceItem.lot == scope)
            | (ComplianceItem.lot.is_(None))
        )
    return q
