"""Skill #84 — recherche-suivi-resultat-ao.

Pilote la relance J+30 amicale puis l'analyse post-résultat (gagné/perdu) pour
aider l'utilisateur à apprendre, sans donner l'impression d'enquêter.

Modèle : Sonnet 4.6.
Source : NotebookLM N8 (Coach, réutilise #75).
Raw extract: docs/notebook-extracts/skill-81-84-chatbot-raw.md
System prompt: prompts/recherche_suivi_resultat_ao.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class RelanceJ30(BaseModel):
    message: str
    ton: str


class Input(SkillInput):
    resultat: str | None = None  # gagne | perdu | None (en attente)
    contexte_ao: dict = Field(default_factory=dict)


class Output(SkillOutput):
    relance_j30: RelanceJ30
    analyse_perdu: list[str] = Field(default_factory=list)
    analyse_gagne: list[str] = Field(default_factory=list)
    questions_apprentissage: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheSuiviResultatAo(Skill):
    name = "recherche-suivi-resultat-ao"
    category = "chatbot"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_suivi_resultat_ao.md"

    notebook_sources = ["N8"]
    pipeline_step = "chatbot"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Résultat : {inp.resultat or '(en attente)'}\n\n"
                "## Pilote le suivi du résultat (JSON conforme au schéma Output). "
                "Ton bienveillant, jamais 'pour améliorer l'IA'."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
