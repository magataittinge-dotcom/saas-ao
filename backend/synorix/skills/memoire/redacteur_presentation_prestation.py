"""Skill #44 — redacteur-presentation-prestation.

Rédige la PARTIE B — Présentation de la prestation : compréhension du besoin
(reformulation experte, jamais copier-coller CCTP), tableau Contraintes=Solutions
ancré sur le projet, anticipation des aléas.

Modèle : Opus 4.7 (rédaction long-form, différenciateur produit).
Source : NotebookLM N3 (Mémoires gagnants) — signaux de compréhension réelle.
Raw extract: docs/notebook-extracts/skill-44-redacteur-presentation-prestation-raw.md
System prompt: prompts/redacteur_presentation_prestation.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str
    donnees_ao: dict = Field(default_factory=dict)  # nom_chantier, moa, lot
    plans_cles: list[str] = Field(default_factory=list)  # descriptions de plans clés


class ContrainteSolution(BaseModel):
    contrainte: str
    solution: str
    type: str


class AleaRepli(BaseModel):
    risque: str
    solution_repli: str


class SectionPrestation(BaseModel):
    titre: str
    comprehension_besoin_markdown: str
    contraintes_solutions: list[ContrainteSolution]
    anticipation_aleas: list[AleaRepli]
    longueur_estimee_mots: int


class Output(SkillOutput):
    section: SectionPrestation
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurPresentationPrestation(Skill):
    name = "redacteur-presentation-prestation"
    category = "memoire"
    model = "claude-opus-4-7"
    version = "1"
    system_prompt_path = "prompts/redacteur_presentation_prestation.md"

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
            max_tokens=8192,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        import json

        plans = "\n".join(f"- {p}" for p in inp.plans_cles) or "(aucun plan fourni)"
        return f"""## Données de l'AO
{json.dumps(inp.donnees_ao, ensure_ascii=False, indent=2)}

## Plans clés
{plans}

## CCTP du lot
{inp.cctp_text}

## Rédige la PARTIE B (JSON conforme au schéma Output).
Reformule (jamais de copier-coller CCTP). Tableau Contraintes=Solutions ancré sur CE chantier.
"""
