"""Schémas Pydantic des calculateurs déterministes (retenue de garantie).

Validation STRICTE des entrées (bornes, signes) — ces endpoints sont du calcul
pur (0 appel IA). Les réponses sont les dicts produits par services.synorix_calc
(source unique de vérité = skills Synorix testées), non redéclarés ici pour
éviter toute divergence de schéma.

NB — le schéma OABRequest a été retiré avec le calculateur OAB (frontière
chiffrage FERME, CLAUDE.md).
"""

from pydantic import BaseModel, Field


class RetenueGarantieRequest(BaseModel):
    """Entrée du calcul retenue de garantie / pénalités / intérêts moratoires."""

    montant_ht: float = Field(..., gt=0, le=1e12, description="Montant du marché (€ HT).")
    tva: float = Field(0.20, ge=0, le=1, description="Taux de TVA (fraction). Défaut 0,20.")
    taux_rg: float = Field(0.05, ge=0, le=0.05, description="Taux retenue de garantie (max légal 5 %).")
    penalite_diviseur: int = Field(3000, gt=0, le=100000, description="Diviseur pénalités (CCAG-Travaux Art.19.2.3 = 1/3000).")
    jours_retard_execution: int = Field(0, ge=0, le=100000, description="Jours calendaires de retard d'exécution.")
    valeur_ht_en_retard: float | None = Field(None, gt=0, le=1e12, description="Assiette pénalités (€ HT). Défaut = montant_ht.")
    creance_ttc: float | None = Field(None, gt=0, le=1e12, description="Créance pour intérêts moratoires (€ TTC). Défaut = montant TTC.")
    taux_bce: float = Field(0.0, ge=0, le=1, description="Taux directeur BCE (fraction, ex. 0.0415).")
    jours_retard_paiement: int = Field(0, ge=0, le=100000, description="Jours de retard de paiement.")
