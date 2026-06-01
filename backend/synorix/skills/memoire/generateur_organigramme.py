"""Skill #50 — generateur-organigramme.

Génère un organigramme de chantier dédié (3 niveaux max) + SVG lisible,
intégrable .docx/.pdf, à partir de l'équipe affectée de "Mon entreprise".

Modèle : Sonnet 4.6 (structuration + génération SVG bornée).
Source : NotebookLM N3 (Mémoires gagnants) — organigramme dédié 3 niveaux.
Raw extract: docs/notebook-extracts/skill-50-generateur-organigramme-raw.md
System prompt: prompts/generateur_organigramme.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    equipe_affectee: list[dict] = Field(default_factory=list)  # role, nom, coordonnees...


class Case(BaseModel):
    role: str
    nom: str
    coordonnees: str
    taux_affectation: str
    habilitations: list[str] = Field(default_factory=list)


class Niveau(BaseModel):
    niveau: int
    cases: list[Case]


class Organigramme(BaseModel):
    niveaux: list[Niveau]
    svg: str


class Output(SkillOutput):
    organigramme: Organigramme
    emplacements_photos: list[str] = Field(default_factory=list)
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class GenerateurOrganigramme(Skill):
    name = "generateur-organigramme"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/generateur_organigramme.md"

    notebook_sources = ["N3"]
    pipeline_step = 4
    differentiateur = 0

    async def run(self, inp: Input, *, client: Client) -> Output:
        user_prompt = self._build_user_prompt(inp)
        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        import json

        return f"""## Équipe affectée au chantier (source unique)
{json.dumps(inp.equipe_affectee, ensure_ascii=False, indent=2)}

## Génère l'organigramme de chantier (JSON conforme au schéma Output).
3 niveaux max, SVG lisible. Donnée manquante → [À COMPLÉTER PAR L'ENTREPRISE].
"""
