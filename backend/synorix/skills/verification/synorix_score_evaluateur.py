"""Skill #70 — synorix-score-evaluateur.

Calcule le Synorix Score (/100) du mémoire technique, ventilé par axe, avec
justifications transparentes (grille 0-5 type commission). Reproductible.

Modèle : Opus 4.7 (synthèse à enjeu, cf. registry — différenciateur).
Source : NotebookLM N7 (Scoring) — grille 0-5, justifications par axe.
Raw extract: docs/notebook-extracts/skill-65-70-71-86-scoring-N7-raw.md
System prompt: prompts/synorix_score_evaluateur.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    memoire_text: str
    ponderations: dict = Field(default_factory=dict)  # axe -> pct (sortie #65 ou RC)


class AxeScore(BaseModel):
    nom: str
    note_sur_5: float
    ponderation_pct: float
    justification: str


class Output(SkillOutput):
    score_global: float
    axes: list[AxeScore]
    ponderations_explicites: bool = False
    sources_nbk: list[str]


@register
class SynorixScoreEvaluateur(Skill):
    name = "synorix-score-evaluateur"
    category = "verification"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/synorix_score_evaluateur.md"

    notebook_sources = ["N7"]
    pipeline_step = 5
    differentiateur = 5  # D5 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Pondérations (axe -> %)\n{json.dumps(inp.ponderations, ensure_ascii=False)}\n\n"
                f"## Mémoire technique à noter\n{inp.memoire_text}\n\n"
                "## Calcule le Synorix Score (JSON conforme au schéma Output)."
            ),
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)
