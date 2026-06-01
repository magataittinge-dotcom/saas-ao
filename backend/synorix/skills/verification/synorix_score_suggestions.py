"""Skill #71 — synorix-score-suggestions.

Pour chaque axe noté sous un seuil, produit 1 à 3 suggestions d'amélioration
positives et actionnables (jamais vagues, jamais anxiogènes).

Modèle : Opus 4.7 (cf. registry).
Source : NotebookLM N7 (Scoring) — formulations actionnables.
Raw extract: docs/notebook-extracts/skill-65-70-71-86-scoring-N7-raw.md
System prompt: prompts/synorix_score_suggestions.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    axes_notes: list[dict] = Field(default_factory=list)  # sortie #70 (nom, note_sur_5, justification)
    seuil_sur_5: float = 4.0


class SuggestionAxe(BaseModel):
    axe: str
    note_sur_5: float
    suggestions: list[str]


class Output(SkillOutput):
    suggestions_par_axe: list[SuggestionAxe]
    ton: str = "positif"
    sources_nbk: list[str]


@register
class SynorixScoreSuggestions(Skill):
    name = "synorix-score-suggestions"
    category = "verification"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/synorix_score_suggestions.md"

    notebook_sources = ["N7"]
    pipeline_step = 5
    differentiateur = 4  # D4 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Seuil (sur 5) : {inp.seuil_sur_5}\n\n"
                f"## Axes notés (sortie #70)\n{json.dumps(inp.axes_notes, ensure_ascii=False, indent=2)}\n\n"
                "## Produis les suggestions pour les axes sous le seuil (JSON conforme au schéma Output)."
            ),
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)
