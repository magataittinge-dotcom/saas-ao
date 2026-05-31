"""Skill #18 — liaison-coffre-fort.

Pour chaque exigence administrative extraite, cherche dans le coffre-fort de
l'entreprise un document correspondant et statue sur sa validité. Appariement
sémantique prudent (0 faux positif) → Haiku 4.5.

Réutilise le référentiel des pièces admin de la skill #10 (NotebookLM N2).
Raw extract: docs/notebook-extracts/skill-18-liaison-coffre-fort-raw.md
System prompt: prompts/liaison_coffre_fort.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class DocumentCoffreFort(BaseModel):
    document_id: str
    titre: str
    type_detecte: str | None = None
    date_emission: str | None = None
    date_expiration: str | None = None


class Input(SkillInput):
    type_exigence: str  # ex. "Attestation vigilance URSSAF de moins de 6 mois"
    coffre_fort: list[DocumentCoffreFort]


class Output(SkillOutput):
    statut: str  # "matched_valid" | "matched_expired" | "unmatched"
    document_id_lie: str | None = None
    expiration: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)


@register
class LiaisonCoffreFort(Skill):
    name = "liaison-coffre-fort"
    category = "extraction"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/liaison_coffre_fort.md"

    notebook_sources = ["N2"]
    pipeline_step = 3
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
        docs = "\n".join(
            f"- id={d.document_id} | {d.titre} | type={d.type_detecte or '?'} "
            f"| émis={d.date_emission or '?'} | expire={d.date_expiration or '?'}"
            for d in inp.coffre_fort
        ) or "(coffre-fort vide)"
        return f"""## Exigence à apparier
{inp.type_exigence}

## Documents du coffre-fort
{docs}

## Apparie (ou non) en JSON conforme au schéma Output.
"""
