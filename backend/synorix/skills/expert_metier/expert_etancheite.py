"""Skill #34 — Expert Étanchéité de toiture-terrasse.

Generates the technical methodology section for an étanchéité lot in a BTP
tender response. Sources : NotebookLM N4 (série NF DTU 43 + 20.12, CSFE) + N3
(Mémoires gagnants).

Recapture complète 2026-05-31 (quota Pro restauré) — squelette remplacé par
contenu réel, version "1" → "2".

Raw extract: docs/notebook-extracts/skill-34-expert-etancheite-raw.md
System prompt: prompts/expert_etancheite.md
"""

from pydantic import BaseModel

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str
    contraintes_chantier: list[str] = []
    profil_entreprise: dict | None = None


class PhaseEtancheite(BaseModel):
    nom: str
    description: str
    normes_appliquees: list[str]
    valeurs_chiffrees: dict[str, str]


class MethodologieEtancheite(BaseModel):
    phases: list[PhaseEtancheite]
    normes_citees: list[str]
    phrases_types: list[str]
    controles_obligatoires: list[str]
    livrables_exiges: list[str]
    points_vigilance: list[str]


class Output(SkillOutput):
    methodologie: MethodologieEtancheite
    sources_nbk: list[str]


@register
class ExpertEtancheite(Skill):
    name = "expert-etancheite"
    category = "expert-metier"
    model = "claude-sonnet-4-6"
    version = "3"  # v3 : procédés non-DTU sourcés (SEL e-Cahier CSTB 3680_V2 + Règles pro CSFE) — corpus N4 enrichi 01/06/26
    system_prompt_path = "prompts/expert_etancheite.md"

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

## Produis la méthodologie étanchéité en JSON conforme au schéma Output.
"""
