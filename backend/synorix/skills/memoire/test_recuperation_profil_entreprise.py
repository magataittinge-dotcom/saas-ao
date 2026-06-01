"""Tests for skill #36 recuperation-profil-entreprise."""

import pytest
from unittest.mock import AsyncMock

from synorix.skills.memoire.recuperation_profil_entreprise import (
    RecuperationProfilEntreprise,
    Input,
    Output,
)


@pytest.mark.asyncio
async def test_recuperation_profil_structure():
    """Returns a canonical CompanyProfile in the correct rubric order, with
    missing fields flagged and never invented."""
    fake_response = {
        "profil": {
            "identite": {
                "raison_sociale": "Cariso Façade SARL",
                "forme_juridique": "SARL",
                "siret": "12345678900012",
                "dirigeant": "[À COMPLÉTER PAR L'ENTREPRISE]",
                "coordonnees": "[À COMPLÉTER PAR L'ENTREPRISE]",
                "implantation": "Reims (51)",
            },
            "chiffres_cles": {
                "ca_n1": "2 340 000 €",
                "ca_n2": "[À COMPLÉTER PAR L'ENTREPRISE]",
                "ca_n3": "[À COMPLÉTER PAR L'ENTREPRISE]",
                "effectif_global": "24",
                "chantiers_par_an": "[À COMPLÉTER PAR L'ENTREPRISE]",
            },
            "activites": {
                "specialisations": ["ITE", "Façade"],
                "histoire_valeurs": "[À COMPLÉTER PAR L'ENTREPRISE]",
            },
            "organigramme": "[À COMPLÉTER PAR L'ENTREPRISE]",
            "certifications": [
                {"libelle": "Qualibat RGE ITE", "numero": "8632", "validite": "2027-03-31"}
            ],
            "assurances": [
                {"type": "Garantie décennale", "reference": "POL-998", "validite": "2026-12-31"}
            ],
            "references_disponibles": "5 chantiers ITE 2023-2025",
        },
        "champs_manquants": [
            "dirigeant",
            "coordonnees",
            "ca_n2",
            "ca_n3",
            "chantiers_par_an",
            "histoire_valeurs",
            "organigramme",
        ],
        "ordre_rubriques": [
            "identite",
            "chiffres_cles",
            "activites",
            "organigramme",
            "certifications",
            "assurances",
            "references_disponibles",
        ],
    }

    client_mock = AsyncMock()
    client_mock.complete.return_value = fake_response

    skill = RecuperationProfilEntreprise()
    output = await skill.run(
        Input(project_id=1, user_id=7, raw_company_data={"siret": "12345678900012"}),
        client=client_mock,
    )

    assert isinstance(output, Output)
    # Ordre canonique respecté
    assert output.ordre_rubriques[0] == "identite"
    assert output.ordre_rubriques[-1] == "references_disponibles"
    # Champs manquants marqués, jamais inventés
    assert "dirigeant" in output.champs_manquants
    assert output.profil.identite.dirigeant == "[À COMPLÉTER PAR L'ENTREPRISE]"
    # Chiffres fournis conservés verbatim
    assert output.profil.chiffres_cles.ca_n1 == "2 340 000 €"


def test_recuperation_profil_metadata():
    assert RecuperationProfilEntreprise.name == "recuperation-profil-entreprise"
    assert RecuperationProfilEntreprise.category == "memoire"
    assert RecuperationProfilEntreprise.model == "claude-haiku-4-5"
    assert RecuperationProfilEntreprise.notebook_sources == ["N3"]
    assert RecuperationProfilEntreprise.pipeline_step == 4
