"""Endpoints des calculateurs DÉTERMINISTES (différenciateurs Synorix).

Calcul pur (0 appel IA, 0 coût) — délègue à services.synorix_calc, qui réutilise
la logique testée des skills Synorix (#24 retenue de garantie CCAG-Travaux Art.19).
Endpoints authentifiés, montés en AJOUT (aucun router existant ni le cœur IA
n'est modifié).

NB — le calculateur OAB (offre anormalement basse) a été RETIRÉ : frontière
chiffrage FERME (CLAUDE.md), Synorix ne commente ni ne conseille jamais les prix.
"""

from fastapi import APIRouter, Depends

from models.user import User
from routers.auth import get_auth_user
from schemas.calculators import RetenueGarantieRequest
from services.synorix_calc import compute_retenue_garantie

router = APIRouter()


@router.post("/retenue-garantie")
async def calculate_retenue_garantie(
    payload: RetenueGarantieRequest,
    user: User = Depends(get_auth_user),
) -> dict:
    """Retenue de garantie + pénalités de retard + intérêts moratoires.

    Renvoie : montant_ttc, postes[] (poste, montant, base, detail), avertissements[].
    """
    return await compute_retenue_garantie(
        montant_ht=payload.montant_ht,
        tva=payload.tva,
        taux_rg=payload.taux_rg,
        penalite_diviseur=payload.penalite_diviseur,
        jours_retard_execution=payload.jours_retard_execution,
        valeur_ht_en_retard=payload.valeur_ht_en_retard,
        creance_ttc=payload.creance_ttc,
        taux_bce=payload.taux_bce,
        jours_retard_paiement=payload.jours_retard_paiement,
    )
