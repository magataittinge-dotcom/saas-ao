"""Skill #75 — recherche-suivi-post-depot.

Définit le scénario de suivi post-dépôt : J+1 confirmation, J+30 relance amicale,
gestion du résultat (perdu → demander le RAO ; gagné → standstill 11 j), J+90 archivage.

Modèle : Sonnet 4.6.
Source : NotebookLM N8 (Coach).
Raw extract: docs/notebook-extracts/skill-72-73-74-75-export-raw.md
System prompt: prompts/recherche_suivi_post_depot.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    date_depot: str = ""
    resultat: str | None = None  # "gagne" | "perdu" | None


class EtapeSuivi(BaseModel):
    jalon: str  # J+1 | J+30 | J+90 | resultat
    action: str
    ton: str = ""


class Output(SkillOutput):
    etapes_suivi: list[EtapeSuivi]
    scenario_perdu: list[str] = Field(default_factory=list)
    scenario_gagne: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheSuiviPostDepot(Skill):
    name = "recherche-suivi-post-depot"
    category = "export"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_suivi_post_depot.md"

    notebook_sources = ["N8"]
    pipeline_step = 6
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Date de dépôt : {inp.date_depot or '(non précisée)'}\n"
                f"## Résultat connu : {inp.resultat or '(en attente)'}\n\n"
                "## Définis le scénario de suivi post-dépôt (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
