"""Skill #87 — detection-criteres-disproportionnes.

Détecte dans le RC les conditions de participation disproportionnées (L2142-1 CCP) :
CA exigé > 2× le montant estimé (R2142-6), références strictement identiques
(R2142-14), ancienneté excluant les sociétés récentes. Cite la jurisprudence.

Modèle : Sonnet 4.6.
Source : NotebookLM N6 (Pièges/Jurisprudence).
Raw extract: docs/notebook-extracts/skill-87-detection-criteres-disproportionnes-raw.md
System prompt: prompts/detection_criteres_disproportionnes.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str
    montant_estime: float | None = None


class CritereDisproportionne(BaseModel):
    exigence: str
    type: str  # ca | references | anciennete | autre
    niveau_disproportion: str
    fondement: str
    recommandation: str


class Output(SkillOutput):
    criteres_disproportionnes: list[CritereDisproportionne]
    ratio_ca_constate: str = ""
    sources_nbk: list[str]


@register
class DetectionCriteresDisproportionnes(Skill):
    name = "detection-criteres-disproportionnes"
    category = "extraction"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_criteres_disproportionnes.md"

    notebook_sources = ["N6"]
    pipeline_step = 3
    differentiateur = 10  # D10 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        montant = inp.montant_estime if inp.montant_estime is not None else "[À COMPLÉTER — montant estimé]"
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Montant estimé du marché : {montant}\n\n"
                f"## Règlement de consultation\n{inp.rc_text}\n\n"
                "## Détecte les critères disproportionnés (JSON conforme au schéma Output)."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
