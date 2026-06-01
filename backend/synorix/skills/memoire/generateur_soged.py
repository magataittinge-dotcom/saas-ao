"""Skill #54 — generateur-soged.

Variante de #47 : génère un SOGED autonome 2026 (pièce séparée) — tri 5 flux,
filières, traçabilité BSDD, taux de valorisation cible. REP PMCB hors corpus → à vérifier.

Modèle : Sonnet 4.6.
Source : NotebookLM N3 (Mémoires gagnants) — tri 5 flux. REP PMCB hors corpus.
Raw extract: docs/notebook-extracts/skill-51-53-54-55-variants-raw.md (+ skill-47-...-raw.md)
System prompt: prompts/generateur_soged.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str = ""
    contexte_chantier: str = ""
    taux_valorisation_entreprise: str | None = None


class SOGED(BaseModel):
    titre: str
    flux_tries: list[str]
    filieres_markdown: str
    tracabilite_markdown: str
    taux_valorisation_cible: str
    rep_pmcb_note: str
    longueur_estimee_mots: int


class Output(SkillOutput):
    soged: SOGED
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class GenerateurSoged(Skill):
    name = "generateur-soged"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/generateur_soged.md"

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
            max_tokens=6144,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        return f"""## Contexte chantier
{inp.contexte_chantier or "(non précisé)"}

## Taux de valorisation de l'entreprise
{inp.taux_valorisation_entreprise or "[À COMPLÉTER PAR L'ENTREPRISE]"}

## CCTP du lot
{inp.cctp_text or "(non fourni)"}

## Génère le SOGED autonome (JSON conforme au schéma Output).
Tri 5 flux. REP PMCB → marqueur de vérification. Aucun taux inventé.
"""
