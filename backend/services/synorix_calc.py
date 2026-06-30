"""Service des calculateurs déterministes (différenciateurs, 0 LLM, 0 coût).

Façade async exposant les calculs purs de `services/calculators/` (retenue de
garantie, OAB) sous une API stable consommée par `routers/calculators.py`.
Les calculateurs sont **autonomes** (Pydantic Input/Output + `compute()`), sans
dépendance à `synorix/` (système B archivé hors repo).

Branchement futur possible :
    @router.post("/{project_id}/synorix/oab")
    async def oab_endpoint(project_id: int, body: OabBody):
        return await compute_oab(prix_candidat=body.prix_candidat,
                                 prix_offres=body.prix_offres)
"""

from __future__ import annotations

from services.calculators import oab as _oab
from services.calculators import retenue_garantie as _rg


async def compute_oab(
    *,
    prix_candidat: float,
    prix_offres: list[float] | None = None,
    seuil_oab: float = 0.9,
    project_id: int = 0,  # accepté pour compat. d'API (non utilisé par le calcul)
) -> dict:
    """Risque d'Offre Anormalement Basse (double moyenne L2152-5 CCP).

    Retourne un dict : m1, m2, seuil_oab_euros, marge_avant_oab, gauge
    (vert/orange/rouge), est_oab, rappel_juridique, avertissements, sources_nbk.
    DÉTERMINISTE — 0 appel LLM, 0 coût.
    """
    out = _oab.compute(
        _oab.Input(
            prix_candidat=prix_candidat,
            prix_offres=prix_offres or [],
            seuil_oab=seuil_oab,
        )
    )
    return out.model_dump()


async def compute_retenue_garantie(
    *,
    montant_ht: float,
    tva: float = 0.20,
    taux_rg: float = 0.05,
    penalite_diviseur: int = 3000,
    jours_retard_execution: int = 0,
    valeur_ht_en_retard: float | None = None,
    creance_ttc: float | None = None,
    taux_bce: float = 0.0,
    jours_retard_paiement: int = 0,
    project_id: int = 0,  # accepté pour compat. d'API (non utilisé par le calcul)
) -> dict:
    """Montants financiers d'un marché (retenue de garantie, pénalités,
    intérêts moratoires) — CCAG-Travaux 2021 Art.19 / CCP R2192-31.

    Retourne un dict : montant_ttc, postes[], avertissements[].
    DÉTERMINISTE — 0 appel LLM, 0 coût.
    """
    out = _rg.compute(
        _rg.Input(
            montant_ht=montant_ht,
            tva=tva,
            taux_rg=taux_rg,
            penalite_diviseur=penalite_diviseur,
            jours_retard_execution=jours_retard_execution,
            valeur_ht_en_retard=valeur_ht_en_retard,
            creance_ttc=creance_ttc,
            taux_bce=taux_bce,
            jours_retard_paiement=jours_retard_paiement,
        )
    )
    return out.model_dump()
