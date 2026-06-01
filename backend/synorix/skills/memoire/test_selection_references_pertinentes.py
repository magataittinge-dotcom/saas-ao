"""Tests for skill #37 selection-references-pertinentes."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.selection_references_pertinentes import (
    SelectionReferencesPertinentes,
    Input,
    ProfilAO,
    Output,
)


@pytest.mark.asyncio
async def test_selection_references_structure():
    """Returns 3-5 ranked references with internal pertinence scores, never
    exceeding the volumetric cap of 5."""
    fake_response = {
        "references_selectionnees": [
            {
                "ref_id": "R1",
                "intitule": "ITE école Reims",
                "score_pertinence": 92,
                "justification": "Même métier ITE + site occupé comme l'AO",
                "criteres_forts": ["nature", "montant", "moa"],
            },
            {
                "ref_id": "R2",
                "intitule": "ITE collège Châlons",
                "score_pertinence": 81,
                "justification": "MOA collectivité, montant comparable",
                "criteres_forts": ["nature", "moa"],
            },
            {
                "ref_id": "R3",
                "intitule": "Façade bailleur social Épernay",
                "score_pertinence": 70,
                "justification": "Corps de métier proche, MOA bailleur",
                "criteres_forts": ["nature"],
            },
        ],
        "volumetrie_retenue": 3,
        "avertissements": [],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = SelectionReferencesPertinentes()
    output = await skill.run(
        Input(
            project_id=1,
            profil_ao=ProfilAO(
                corps_de_metier="ITE",
                montant_estime="900 000 € HT",
                type_moa="collectivité",
                contraintes=["site occupé"],
            ),
            references=[{"ref_id": "R1"}, {"ref_id": "R2"}, {"ref_id": "R3"}],
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert 1 <= output.volumetrie_retenue <= 5
    assert len(output.references_selectionnees) <= 5
    # Classé par score décroissant
    scores = [r.score_pertinence for r in output.references_selectionnees]
    assert scores == sorted(scores, reverse=True)


def test_selection_references_metadata():
    assert SelectionReferencesPertinentes.name == "selection-references-pertinentes"
    assert SelectionReferencesPertinentes.category == "memoire"
    assert SelectionReferencesPertinentes.model == "claude-sonnet-4-6"
    assert SelectionReferencesPertinentes.notebook_sources == ["N3"]
    assert SelectionReferencesPertinentes.pipeline_step == 4
