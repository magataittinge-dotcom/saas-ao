"""Skill #80 — analyse-historique-ao-entreprise.

Analyse l'historique des AO de l'utilisateur pour produire des insights
actionnables (taux de réussite, corps de métier gagnants, MOA récurrents, axes
à renforcer), présentés de façon premium.

Modèle : Sonnet 4.6.
Source : pratiques BE / commercial BTP (skill analytique).
Raw extract: docs/notebook-extracts/skill-76-80-sidebar-raw.md
System prompt: prompts/analyse_historique_ao_entreprise.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    historique_ao: list[dict] = Field(default_factory=list)  # {intitule, corps_metier, moa, montant, resultat, ...}


class Indicateur(BaseModel):
    libelle: str
    valeur: str


class Output(SkillOutput):
    indicateurs: list[Indicateur]
    insights_actionnables: list[str] = Field(default_factory=list)
    axes_a_renforcer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class AnalyseHistoriqueAoEntreprise(Skill):
    name = "analyse-historique-ao-entreprise"
    category = "sidebar"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/analyse_historique_ao_entreprise.md"

    notebook_sources = []
    pipeline_step = "sidebar"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Historique des AO ({len(inp.historique_ao)})\n"
                f"{json.dumps(inp.historique_ao, ensure_ascii=False, indent=2)}\n\n"
                "## Produis les insights (JSON conforme au schéma Output). Aucun chiffre inventé."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
