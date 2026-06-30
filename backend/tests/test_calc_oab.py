"""Tests du calculateur autonome OAB (déterministe, 0 LLM).

Adapté de l'ancien test skill #95 — mêmes entrées → mêmes sorties, sans Skill/client.
"""

from services.calculators.oab import Input, Output, compute


def test_oab_double_moyenne():
    """M1 exclut >1.2*M1, M2 recalculé, candidat bas → OAB ; calcul pur."""
    # offres: 100, 105, 110, 300(aberrante haute), candidat 70
    output = compute(Input(prix_candidat=70.0, prix_offres=[70, 100, 105, 110, 300]))

    assert isinstance(output, Output)
    # M1 = (70+100+105+110+300)/5 = 137; 1.2*M1=164.4 -> 300 exclue
    assert output.m1 == 137.0
    # M2 = (70+100+105+110)/4 = 96.25 ; seuil = 0.9*96.25 = 86.625
    assert output.m2 == 96.25
    assert output.seuil_oab_euros == 86.62 or output.seuil_oab_euros == 86.63
    assert output.est_oab is True
    assert output.gauge == "rouge"
    assert "Verchéenne" in output.rappel_juridique


def test_oab_safe_offer_vert():
    output = compute(Input(prix_candidat=105.0, prix_offres=[100, 105, 110]))
    assert output.est_oab is False
    assert output.gauge == "vert"
