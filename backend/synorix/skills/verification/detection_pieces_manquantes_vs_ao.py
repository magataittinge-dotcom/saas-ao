"""Skill #68 — detection-pieces-manquantes-vs-ao.

Compare les pièces exigées par le DCE (#10/#11) au dossier préparé, par matching
sémantique (synonymes/alias/homonymes), et liste ce qui reste à ajouter.
Objectif : 0 faux négatif (doute → a_verifier).

Modèle : Sonnet 4.6 (matching sémantique nuancé).
Source : pratiques BE (matching). Skill technique.
Raw extract: docs/notebook-extracts/skill-68-detection-pieces-manquantes-vs-ao-raw.md
System prompt: prompts/detection_pieces_manquantes_vs_ao.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    pieces_exigees: list[str] = Field(default_factory=list)  # sorties #10/#11
    pieces_dossier: list[str] = Field(default_factory=list)  # contenu préparé


class PieceMatch(BaseModel):
    exigee: str
    statut: str  # present | a_ajouter | a_verifier
    correspondance: str = ""


class Output(SkillOutput):
    pieces: list[PieceMatch]
    a_ajouter: list[str] = Field(default_factory=list)
    a_verifier: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class DetectionPiecesManquantesVsAo(Skill):
    name = "detection-pieces-manquantes-vs-ao"
    category = "verification"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/detection_pieces_manquantes_vs_ao.md"

    notebook_sources = ["N2"]
    pipeline_step = 5
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        exigees = "\n".join(f"- {p}" for p in inp.pieces_exigees) or "(aucune)"
        dossier = "\n".join(f"- {p}" for p in inp.pieces_dossier) or "(vide)"
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Pièces exigées par le DCE\n{exigees}\n\n"
                f"## Pièces présentes dans le dossier\n{dossier}\n\n"
                "## Détecte les pièces manquantes (JSON conforme au schéma Output). "
                "0 faux négatif : doute → a_verifier."
            ),
            schema=Output,
        )
        return Output.model_validate(raw)
