"""Skill #39 — extraction-memoire-importe.

Parse structurellement un ancien mémoire technique BTP importé (texte extrait
d'un .docx/.pdf) : identifie les sections sans TDM fiable, tague chaque
paragraphe par section et corps de métier, pour alimenter la bibliothèque.

Catégorie : sidebar (Bibliothèque) — utilisée par l'étape Mémoire (cf. registry #39).
Modèle : Sonnet 4.6 (segmentation + classification nuancée multi-indices).
Source : NotebookLM N3 (Mémoires gagnants) — mots-clés section/métier, heuristiques.
Raw extract: docs/notebook-extracts/skill-39-extraction-memoire-importe-raw.md
System prompt: prompts/extraction_memoire_importe.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    user_id: int
    memoire_text: str  # texte brut extrait du fichier importé
    filename: str = ""


class Paragraphe(BaseModel):
    ordre: int
    extrait: str
    section: str
    corps_de_metier: str
    reutilisable: bool = False
    indices: list[str] = Field(default_factory=list)


class Output(SkillOutput):
    sections_identifiees: list[str]
    paragraphes: list[Paragraphe]
    corps_de_metiers_detectes: list[str] = Field(default_factory=list)


@register
class ExtractionMemoireImporte(Skill):
    name = "extraction-memoire-importe"
    category = "sidebar"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/extraction_memoire_importe.md"

    notebook_sources = ["N3"]
    pipeline_step = "sidebar"
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
            max_tokens=8192,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        return f"""## Mémoire importé{f" ({inp.filename})" if inp.filename else ""} — texte brut
{inp.memoire_text}

## Parse la structure (JSON conforme au schéma Output).
Identifie les sections, tague chaque paragraphe (section + corps de métier).
Reprends les extraits verbatim. Paragraphe ambigu → section "indetermine".
"""
