"""Skill #47 — redacteur-environnement-soged.

Rédige toujours la section environnement (tri 5 flux, filières, traçabilité,
nuisances, taux de valorisation cible) ; et, si l'option SOGED est activée,
produit en plus un SOGED quantitatif. REP PMCB marquée à vérifier (hors corpus N3).

Modèle : Sonnet 4.6 (rédaction bornée, conformité environnementale).
Source : NotebookLM N3 (Mémoires gagnants) — tri 5 flux. REP PMCB hors corpus.
Raw extract: docs/notebook-extracts/skill-47-redacteur-environnement-soged-raw.md
System prompt: prompts/redacteur_environnement_soged.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str = ""
    contexte_chantier: str = ""
    taux_valorisation_entreprise: str | None = None
    generer_soged: bool = False


class SectionEnvironnement(BaseModel):
    titre: str
    flux_tries: list[str]
    filieres_tracabilite_markdown: str
    nuisances_markdown: str
    taux_valorisation_cible: str
    longueur_estimee_mots: int


class SOGED(BaseModel):
    titre: str
    contenu_markdown: str
    rep_pmcb_note: str


class Output(SkillOutput):
    section_environnement: SectionEnvironnement
    soged: SOGED | None = None
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurEnvironnementSoged(Skill):
    name = "redacteur-environnement-soged"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "2"  # v2 : REP PMCB sourcée (décret 2021-1941, R.543-289) — corpus N4 enrichi
    system_prompt_path = "prompts/redacteur_environnement_soged.md"

    notebook_sources = ["N3", "N4"]
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

## Option SOGED : {"ACTIVÉE — produire un SOGED" if inp.generer_soged else "désactivée — soged = null"}

## Rédige la section environnement (JSON conforme au schéma Output).
Tri 5 flux. Toute mention REP PMCB → marqueur de vérification. Aucun taux inventé.
"""
