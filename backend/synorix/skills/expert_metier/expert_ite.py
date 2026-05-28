"""Skill #26 — Expert ITE (Isolation Thermique par l'Extérieur).

Generates the technical methodology section for an ITE lot in a BTP tender response.
Sources : NotebookLM N4 (Normes DTU) + N3 (Mémoires gagnants).

Raw extract (build-time, audit): docs/notebook-extracts/skill-26-expert-ite-raw.md
System prompt: prompts/expert_ite.md
"""

from pydantic import BaseModel

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str
    contraintes_chantier: list[str] = []
    profil_entreprise: dict | None = None


class PhaseITE(BaseModel):
    nom: str
    description: str
    normes_appliquees: list[str]
    valeurs_chiffrees: dict[str, str]


class MethodologieITE(BaseModel):
    phases: list[PhaseITE]
    normes_citees: list[str]
    phrases_types: list[str]
    controles_obligatoires: list[str]
    livrables_exiges: list[str]
    points_vigilance: list[str]


class Output(SkillOutput):
    methodologie: MethodologieITE
    sources_nbk: list[str]  # e.g. ["N4", "N3"]


@register
class ExpertITE(Skill):
    name = "expert-ite"
    category = "expert-metier"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/expert_ite.md"

    # Synorix v2.1 metadata
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

## Produis la méthodologie ITE en JSON conforme au schéma Output.
"""
