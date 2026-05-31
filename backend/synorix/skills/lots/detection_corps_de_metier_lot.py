"""Skill #7 — detection-corps-de-metier-lot.

Identifie le corps de métier principal d'un lot (mappé sur les 10 experts métier
du Step 3, sinon "autre" + libellé libre). Classification multi-classes → Haiku 4.5.

Source : NotebookLM N4 (Normes DTU — intitulés de lot par corps de métier).
Raw extract: docs/notebook-extracts/skill-07-detection-corps-de-metier-lot-raw.md
System prompt: prompts/detection_corps_de_metier_lot.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register

# Les 10 corps mappés aux skills expertes du Step 3, + "autre".
CORPS_VALIDES = {
    "facade",
    "gros_oeuvre",
    "electricite",
    "cvc",
    "plomberie",
    "peinture",
    "vrd",
    "menuiserie",
    "etancheite",
    "ite",
    "autre",
}


class Input(SkillInput):
    intitule_lot: str
    cctp_premier_paragraphe: str = ""


class Output(SkillOutput):
    corps_principal: str  # un des CORPS_VALIDES
    libelle_libre: str | None = None  # obligatoire si corps_principal == "autre"
    corps_secondaires: list[str] = []
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionCorpsDeMetierLot(Skill):
    name = "detection-corps-de-metier-lot"
    category = "lots"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/detection_corps_de_metier_lot.md"

    notebook_sources = ["N4"]
    pipeline_step = 2
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
        para = inp.cctp_premier_paragraphe or "(non fourni)"
        return f"""## Intitulé du lot
{inp.intitule_lot}

## Premier paragraphe du CCTP du lot
{para}

## Identifie le corps de métier principal en JSON conforme au schéma Output.
"""
