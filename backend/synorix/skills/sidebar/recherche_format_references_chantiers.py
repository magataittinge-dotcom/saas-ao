"""Skill #77 — recherche-format-references-chantiers.

Définit le format optimal de stockage/affichage des références chantiers
(champs obligatoires/optionnels + métadonnées de réutilisation), compatible Cariso.

Modèle : Sonnet 4.6.
Source : NotebookLM N3 (réutilise #37/#43).
Raw extract: docs/notebook-extracts/skill-76-80-sidebar-raw.md
System prompt: prompts/recherche_format_references_chantiers.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class ChampReference(BaseModel):
    nom: str
    type: str


class Input(SkillInput):
    pass


class Output(SkillOutput):
    champs_obligatoires: list[ChampReference]
    champs_optionnels: list[ChampReference] = Field(default_factory=list)
    metadonnees_reutilisation: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheFormatReferencesChantiers(Skill):
    name = "recherche-format-references-chantiers"
    category = "sidebar"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_format_references_chantiers.md"

    notebook_sources = ["N3"]
    pipeline_step = "sidebar"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt="## Définis le format des références chantiers (JSON conforme au schéma Output).",
            schema=Output,
        )
        return Output.model_validate(raw)
