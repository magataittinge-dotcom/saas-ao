"""Skill #79 — recherche-coffre-fort-pieces-administratives.

Établit la liste exhaustive (> 30) des catégories de documents du coffre-fort
administratif BTP : alias, validité, document d'origine, alternatives.

Modèle : Sonnet 4.6.
Source : NotebookLM N2 (Cerfa, DC/NOTI/EXE).
Raw extract: docs/notebook-extracts/skill-76-80-sidebar-raw.md
System prompt: prompts/recherche_coffre_fort_pieces_administratives.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class CategorieCoffre(BaseModel):
    nom: str
    famille: str
    alias: list[str] = Field(default_factory=list)
    validite: str
    document_origine: str = ""
    alternatives: list[str] = Field(default_factory=list)


class Input(SkillInput):
    pass


class Output(SkillOutput):
    categories: list[CategorieCoffre]
    nb_categories: int
    sources_nbk: list[str]


@register
class RechercheCoffreFortPiecesAdministratives(Skill):
    name = "recherche-coffre-fort-pieces-administratives"
    category = "sidebar"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_coffre_fort_pieces_administratives.md"

    notebook_sources = ["N2"]
    pipeline_step = "sidebar"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt="## Établis la liste des catégories du coffre-fort (> 30) (JSON conforme au schéma Output).",
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)
