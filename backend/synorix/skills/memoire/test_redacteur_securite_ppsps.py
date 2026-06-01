"""Tests for skill #46 redacteur-securite-ppsps."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_securite_ppsps import (
    RedacteurSecuritePpsps,
    Input,
    Output,
)


def _fake(with_ppsps: bool):
    resp = {
        "section_securite": {
            "titre": "Sécurité et protection de la santé",
            "analyse_risques": [
                {"tache": "Pose isolant en hauteur", "risque": "Chute", "prevention": "Échafaudage + filets", "epi": ["Harnais"]},
                {"tache": "Livraison matériaux", "risque": "Collision tiers", "prevention": "Balisage rigide", "epi": ["Gilet HV"]},
            ],
            "habilitations": ["CACES", "SST", "Montage échafaudage"],
            "coactivite_markdown": "Participation aux VIC avec le coordonnateur SPS...",
            "hygiene_secours_markdown": "Bases-vie, trousse de secours...",
            "longueur_estimee_mots": 600,
        },
        "ppsps": None,
        "champs_a_completer": [],
        "sources_nbk": ["N3"],
    }
    if with_ppsps:
        resp["ppsps"] = {
            "titre": "PPSPS — ébauche",
            "contenu_markdown": "Analyse clinique des risques...",
            "obligatoire_si": "chantier soumis à coordination SPS",
        }
    return resp


@pytest.mark.asyncio
async def test_securite_section_always_present():
    client_mock = AsyncMock()
    client_mock.complete.return_value = _fake(with_ppsps=False)

    skill = RedacteurSecuritePpsps()
    output = await skill.run(
        Input(project_id=1, contexte_chantier="site occupé", generer_ppsps=False),
        client=client_mock,
    )
    assert isinstance(output, Output)
    assert len(output.section_securite.analyse_risques) >= 2
    assert output.ppsps is None


@pytest.mark.asyncio
async def test_securite_ppsps_when_option_on():
    client_mock = AsyncMock()
    client_mock.complete.return_value = _fake(with_ppsps=True)

    skill = RedacteurSecuritePpsps()
    output = await skill.run(
        Input(project_id=1, contexte_chantier="co-activité", generer_ppsps=True),
        client=client_mock,
    )
    assert output.ppsps is not None
    assert "SPS" in output.ppsps.obligatoire_si


def test_securite_ppsps_metadata():
    assert RedacteurSecuritePpsps.name == "redacteur-securite-ppsps"
    assert RedacteurSecuritePpsps.category == "memoire"
    assert RedacteurSecuritePpsps.model == "claude-sonnet-4-6"
    assert RedacteurSecuritePpsps.notebook_sources == ["N3"]
    assert RedacteurSecuritePpsps.pipeline_step == 4
