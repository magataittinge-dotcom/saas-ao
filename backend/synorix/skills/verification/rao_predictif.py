"""Skill #86 — RAO-predictif.

Génère un Rapport d'Analyse d'Offres prédictif : grille 0-5 par sous-critère +
pondération + classement probable + écarts critiques, comme une commission.

Modèle : Sonnet 4.6 (cf. registry).
Source : NotebookLM N7 (Scoring) — grille 0-5 ; cadre R2152-6 à R2152-8 CCP.
Raw extract: docs/notebook-extracts/skill-65-70-71-86-scoring-N7-raw.md
System prompt: prompts/rao_predictif.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    memoire_text: str
    criteres_ponderes: list[dict] = Field(default_factory=list)  # extraits du RC (#13/#65)
    references_entreprise: list[dict] = Field(default_factory=list)


class SousCritere(BaseModel):
    nom: str
    note_sur_5: float
    ponderation_pct: float
    justification: str
    ecart_critique: str = ""


class RAO(BaseModel):
    sous_criteres: list[SousCritere]
    note_ponderee_globale: float
    classement_probable: str


class Output(SkillOutput):
    rao: RAO
    cadre_juridique: str
    sources_nbk: list[str]


@register
class RaoPredictif(Skill):
    name = "RAO-predictif"
    category = "verification"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/rao_predictif.md"

    notebook_sources = ["N7"]
    pipeline_step = 5
    differentiateur = 8  # D8 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Critères pondérés (RC)\n{json.dumps(inp.criteres_ponderes, ensure_ascii=False)}\n\n"
                f"## Mémoire à évaluer\n{inp.memoire_text}\n\n"
                "## Produis le RAO prédictif (JSON conforme au schéma Output)."
            ),
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)
