"""Skill #51 — generateur-planning-gantt-option.

Variante de #49 : génère un Gantt prévisionnel EN ANNEXE quand la section
planning n'est pas demandée dans le corps du mémoire. Mêmes garde-fous de
cohérence CCAP (piège éliminatoire) que #49.

Modèle : Sonnet 4.6.
Source : NotebookLM N3 (Mémoires gagnants) — cohérence CCAP, format annexe.
Raw extract: docs/notebook-extracts/skill-51-53-54-55-variants-raw.md (+ skill-49-...-raw.md)
System prompt: prompts/generateur_planning_gantt_option.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    delai_ccap: str | None = None
    phases_execution: list[str] = Field(default_factory=list)
    contraintes_rc: list[str] = Field(default_factory=list)


class Annexe(BaseModel):
    titre: str
    chapeau_markdown: str
    legende: list[str] = Field(default_factory=list)


class TacheGantt(BaseModel):
    nom: str
    debut_semaine: int
    duree_semaines: int
    jalon: bool = False
    annotation: str = ""


class Gantt(BaseModel):
    taches: list[TacheGantt]
    marges_intemperies_semaines: int


class CoherenceCCAP(BaseModel):
    duree_totale_semaines: int
    delai_ccap_respecte: bool


class Output(SkillOutput):
    annexe: Annexe
    gantt: Gantt
    coherence_ccap: CoherenceCCAP
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class GenerateurPlanningGanttOption(Skill):
    name = "generateur-planning-gantt-option"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/generateur_planning_gantt_option.md"

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
        phases = "\n".join(f"- {p}" for p in inp.phases_execution) or "(à déduire)"
        contraintes = "\n".join(f"- {c}" for c in inp.contraintes_rc) or "(aucune)"
        return f"""## Délai global imposé (CCAP)
{inp.delai_ccap or "[À COMPLÉTER — délai CCAP]"}

## Phases d'exécution
{phases}

## Contraintes RC
{contraintes}

## Génère le Gantt en annexe (JSON conforme au schéma Output).
Cohérence stricte CCAP. Marges intempéries visibles.
"""
