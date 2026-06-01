"""Skill #61 — suggestion-plus-values.

Suggère des plus-values peu coûteuses qui font monter la note (70→85) :
engagement de délai, certification additionnelle, innovation marginale, services,
selon la logique « Caractéristique technique = Bénéfice Client ». Non gadget.

Modèle : Sonnet 4.6 (suggestions ciblées).
Source : NotebookLM N3 (Mémoires gagnants) — plus-values par corps de métier.
Raw extract: docs/notebook-extracts/skill-61-suggestion-plus-values-raw.md
System prompt: prompts/suggestion_plus_values.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    corps_de_metier: str
    contexte_chantier: str = ""
    criteres_jugement: list[str] = Field(default_factory=list)  # sur quoi maximiser


class PlusValue(BaseModel):
    intitule: str
    benefice_client: str
    cout_estime: str
    impact_note: str
    corps_de_metier: str


class Output(SkillOutput):
    plus_values: list[PlusValue]
    gadgets_ecartes: list[str] = Field(default_factory=list)
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class SuggestionPlusValues(Skill):
    name = "suggestion-plus-values"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/suggestion_plus_values.md"

    notebook_sources = ["N3"]
    pipeline_step = 4
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        criteres = "\n".join(f"- {c}" for c in inp.criteres_jugement) or "(non précisés)"
        return f"""## Corps de métier : {inp.corps_de_metier}

## Contexte chantier
{inp.contexte_chantier or "(non précisé)"}

## Critères de jugement à maximiser
{criteres}

## Suggère des plus-values (JSON conforme au schéma Output).
Peu coûteuses, réalistes, ciblées sur le métier. Écarte les gadgets.
"""
