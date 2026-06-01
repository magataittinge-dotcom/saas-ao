"""Skill #49 — redacteur-planning-gantt.

Rédige la section planning + une structure de Gantt prévisionnel (tâches, jalons,
marges intempéries) cohérente avec les délais imposés par le CCAP (piège
éliminatoire : un délai supérieur au CCTP rend l'offre irrégulière).

Modèle : Sonnet 4.6 (planification bornée, vérification de cohérence).
Source : NotebookLM N3 (Mémoires gagnants) — cohérence CCAP, marges, annotations RC.
Raw extract: docs/notebook-extracts/skill-49-redacteur-planning-gantt-raw.md
System prompt: prompts/redacteur_planning_gantt.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    delai_ccap: str | None = None  # délai global imposé (ex: "4 mois")
    phases_execution: list[str] = Field(default_factory=list)  # issues de skill #45
    contraintes_rc: list[str] = Field(default_factory=list)  # ex: site scolaire occupé
    generer_gantt: bool = True


class TacheGantt(BaseModel):
    nom: str
    debut_semaine: int
    duree_semaines: int
    jalon: bool = False
    annotation: str = ""


class Gantt(BaseModel):
    taches: list[TacheGantt]
    marges_intemperies_semaines: int


class SectionPlanning(BaseModel):
    titre: str
    introduction_markdown: str
    delai_global: str
    longueur_estimee_mots: int


class CoherenceCCAP(BaseModel):
    duree_totale_semaines: int
    delai_ccap_respecte: bool


class Output(SkillOutput):
    section: SectionPlanning
    gantt: Gantt | None = None
    coherence_ccap: CoherenceCCAP
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurPlanningGantt(Skill):
    name = "redacteur-planning-gantt"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/redacteur_planning_gantt.md"

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

## Phases d'exécution (skill #45)
{phases}

## Contraintes du RC à matérialiser dans le planning
{contraintes}

## Gantt : {"à générer" if inp.generer_gantt else "non demandé — gantt = null"}

## Rédige la section planning (JSON conforme au schéma Output).
Vérifie la cohérence stricte avec le délai CCAP. Marges intempéries visibles.
"""
