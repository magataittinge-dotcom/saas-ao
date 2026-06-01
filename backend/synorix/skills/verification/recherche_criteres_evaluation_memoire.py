"""Skill #65 — recherche-criteres-evaluation-memoire.

Restitue les axes/sous-critères des commissions d'évaluation, pondérations
indicatives et échelle de notation 0-5, pour construire le Synorix Score.

Modèle : Sonnet 4.6.
Source : NotebookLM N7 (Scoring) — triptyque, sous-critères, échelle 0-5.
Raw extract: docs/notebook-extracts/skill-65-70-71-86-scoring-N7-raw.md
System prompt: prompts/recherche_criteres_evaluation_memoire.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    type_marche: str = ""  # ex: travaux, MAPA...
    rc_text: str = ""  # si fourni, pour pondérations réelles


class Axe(BaseModel):
    nom: str
    ponderation_indicative_pct: int
    sous_criteres: list[str] = Field(default_factory=list)


class Output(SkillOutput):
    axes: list[Axe]
    echelle_notation: list[str]
    ponderations_explicites: bool = False
    sources_nbk: list[str]


@register
class RechercheCriteresEvaluationMemoire(Skill):
    name = "recherche-criteres-evaluation-memoire"
    category = "verification"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_criteres_evaluation_memoire.md"

    notebook_sources = ["N7"]
    pipeline_step = 5
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Type de marché : {inp.type_marche or '(non précisé)'}\n\n"
                f"## RC fourni (pondérations réelles si présent)\n{inp.rc_text or '(non fourni)'}\n\n"
                "## Restitue les critères d'évaluation (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
