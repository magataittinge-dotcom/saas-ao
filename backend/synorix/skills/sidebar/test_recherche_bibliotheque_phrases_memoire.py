"""Tests for skill #78 recherche-bibliotheque-phrases-memoire."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.sidebar.recherche_bibliotheque_phrases_memoire import (
    RechercheBibliothequePhrasesMemoire,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_taxonomie_bibliotheque():
    fake = {
        "axes_classement": [
            {"nom": "section", "valeurs": ["méthodologie", "sécurité", "environnement"]},
            {"nom": "corps_de_metier", "valeurs": ["Façade/ITE", "Gros Œuvre"]},
        ],
        "granularite": "paragraphe-thematique",
        "metadonnees": ["section", "corps_de_metier", "tags", "reutilisable"],
        "sources_nbk": ["N3"],
    }
    client_mock = AsyncMock()
    client_mock.complete.return_value = fake

    skill = RechercheBibliothequePhrasesMemoire()
    output = await skill.run(Input(project_id=1), client=client_mock)

    assert isinstance(output, Output)
    noms = [a.nom for a in output.axes_classement]
    assert "section" in noms and "corps_de_metier" in noms
    assert output.granularite == "paragraphe-thematique"


def test_taxonomie_metadata():
    assert RechercheBibliothequePhrasesMemoire.name == "recherche-bibliotheque-phrases-memoire"
    assert RechercheBibliothequePhrasesMemoire.category == "sidebar"
    assert RechercheBibliothequePhrasesMemoire.model == "claude-sonnet-4-6"
