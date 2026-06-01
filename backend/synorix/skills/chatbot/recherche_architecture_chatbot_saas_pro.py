"""Skill #81 — recherche-architecture-chatbot-saas-pro.

Définit l'architecture conversationnelle du Coach : surfaces (bulle + page),
modes, contexte multi-AO, mémoire long terme, streaming.

Modèle : Sonnet 4.6.
Source : best practices SaaS B2B (skill technique).
Raw extract: docs/notebook-extracts/skill-81-84-chatbot-raw.md
System prompt: prompts/recherche_architecture_chatbot_saas_pro.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Contexte(BaseModel):
    multi_projet: bool = True
    memoire_long_terme: bool = True
    streaming: bool = True


class Input(SkillInput):
    pass


class Output(SkillOutput):
    surfaces: list[str]
    modes: list[str] = Field(default_factory=list)
    contexte: Contexte
    principes: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheArchitectureChatbotSaasPro(Skill):
    name = "recherche-architecture-chatbot-saas-pro"
    category = "chatbot"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_architecture_chatbot_saas_pro.md"

    notebook_sources = []
    pipeline_step = "chatbot"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt="## Définis l'architecture conversationnelle du Coach (JSON conforme au schéma Output).",
            schema=Output,
        )
        return Output.model_validate(raw)
