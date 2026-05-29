"""Tests for skill #29 expert-cvc."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.expert_metier.expert_cvc import ExpertCVC, Input, Output


@pytest.mark.asyncio
async def test_expert_cvc_basic_structure():
    """Output with ≥ 4 phases citing NF DTU 65.16 + NF DTU 68.3."""
    fake_response = {
        "methodologie": {
            "phases": [
                {
                    "nom": "Préparation & études",
                    "description": "Calcul déperditions, dimensionnement PAC 70 %.",
                    "normes_appliquees": ["NF DTU 65.16", "RE 2020"],
                    "valeurs_chiffrees": {"dimensionnement_PAC_pct_D": "70"},
                },
                {
                    "nom": "Approvisionnement",
                    "description": "PAC Inverter, conduits R ≥ 0,6.",
                    "normes_appliquees": ["NF DTU 65.16", "CPT 3615"],
                    "valeurs_chiffrees": {"isolation_R_min": "0,6"},
                },
                {
                    "nom": "Mise en œuvre",
                    "description": "Volume tampon, piquage 6 m / 3 coudes max.",
                    "normes_appliquees": ["NF DTU 65.16", "NF DTU 68.3"],
                    "valeurs_chiffrees": {"piquage_m_max": "6", "coudes_max": "3"},
                },
                {
                    "nom": "Contrôles & réception",
                    "description": "PV mise en service + acoustique 30 dB(A).",
                    "normes_appliquees": ["NF DTU 65.16", "F-Gaz 517/2014"],
                    "valeurs_chiffrees": {"acoustique_max_dBA": "30"},
                },
            ],
            "normes_citees": ["NF DTU 65.16", "NF DTU 68.3", "RE 2020", "F-Gaz 517/2014"],
            "phrases_types": ["..."] * 8,
            "controles_obligatoires": ["PV mise en service", "Étanchéité Classe A", "Acoustique 30 dB(A)"],
            "livrables_exiges": ["DOE", "PAQ", "Attestation F-Gaz", "AC Consuel"],
            "points_vigilance": ["Courts-cycles PAC", "Condensations gaines", "VMC EA 33 %"],
        },
        "sources_nbk": ["N4", "N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = ExpertCVC()
    output = await skill.run(
        Input(
            project_id=1,
            cctp_text="Installation PAC + VMC double flux école Reims.",
            contraintes_chantier=["site occupé", "exigence acoustique stricte"],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.methodologie.phases) >= 4
    assert "NF DTU 65.16" in output.methodologie.normes_citees
    assert "NF DTU 68.3" in output.methodologie.normes_citees
    assert "N4" in output.sources_nbk


def test_expert_cvc_metadata():
    """Correct Synorix v2.1 metadata."""
    assert ExpertCVC.name == "expert-cvc"
    assert ExpertCVC.category == "expert-metier"
    assert ExpertCVC.model == "claude-sonnet-4-6"
    assert ExpertCVC.notebook_sources == ["N4", "N3"]
    assert ExpertCVC.pipeline_step == 3
