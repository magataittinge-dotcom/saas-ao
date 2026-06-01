"""Tests for skill #41 redacteur-presentation-entreprise."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.redacteur_presentation_entreprise import (
    RedacteurPresentationEntreprise,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_redacteur_presentation_entreprise_structure():
    """Returns PARTIE A with one subsection per canonical rubric."""
    fake_response = {
        "section": {
            "titre": "PARTIE A — Présentation de l'entreprise",
            "sous_sections": [
                {"titre": "Identité", "contenu_markdown": "Cariso Façade SARL, SIRET..."},
                {"titre": "Chiffres clés", "contenu_markdown": "CA 2025 : 2 340 000 €..."},
                {"titre": "Activités et valeurs", "contenu_markdown": "Spécialiste ITE..."},
                {"titre": "Certifications", "contenu_markdown": "Qualibat RGE ITE n°8632..."},
                {"titre": "Assurances", "contenu_markdown": "Garantie décennale..."},
            ],
            "longueur_estimee_mots": 1200,
        },
        "champs_a_completer": ["[À COMPLÉTER PAR L'ENTREPRISE] : organigramme"],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RedacteurPresentationEntreprise()
    output = await skill.run(
        Input(project_id=1, profil_entreprise={"raison_sociale": "Cariso Façade"}),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert len(output.section.sous_sections) >= 4
    titres = [s.titre.lower() for s in output.section.sous_sections]
    assert any("certif" in t for t in titres)
    assert output.sources_nbk == ["N3"]


def test_redacteur_presentation_entreprise_metadata():
    assert RedacteurPresentationEntreprise.name == "redacteur-presentation-entreprise"
    assert RedacteurPresentationEntreprise.category == "memoire"
    assert RedacteurPresentationEntreprise.model == "claude-opus-4-7"
    assert RedacteurPresentationEntreprise.notebook_sources == ["N3"]
    assert RedacteurPresentationEntreprise.pipeline_step == 4
