"""Skill #2 — detection-date-limite.

Extrait la date et l'heure limites de remise des offres depuis le RC (croisement
AE/CCAP si nécessaire). Raisonnement multi-documents + gestion de divergence →
Sonnet 4.6.

Sources : NotebookLM N2 (Pièces administratives) + N1 (Réglementaire — primauté
des pièces, horodatage serveur).
Raw extract: docs/notebook-extracts/skill-02-detection-date-limite-raw.md
System prompt: prompts/detection_date_limite.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str
    ae_text: str | None = None
    ccap_text: str | None = None


class Output(SkillOutput):
    date_limite: str | None = None  # "YYYY-MM-DD" ou None
    heure_limite: str | None = None  # "HH:MM" ou None
    fuseau: str = "Europe/Paris"
    source_document: str | None = None  # ex. "RC" — obligatoire si date trouvée
    source_page: int | None = None
    divergence: str | None = None  # description si divergence RC/AE/AAPC détectée
    not_found: bool = False
    confidence: float = Field(ge=0.0, le=1.0)  # interne, jamais exposé


@register
class DetectionDateLimite(Skill):
    name = "detection-date-limite"
    category = "upload"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_date_limite.md"

    notebook_sources = ["N2", "N1"]
    pipeline_step = 1
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
        ae = inp.ae_text or "(non fourni)"
        ccap = inp.ccap_text or "(non fourni)"
        return f"""## Règlement de la Consultation (RC)
{inp.rc_text}

## Acte d'Engagement (AE / ATTRI1)
{ae}

## CCAP
{ccap}

## Extrais la date et l'heure limites de remise des offres en JSON conforme au schéma Output.
"""
