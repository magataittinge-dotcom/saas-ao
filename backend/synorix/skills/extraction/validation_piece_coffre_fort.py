"""Skill #35 — validation-piece-coffre-fort.

Pour chaque document du coffre-fort, vérifie sa validité (Kbis < 3 mois, URSSAF
< 6 mois, fiscale < 6 mois…) en fonction de la date limite de remise. Haiku 4.5.

Réutilise le tableau de validité de la skill #10 (NotebookLM N2).
Raw extract: docs/notebook-extracts/skill-35-validation-piece-coffre-fort-raw.md
System prompt: prompts/validation_piece_coffre_fort.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    type_piece: str  # ex. "Kbis", "Attestation URSSAF"
    date_emission: str | None = None  # "YYYY-MM-DD"
    date_limite_remise: str  # "YYYY-MM-DD"


class Output(SkillOutput):
    is_valid: bool
    expires_at: str | None = None  # date d'expiration calculée
    warning: str | None = None  # ex. "expire avant la remise"
    confidence: float = Field(ge=0.0, le=1.0)


@register
class ValidationPieceCoffreFort(Skill):
    name = "validation-piece-coffre-fort"
    category = "extraction"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/validation_piece_coffre_fort.md"

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
        return f"""## Pièce du coffre-fort
- Type : {inp.type_piece}
- Date d'émission : {inp.date_emission or "(inconnue)"}
- Date limite de remise des offres : {inp.date_limite_remise}

## Évalue la validité en JSON conforme au schéma Output.
"""
