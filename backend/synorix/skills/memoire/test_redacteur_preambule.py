"""Tests for skill #40 redacteur-preambule."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_preambule import (
    RedacteurPreambule,
    Input,
    DonneesAO,
    Output,
)


@pytest.mark.asyncio
async def test_redacteur_preambule_structure():
    """Returns a Markdown preamble section adapted to the project, with
    [À COMPLÉTER] markers tracked."""
    fake_response = {
        "section": {
            "titre": "Préambule",
            "contenu_markdown": (
                "Dans le cadre de la rénovation thermique de l'école Jean Jaurès "
                "à Reims, maître d'ouvrage Ville de Reims, lot ITE, nous avons "
                "identifié que votre enjeu majeur réside dans le maintien de "
                "l'activité scolaire..."
            ),
            "longueur_estimee_mots": 440,
        },
        "champs_a_completer": [
            "[À COMPLÉTER — donnée DCE] : date de visite de site non fournie"
        ],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RedacteurPreambule()
    output = await skill.run(
        Input(
            project_id=1,
            profil_entreprise={"raison_sociale": "Cariso Façade"},
            donnees_ao=DonneesAO(
                nom_chantier="École Jean Jaurès Reims",
                moa="Ville de Reims",
                lot="ITE",
                enjeux_identifies=["maintien activité scolaire"],
            ),
        ),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.section.titre == "Préambule"
    assert "Reims" in output.section.contenu_markdown
    assert output.sources_nbk == ["N3"]


def test_redacteur_preambule_metadata():
    assert RedacteurPreambule.name == "redacteur-preambule"
    assert RedacteurPreambule.category == "memoire"
    assert RedacteurPreambule.model == "claude-opus-4-7"
    assert RedacteurPreambule.notebook_sources == ["N3"]
    assert RedacteurPreambule.pipeline_step == 4
