"""Calculatrice retenue de garantie — calcul DÉTERMINISTE (0 LLM, 0 coût).

Montants financiers d'un marché : retenue de garantie, pénalités de retard,
intérêts moratoires, cautionnement. Source : CCAG-Travaux 2021 Art. 19 ;
CCP R2192-31 / R2191-36 (NotebookLM N1).

Autonome : aucun import de `synorix/`. Logique préservée à l'identique depuis
l'ancien skill #24 `calculatrice-retenue-garantie`.
"""

from pydantic import BaseModel, Field


class Input(BaseModel):
    montant_ht: float
    tva: float = 0.20  # taux de TVA (20% par défaut)
    taux_rg: float = 0.05  # retenue de garantie (max 5%)
    penalite_diviseur: int = 3000  # CCAG-Travaux 2021 Art. 19.2.3 : 1/3000 du montant HT (param. si CCAP déroge)
    jours_retard_execution: int = 0  # R (jours calendaires)
    valeur_ht_en_retard: float | None = None  # V ; défaut = montant_ht
    creance_ttc: float | None = None  # pour intérêts moratoires ; défaut = montant TTC
    taux_bce: float = 0.0  # taux directeur BCE (à fournir, ex. 0.0415)
    jours_retard_paiement: int = 0


class PosteCalcul(BaseModel):
    poste: str
    montant: float
    base: str  # "HT" | "TTC"
    detail: str


class Output(BaseModel):
    montant_ttc: float
    postes: list[PosteCalcul]
    avertissements: list[str] = Field(default_factory=list)


def compute(inp: Input) -> Output:
    """Calcul pur, vérifiable. Aucun appel externe."""
    montant_ttc = round(inp.montant_ht * (1 + inp.tva), 2)
    postes: list[PosteCalcul] = []
    avertissements: list[str] = []

    # 1) Retenue de garantie — base TTC, taux ≤ 5 %
    taux_rg = min(inp.taux_rg, 0.05)
    if inp.taux_rg > 0.05:
        avertissements.append("Taux de RG plafonné à 5 % (CCAG-T Art. 19).")
    rg = round(montant_ttc * taux_rg, 2)
    postes.append(PosteCalcul(
        poste="Retenue de garantie",
        montant=rg,
        base="TTC",
        detail=f"{montant_ttc} × {taux_rg:.0%} (Art. 19 CCAG-Travaux 2021)",
    ))

    # 2) Pénalités de retard — base HT, P = V × R / diviseur, plafond 10 % HT, seuil 1000 €
    if inp.jours_retard_execution > 0:
        v = inp.valeur_ht_en_retard if inp.valeur_ht_en_retard is not None else inp.montant_ht
        penalites = round(v * inp.jours_retard_execution / inp.penalite_diviseur, 2)
        plafond = round(inp.montant_ht * 0.10, 2)
        if penalites > plafond:
            penalites = plafond
            avertissements.append("Pénalités plafonnées à 10 % du montant HT.")
        if penalites < 1000:
            avertissements.append(
                "Montant de pénalités < 1 000 € : seuil d'exonération possible (CCAG-T)."
            )
        postes.append(PosteCalcul(
            poste="Pénalités de retard",
            montant=penalites,
            base="HT",
            detail=f"{v} × {inp.jours_retard_execution} / {inp.penalite_diviseur} "
                   f"(P = V × R / diviseur)",
        ))

    # 3) Intérêts moratoires — créance TTC × (BCE + 8 pts) × jours/365 + 40 €
    if inp.jours_retard_paiement > 0:
        creance = inp.creance_ttc if inp.creance_ttc is not None else montant_ttc
        taux = inp.taux_bce + 0.08
        interets = round(creance * taux * inp.jours_retard_paiement / 365 + 40, 2)
        postes.append(PosteCalcul(
            poste="Intérêts moratoires",
            montant=interets,
            base="TTC",
            detail=f"{creance} × (BCE {inp.taux_bce:.2%} + 8 pts) × "
                   f"{inp.jours_retard_paiement}/365 + 40 € (CCP R2192-31)",
        ))

    # 4) Cautionnement (substitution RG) — base TTC, même taux
    caution = round(montant_ttc * taux_rg, 2)
    postes.append(PosteCalcul(
        poste="Cautionnement (substitution RG)",
        montant=caution,
        base="TTC",
        detail=f"{montant_ttc} × {taux_rg:.0%} (CCP R2191-36 ; ≤ 5 %)",
    ))

    return Output(
        montant_ttc=montant_ttc,
        postes=postes,
        avertissements=avertissements,
    )
