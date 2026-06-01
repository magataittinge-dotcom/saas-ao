"""Tests for skill #43 redacteur-references-chantiers."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_references_chantiers import (
    RedacteurReferencesChantiers,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_redacteur_references_chantiers_structure():
    """Returns a 7-column table with at most 5 rows."""
    fake_response = {
        "section": {
            "titre": "Nos références chantiers",
            "introduction_markdown": "Références sélectionnées pour leur similarité...",
            "tableau": {
                "colonnes": ["Année", "Intitulé", "Adresse", "MOA", "MOE", "Lot", "Montant HT"],
                "lignes": [
                    ["2024", "ITE école Reims", "Reims", "Ville de Reims", "[À COMPLÉTER]", "ITE", "880 000 € HT"],
                ],
            },
            "details_references": [
                {
                    "intitule": "ITE école Reims",
                    "contraintes_surmontees": "Site occupé, 300 élèves",
                    "respect_delais": "Livré dans les délais",
                    "contact_moa": "[À COMPLÉTER]",
                    "emplacements_photos": ["Avant/après façade nord"],
                }
            ],
            "longueur_estimee_mots": 320,
        },
        "champs_a_completer": ["[À COMPLÉTER] : MOE et contact MOA réf. Reims"],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RedacteurReferencesChantiers()
    output = await skill.run(
        Input(project_id=1, references_selectionnees=[{"ref_id": "R1"}]),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.section.tableau.colonnes == [
        "Année", "Intitulé", "Adresse", "MOA", "MOE", "Lot", "Montant HT"
    ]
    assert len(output.section.tableau.lignes) <= 5
    assert output.sources_nbk == ["N3"]


def test_redacteur_references_chantiers_metadata():
    assert RedacteurReferencesChantiers.name == "redacteur-references-chantiers"
    assert RedacteurReferencesChantiers.category == "memoire"
    assert RedacteurReferencesChantiers.model == "claude-sonnet-4-6"
    assert RedacteurReferencesChantiers.notebook_sources == ["N3"]
    assert RedacteurReferencesChantiers.pipeline_step == 4
