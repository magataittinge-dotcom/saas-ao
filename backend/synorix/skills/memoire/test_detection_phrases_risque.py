"""Tests for skill #60 detection-phrases-risque."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.detection_phrases_risque import (
    DetectionPhrasesRisque,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_detection_phrases_risque_structure():
    fake_response = {
        "phrases_risque": [
            {
                "extrait": "Nous remplacerons l'isolant X par l'isolant Y plus performant.",
                "categorie": "contradiction-cctp",
                "niveau": "élevé",
                "risque": "Variante déguisée → offre irrégulière éliminée",
                "alternative_prudente": "Offre de base conforme à l'article 3.1 + variante séparée si le RC l'autorise",
            },
            {
                "extrait": "Voir notre vidéo via ce lien.",
                "categorie": "renvoi-externe",
                "niveau": "moyen",
                "risque": "Contenu externe non noté / hors CRT",
                "alternative_prudente": "Détailler la méthodologie dans le corps du mémoire",
            },
        ],
        "nb_detecte": 2,
        "sources_nbk": ["N6"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = DetectionPhrasesRisque()
    output = await skill.run(
        Input(project_id=1, memoire_text="...", cctp_text="isolant X"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.nb_detecte == len(output.phrases_risque)
    assert all(p.alternative_prudente for p in output.phrases_risque)
    assert output.sources_nbk == ["N6"]


def test_detection_phrases_risque_metadata():
    assert DetectionPhrasesRisque.name == "detection-phrases-risque"
    assert DetectionPhrasesRisque.category == "memoire"
    assert DetectionPhrasesRisque.model == "claude-sonnet-4-6"
    assert DetectionPhrasesRisque.notebook_sources == ["N6"]
    assert DetectionPhrasesRisque.pipeline_step == 4
