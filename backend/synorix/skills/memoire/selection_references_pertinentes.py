"""Skill #37 — selection-references-pertinentes.

Sélectionne automatiquement, parmi toutes les références chantiers de
l'entreprise, les 3 à 5 plus pertinentes pour l'AO en cours (nature/métier,
montant, MOA, récence, données techniques), avec un score de pertinence interne.

Modèle : Sonnet 4.6 (raisonnement multi-critères, classement nuancé).
Source : NotebookLM N3 (Mémoires gagnants) — volumétrie 3-5 + critères "miroir".
Raw extract: docs/notebook-extracts/skill-37-selection-references-pertinentes-raw.md
System prompt: prompts/selection_references_pertinentes.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class ProfilAO(BaseModel):
    corps_de_metier: str
    montant_estime: str | None = None
    type_moa: str | None = None
    contraintes: list[str] = Field(default_factory=list)


class Input(SkillInput):
    profil_ao: ProfilAO
    references: list[dict]  # toutes les références de l'entreprise (id + champs)


class ReferenceSelectionnee(BaseModel):
    ref_id: str
    intitule: str
    score_pertinence: int
    justification: str
    criteres_forts: list[str]


class Output(SkillOutput):
    references_selectionnees: list[ReferenceSelectionnee]
    volumetrie_retenue: int
    avertissements: list[str] = Field(default_factory=list)


@register
class SelectionReferencesPertinentes(Skill):
    name = "selection-references-pertinentes"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/selection_references_pertinentes.md"

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
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        import json

        return f"""## Profil de l'AO en cours
{json.dumps(inp.profil_ao.model_dump(), ensure_ascii=False, indent=2)}

## Références disponibles de l'entreprise ({len(inp.references)})
{json.dumps(inp.references, ensure_ascii=False, indent=2)}

## Sélectionne les 3 à 5 références les plus pertinentes (JSON conforme au schéma Output).
Classe par score décroissant. N'invente aucune donnée.
"""
