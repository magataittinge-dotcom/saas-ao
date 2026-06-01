"""Skill #78 — recherche-bibliotheque-phrases-memoire.

Définit la taxonomie de la bibliothèque mémoire : axes (section × corps de
métier), granularité (paragraphe thématique), métadonnées de réutilisation.

Modèle : Sonnet 4.6.
Source : NotebookLM N3 (réutilise #38).
Raw extract: docs/notebook-extracts/skill-76-80-sidebar-raw.md
System prompt: prompts/recherche_bibliotheque_phrases_memoire.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class AxeClassement(BaseModel):
    nom: str
    valeurs: list[str]


class Input(SkillInput):
    pass


class Output(SkillOutput):
    axes_classement: list[AxeClassement]
    granularite: str = "paragraphe-thematique"
    metadonnees: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheBibliothequePhrasesMemoire(Skill):
    name = "recherche-bibliotheque-phrases-memoire"
    category = "sidebar"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_bibliotheque_phrases_memoire.md"

    notebook_sources = ["N3"]
    pipeline_step = "sidebar"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt="## Définis la taxonomie de la bibliothèque mémoire (JSON conforme au schéma Output).",
            schema=Output,
        )
        return Output.model_validate(raw)
