"""Tests du calculateur autonome retenue de garantie (déterministe, 0 LLM).

Adapté de l'ancien test skill #24 — mêmes entrées → mêmes sorties, sans Skill/client.
"""

from services.calculators.retenue_garantie import Input, Output, compute


def test_computes_rg_and_caution_on_ttc():
    """RG = TTC × 5 % ; calcul déterministe pur."""
    output = compute(Input(montant_ht=100000.0, tva=0.20, taux_rg=0.05))

    assert isinstance(output, Output)
    assert output.montant_ttc == 120000.0
    rg = next(p for p in output.postes if p.poste == "Retenue de garantie")
    assert rg.montant == 6000.0  # 120000 × 5%
    assert rg.base == "TTC"


def test_penalites_plafonnees_et_seuil():
    output = compute(Input(
        montant_ht=100000.0,
        jours_retard_execution=500,
        penalite_diviseur=1000,
    ))
    pen = next(p for p in output.postes if p.poste == "Pénalités de retard")
    # 100000 × 500 / 1000 = 50000 > plafond 10% HT = 10000 → plafonné
    assert pen.montant == 10000.0
    assert any("plafonn" in a.lower() for a in output.avertissements)


def test_taux_rg_plafonne():
    output = compute(Input(montant_ht=100000.0, taux_rg=0.10))
    rg = next(p for p in output.postes if p.poste == "Retenue de garantie")
    assert rg.montant == 6000.0  # plafonné à 5% → 120000 × 5%
    assert any("plafonné à 5" in a for a in output.avertissements)
