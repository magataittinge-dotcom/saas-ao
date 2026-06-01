"""Skill #88 — conseil-recours-eviction.

Conseille le candidat évincé sur le bon recours (référé précontractuel L551-1 CJA /
référé contractuel L551-13 CJA / Tarn-et-Garonne CE 4/4/2014) selon le contexte
temporel (marché signé ou non, délais).

Modèle : Sonnet 4.6.
Source : NotebookLM N6 (Pièges/Jurisprudence).
Raw extract: docs/notebook-extracts/skill-88-conseil-recours-eviction-raw.md
System prompt: prompts/conseil_recours_eviction.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    marche_signe: bool | None = None
    date_notification_eviction: str = ""
    avis_attribution_publie: bool | None = None
    motif_eviction: str = ""


class Recours(BaseModel):
    type: str
    fondement: str
    delai: str
    juridiction: str = ""
    condition: str = ""


class Output(SkillOutput):
    recours_recommande: Recours
    alternatives: list[Recours] = Field(default_factory=list)
    avertissement: str = "Orientation — consulter un avocat pour la requête."
    sources_nbk: list[str]


@register
class ConseilRecoursEviction(Skill):
    name = "conseil-recours-eviction"
    category = "export"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/conseil_recours_eviction.md"

    notebook_sources = ["N6"]
    pipeline_step = 6
    differentiateur = 11  # D11 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                "## Contexte de l'éviction\n"
                f"{json.dumps(inp.model_dump(exclude={'project_id'}), ensure_ascii=False, indent=2)}\n\n"
                "## Recommande le recours adapté (JSON conforme au schéma Output). "
                "Cite les fondements (L551-1, L551-13 CJA, CE 4/4/2014) verbatim."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
