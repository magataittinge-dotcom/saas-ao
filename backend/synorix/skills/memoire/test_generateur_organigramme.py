"""Tests for skill #50 generateur-organigramme."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_organigramme import (
    GenerateurOrganigramme,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_generateur_organigramme_structure():
    """Returns an org chart with at most 3 levels and an SVG document."""
    fake_response = {
        "organigramme": {
            "niveaux": [
                {"niveau": 1, "cases": [{"role": "Conducteur de travaux", "nom": "[À COMPLÉTER PAR L'ENTREPRISE]", "coordonnees": "[À COMPLÉTER PAR L'ENTREPRISE]", "taux_affectation": "50%", "habilitations": []}]},
                {"niveau": 2, "cases": [{"role": "Chef de chantier", "nom": "[À COMPLÉTER PAR L'ENTREPRISE]", "coordonnees": "", "taux_affectation": "100%", "habilitations": ["Échafaudage"]}]},
                {"niveau": 3, "cases": [{"role": "Compagnon ITE", "nom": "", "coordonnees": "", "taux_affectation": "100%", "habilitations": []}]},
            ],
            "svg": "<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>",
        },
        "emplacements_photos": ["Équipe en situation avec EPI"],
        "champs_a_completer": ["[À COMPLÉTER PAR L'ENTREPRISE] : noms"],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = GenerateurOrganigramme()
    output = await skill.run(
        Input(project_id=1, equipe_affectee=[{"role": "Chef de chantier"}]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.organigramme.niveaux) <= 3
    assert output.organigramme.svg.startswith("<svg")
    assert output.sources_nbk == ["N3"]


def test_generateur_organigramme_metadata():
    assert GenerateurOrganigramme.name == "generateur-organigramme"
    assert GenerateurOrganigramme.category == "memoire"
    assert GenerateurOrganigramme.model == "claude-sonnet-4-6"
    assert GenerateurOrganigramme.notebook_sources == ["N3"]
    assert GenerateurOrganigramme.pipeline_step == 4
