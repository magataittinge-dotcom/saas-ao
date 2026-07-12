"""Machine à états projet — garde de relance (R12).

Les écritures directes `project.status = "en_cours"` au lancement d'une
analyse / d'un mémoire contournaient _STATUS_TRANSITIONS : un POST /analyze
sur un projet `gagné`/`perdu` (outcomes TERMINAUX) le ramenait
silencieusement en cours. Ce garde bloque la relance depuis un état
terminal, en cohérence avec _STATUS_TRANSITIONS (gagné/perdu = aucune
sortie).
"""
from fastapi import HTTPException

# Outcomes terminaux : aucun run ne peut y être relancé (aligné sur
# routers.projects._STATUS_TRANSITIONS où gagné/perdu -> set()).
TERMINAL_OUTCOMES = frozenset({"gagné", "perdu"})


def ensure_relaunchable(project) -> None:
    """Lève 409 si le projet est clôturé (gagné/perdu) — sinon un run
    réécrirait son statut en 'en_cours' hors machine à états."""
    if (project.status or "") in TERMINAL_OUTCOMES:
        raise HTTPException(
            status_code=409,
            detail="Projet clôturé (gagné/perdu) — rouvrez-le avant de relancer "
                   "une analyse ou une génération.",
        )
