"""Skill #67 — recherche-procedures-depot-plateformes.

Restitue la procédure de dépôt étape par étape pour une plateforme (PLACE, AWS…) :
authentification, chargement, signature, chiffrement, transmission, contraintes.

Modèle : Sonnet 4.6.
Source : NotebookLM N5 (Plateformes) — procédures PLACE/AWS 2026.
Raw extract: docs/notebook-extracts/skill-66-67-85-nommage-depot-daj-raw.md
System prompt: prompts/recherche_procedures_depot_plateformes.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    plateforme: str  # PLACE | AWS | Maximilien | ...


class Etape(BaseModel):
    ordre: int
    intitule: str
    detail: str


class Output(SkillOutput):
    plateforme: str
    etapes: list[Etape]
    contraintes_techniques: list[str] = Field(default_factory=list)
    preuves_a_conserver: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RechercheProceduresDepotPlateformes(Skill):
    name = "recherche-procedures-depot-plateformes"
    category = "verification"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/recherche_procedures_depot_plateformes.md"

    notebook_sources = ["N5"]
    pipeline_step = 5
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Plateforme : {inp.plateforme}\n\n"
                "## Restitue la procédure de dépôt (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
