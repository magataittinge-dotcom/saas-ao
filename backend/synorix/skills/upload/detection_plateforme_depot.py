"""Skill #4 — detection-plateforme-depot.

Identifie la plateforme officielle de dépôt (PLACE, AWS-Achat, Maximilien,
e-marchespublics, achatpublic.com…) à partir du RC. Classification sur signal
fort → Haiku 4.5.

Sécurité : une URL extraite du DCE n'est JAMAIS renvoyée cliquable sans
correspondance à l'allowlist Synorix. Si inconnue → libellé brut, url_canonique = null.

Source : NotebookLM N5 (Plateformes de dépôt).
Raw extract: docs/notebook-extracts/skill-04-detection-plateforme-depot-raw.md
System prompt: prompts/detection_plateforme_depot.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    rc_text: str
    url_in_rc: str | None = None  # URL éventuellement présente dans le RC


class Output(SkillOutput):
    plateforme: str  # nom canonique ou "inconnue"
    url_canonique: str | None = None  # uniquement si correspond à l'allowlist
    libelle_brut: str | None = None  # libellé tel que cité si plateforme inconnue
    source_document: str | None = None
    not_found: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


@register
class DetectionPlateformeDepot(Skill):
    name = "detection-plateforme-depot"
    category = "upload"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/detection_plateforme_depot.md"

    notebook_sources = ["N5"]
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
        url = inp.url_in_rc or "(aucune URL isolée fournie)"
        return f"""## Règlement de la Consultation (RC)
{inp.rc_text}

## URL éventuellement repérée dans le RC
{url}

## Identifie la plateforme de dépôt en JSON conforme au schéma Output.
"""
