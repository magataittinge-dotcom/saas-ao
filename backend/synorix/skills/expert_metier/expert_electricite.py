"""Skill #28 — Expert Électricité bâtiment (CFO/CFA, IRVE, SSI).

Sources : NotebookLM N4 (Normes NF C + DTU interfaces) + N3 (Mémoires gagnants).
Raw extract: docs/notebook-extracts/skill-28-expert-electricite-raw.md
"""

from pydantic import BaseModel

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str
    contraintes_chantier: list[str] = []
    profil_entreprise: dict | None = None


class PhaseElec(BaseModel):
    nom: str
    description: str
    normes_appliquees: list[str]
    valeurs_chiffrees: dict[str, str]


class MethodologieElec(BaseModel):
    phases: list[PhaseElec]
    normes_citees: list[str]
    phrases_types: list[str]
    controles_obligatoires: list[str]
    livrables_exiges: list[str]
    points_vigilance: list[str]


class Output(SkillOutput):
    methodologie: MethodologieElec
    sources_nbk: list[str]


@register
class ExpertElectricite(Skill):
    name = "expert-electricite"
    category = "expert-metier"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/expert_electricite.md"

    notebook_sources = ["N4", "N3"]
    pipeline_step = 3
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        contraintes = (
            "\n".join(f"- {c}" for c in inp.contraintes_chantier) or "(aucune)"
        )
        return f"""## CCTP du marché
{inp.cctp_text}

## Contraintes chantier identifiées
{contraintes}

## Produis la méthodologie électricité en JSON conforme au schéma Output.
"""
