"""Skill #82 — recherche-mode-coaching-ao-btp.

Définit les patterns de coaching du Coach pour les AO BTP : ton par persona
(débutant/expert), moments d'intervention spontanée, règles de longueur/format.

Modèle : Sonnet 4.6.
Source : NotebookLM N8 (Coach).
Raw extract: docs/notebook-extracts/skill-81-84-chatbot-raw.md
System prompt: prompts/recherche_mode_coaching_ao_btp.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class PatternCoaching(BaseModel):
    persona: str
    ton: str
    exemples_intervention: list[str] = Field(default_factory=list)


class Input(SkillInput):
    pass


class Output(SkillOutput):
    patterns: list[PatternCoaching]
    moments_intervention: list[str] = Field(default_factory=list)
    regles_longueur_format: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheModeCoachingAoBtp(Skill):
    name = "recherche-mode-coaching-ao-btp"
    category = "chatbot"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_mode_coaching_ao_btp.md"

    notebook_sources = ["N8"]
    pipeline_step = "chatbot"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt="## Définis les patterns de coaching AO BTP (JSON conforme au schéma Output).",
            schema=Output,
        )
        return Output.model_validate(raw)
