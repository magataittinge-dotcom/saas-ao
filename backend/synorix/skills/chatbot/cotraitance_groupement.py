"""Skill #89 — cotraitance-groupement.

Aide une PME à envisager/structurer un GME conjoint ou solidaire (R2142-20 CCP) :
pédagogie des régimes, détection proactive de pertinence, orchestration DC1/DC2
(jamais DC4 = sous-traitance).

Modèle : Sonnet 4.6.
Source : NotebookLM N8 (Coach).
Raw extract: docs/notebook-extracts/skill-89-cotraitance-groupement-raw.md
System prompt: prompts/cotraitance_groupement.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    montant_lot: float | None = None
    ca_derniere_annee: float | None = None
    capacites_manquantes: list[str] = Field(default_factory=list)


class Formulaire(BaseModel):
    nom: str
    role: str


class Output(SkillOutput):
    gme_pertinent: bool
    raison_detection: str
    regime_recommande: str
    explication_regimes: str
    formulaires: list[Formulaire] = Field(default_factory=list)
    avertissement_dc4: str = (
        "Le DC4 ne concerne pas la cotraitance (sous-traitance uniquement)."
    )
    sources_nbk: list[str]


@register
class CotraitanceGroupement(Skill):
    name = "cotraitance-groupement"
    category = "chatbot"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/cotraitance_groupement.md"

    notebook_sources = ["N8"]
    pipeline_step = "chatbot"
    differentiateur = 12  # D12 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        # Seuil de détection proactive (R2142-1) calculé côté client pour guider le modèle.
        seuil_capacite = ""
        if inp.montant_lot is not None and inp.ca_derniere_annee:
            ratio = inp.montant_lot / inp.ca_derniere_annee
            seuil_capacite = (
                f"ratio montant_lot / CA = {ratio:.2f} "
                f"({'> 0.6 → GME suggéré' if ratio > 0.6 else '≤ 0.6'})"
            )
        capacites = ", ".join(inp.capacites_manquantes) or "(aucune signalée)"
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Indicateurs de détection\n- {seuil_capacite or '[À COMPLÉTER — montant/CA]'}\n"
                f"- Capacités manquantes seul : {capacites}\n\n"
                "## Conseille sur le GME (JSON conforme au schéma Output). Cite R2142-20."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
