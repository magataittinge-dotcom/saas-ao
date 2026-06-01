"""Skill #83 — recherche-suggestions-strategiques-ao.

Le Coach propose des suggestions stratégiques (choix de lot, références, prix,
plus-values RSE), concrètes et chiffrées, jamais bateau.

Modèle : Opus 4.7 (cf. registry — suggestions à enjeu).
Source : NotebookLM N8 (Coach).
Raw extract: docs/notebook-extracts/skill-81-84-chatbot-raw.md
System prompt: prompts/recherche_suggestions_strategiques_ao.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    contexte_ao: dict = Field(default_factory=dict)  # lot, montant, criteres, étape
    profil_entreprise: dict = Field(default_factory=dict)


class SuggestionStrategique(BaseModel):
    levier: str  # lot | references | prix | plus-values
    suggestion: str
    benefice: str


class Output(SkillOutput):
    suggestions: list[SuggestionStrategique]
    sources_nbk: list[str]


@register
class RechercheSuggestionsStrategiquesAo(Skill):
    name = "recherche-suggestions-strategiques-ao"
    category = "chatbot"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/recherche_suggestions_strategiques_ao.md"

    notebook_sources = ["N8"]
    pipeline_step = "chatbot"
    differentiateur = 14  # D14 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Contexte AO\n{json.dumps(inp.contexte_ao, ensure_ascii=False, indent=2)}\n\n"
                f"## Profil entreprise\n{json.dumps(inp.profil_entreprise, ensure_ascii=False, indent=2)}\n\n"
                "## Propose des suggestions stratégiques (JSON conforme au schéma Output). Jamais générique."
            ),
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)
