"""Service PUR — différenciateurs DÉTERMINISTES prêts à brancher (NON câblé).

⚠️ Ce module n'est importé par AUCUN router ni par main.py : il ne change pas
le comportement live. Il fournit deux fonctions de service réutilisant la
logique DÉJÀ TESTÉE des skills Synorix déterministes (`model="none"`, aucun
appel LLM), pour qu'un futur endpoint puisse les exposer en 3 lignes sans
toucher au moteur A.

Branchement futur (cf. docs/nuit-rapport/BLOC3-plan-differenciateurs.md) :
    # routers/synorix_skills.py (NOUVEAU router, inclus EN AJOUT dans main.py)
    from services.synorix_calc import compute_oab, compute_retenue_garantie

    @router.post("/{project_id}/synorix/oab")
    async def oab_endpoint(project_id: int, body: OabBody):
        return await compute_oab(
            prix_candidat=body.prix_candidat,
            prix_offres=body.prix_offres,
            project_id=project_id,
        )

Pourquoi déléguer aux skills plutôt que réimplémenter : source unique de
vérité. Les arithmétiques OAB (double moyenne L2152-5) et retenue de garantie
(CCAG-Travaux Art.19) sont déjà couvertes par les tests synorix — on ne les
duplique pas (pas de risque de divergence).
"""

from __future__ import annotations

from synorix.skills.extraction.calculatrice_retenue_garantie import (
    CalculatriceRetenueGarantie,
    Input as RetenueInput,
)
from synorix.skills.verification.calculateur_oab_temps_reel import (
    CalculateurOabTempsReel,
    Input as OabInput,
)

# Les skills déterministes n'appellent jamais le client LLM (calcul pur), donc
# on peut leur passer None en toute sécurité.
_NO_CLIENT = None


async def compute_oab(
    *,
    prix_candidat: float,
    prix_offres: list[float] | None = None,
    seuil_oab: float = 0.9,
    project_id: int = 0,
) -> dict:
    """Risque d'Offre Anormalement Basse (double moyenne L2152-5 CCP).

    Retourne un dict : m1, m2, seuil_oab_euros, marge_avant_oab, gauge
    (vert/orange/rouge), est_oab, rappel_juridique, avertissements, sources_nbk.
    DÉTERMINISTE — 0 appel LLM, 0 coût.
    """
    skill = CalculateurOabTempsReel()
    out = await skill.run(
        OabInput(
            project_id=project_id,
            prix_candidat=prix_candidat,
            prix_offres=prix_offres or [],
            seuil_oab=seuil_oab,
        ),
        client=_NO_CLIENT,
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
    project_id: int = 0,
) -> dict:
    """Montants financiers d'un marché (retenue de garantie, pénalités,
    intérêts moratoires) — CCAG-Travaux 2021 Art.19 / CCP R2192-31.

    Retourne un dict : montant_ttc, postes[], avertissements[].
    DÉTERMINISTE — 0 appel LLM, 0 coût.
    """
    skill = CalculatriceRetenueGarantie()
    out = await skill.run(
        RetenueInput(
            project_id=project_id,
            montant_ht=montant_ht,
            tva=tva,
            taux_rg=taux_rg,
            penalite_diviseur=penalite_diviseur,
            jours_retard_execution=jours_retard_execution,
            valeur_ht_en_retard=valeur_ht_en_retard,
            creance_ttc=creance_ttc,
            taux_bce=taux_bce,
            jours_retard_paiement=jours_retard_paiement,
        ),
        client=_NO_CLIENT,
    )
    return out.model_dump()
