"""Skill #3 — detection-doublons-versions.

Détecte les doublons exacts (hash SHA-256 identique — déterministe) et les
nouvelles versions d'un même document ("annule et remplace", indice B, v2,
modificatif…). Signal fort sur nom + marqueurs textuels → Haiku 4.5.

Skill majoritairement technique ; marqueurs textuels grounded sur NotebookLM N2.
Raw extract: docs/notebook-extracts/skill-03-detection-doublons-versions-raw.md
System prompt: prompts/detection_doublons_versions.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class FileRef(BaseModel):
    filename: str
    sha256: str | None = None  # hash sur les bytes complets du fichier original
    size_bytes: int | None = None
    text_excerpt: str = ""  # premiers ~2000 caractères
    modified_date: str | None = None  # si présent dans le ZIP


class Input(SkillInput):
    files: list[FileRef]


class FileGroup(BaseModel):
    canonical_filename: str  # le fichier valide / le plus récent
    superseded_filenames: list[str]  # doublons / versions annulées
    relation: str  # "duplicate_exact" | "version"
    reason: str  # marqueur ayant déclenché le regroupement


class Output(SkillOutput):
    groups: list[FileGroup]  # vide si aucun lien détecté
    confidence: float = Field(ge=0.0, le=1.0)  # interne


@register
class DetectionDoublonsVersions(Skill):
    name = "detection-doublons-versions"
    category = "upload"
    model = "claude-haiku-4-5"
    version = "1"
    system_prompt_path = "prompts/detection_doublons_versions.md"

    notebook_sources = ["N2"]
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
        lines = []
        for f in inp.files:
            parts = [f"- {f.filename}"]
            if f.sha256:
                parts.append(f"sha256={f.sha256[:16]}…")
            if f.size_bytes is not None:
                parts.append(f"{f.size_bytes} o")
            if f.modified_date:
                parts.append(f"modifié {f.modified_date}")
            lines.append(" | ".join(parts))
        listing = "\n".join(lines) or "(aucun fichier)"
        return f"""## Fichiers extraits du DCE
{listing}

## Regroupe doublons et versions en JSON conforme au schéma Output.
"""
