"""Tests for skill #53 generateur-ppsps."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_ppsps import GenerateurPpsps, Input, Output


@pytest.mark.asyncio
async def test_generateur_ppsps_structure():
    fake_response = {
        "ppsps": {
            "titre": "PPSPS — École Reims",
            "renseignements_administratifs": "Entreprise [À COMPLÉTER PAR L'ENTREPRISE]...",
            "analyse_risques": [
                {"tache": "Pose isolant", "risque": "Chute hauteur", "prevention": "Échafaudage filets", "equipements": ["Harnais"]},
                {"tache": "Manutention", "risque": "TMS", "prevention": "Aide mécanique", "equipements": []},
                {"tache": "Livraison", "risque": "Collision tiers", "prevention": "Balisage", "equipements": ["Gilet HV"]},
            ],
            "organisation_secours_markdown": "Numéros d'urgence affichés...",
            "hygiene_bases_vie_markdown": "Sanitaires, vestiaires...",
            "coactivite_markdown": "Coordination SPS, VIC...",
            "obligatoire_si": "chantier soumis à coordination SPS",
            "longueur_estimee_mots": 1500,
        },
        "champs_a_completer": ["[À COMPLÉTER — Code du travail R.4532 à vérifier]"],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = GenerateurPpsps()
    output = await skill.run(
        Input(project_id=1, contexte_chantier="co-activité école"), client=client_mock
    )

    assert isinstance(output, Output)
    assert len(output.ppsps.analyse_risques) >= 3
    assert "SPS" in output.ppsps.obligatoire_si


def test_generateur_ppsps_metadata():
    assert GenerateurPpsps.name == "generateur-ppsps"
    assert GenerateurPpsps.category == "memoire"
    assert GenerateurPpsps.model == "claude-sonnet-4-6"
    assert GenerateurPpsps.notebook_sources == ["N3"]
    assert GenerateurPpsps.pipeline_step == 4
