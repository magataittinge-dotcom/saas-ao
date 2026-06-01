"""Tests for skill #57 generateur-note-rse."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.generateur_note_rse import GenerateurNoteRse, Input, Output


@pytest.mark.asyncio
async def test_note_rse_structure():
    """Returns the 3 RSE volets and KPIs each backed by a proof field."""
    fake_response = {
        "note_rse": {
            "titre": "Note RSE",
            "volet_social_markdown": "Engagement 200 h d'insertion via GEIQ...",
            "volet_environnemental_markdown": "Tri 5 flux, ISO 14001...",
            "volet_economique_markdown": "Fournisseurs locaux dans un rayon de 50 km...",
            "kpis": [
                {"libelle": "Heures d'insertion", "valeur": "200 h", "preuve": "Convention GEIQ [À COMPLÉTER PAR L'ENTREPRISE]"},
                {"libelle": "Certification environnement", "valeur": "ISO 14001", "preuve": "Certificat n° [À COMPLÉTER PAR L'ENTREPRISE]"},
            ],
            "longueur_estimee_mots": 650,
        },
        "champs_a_completer": ["Numéros de certification, convention GEIQ"],
        "sources_nbk": ["N3"],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = GenerateurNoteRse()
    output = await skill.run(
        Input(project_id=1, clause_sociale="200 heures d'insertion"),
        client=client_mock,
    )

    assert isinstance(output, Output)
    assert output.note_rse.volet_social_markdown
    assert output.note_rse.volet_environnemental_markdown
    assert output.note_rse.volet_economique_markdown
    # chaque KPI porte une preuve (anti-greenwashing)
    assert all(k.preuve for k in output.note_rse.kpis)


def test_note_rse_metadata():
    assert GenerateurNoteRse.name == "generateur-note-rse"
    assert GenerateurNoteRse.category == "memoire"
    assert GenerateurNoteRse.model == "claude-sonnet-4-6"
    assert GenerateurNoteRse.notebook_sources == ["N3"]
    assert GenerateurNoteRse.pipeline_step == 4
