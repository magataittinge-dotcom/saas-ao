"""Skill #92 — criteres-RSE-2026.

Détecte les exigences RSE du DCE et suggère des engagements personnalisés sur les
5 catégories Loi Climat (22/8/2026) : déchets, carbone, biosourcés, insertion,
mobilité. Indicateurs chiffrés TOUJOURS [À COMPLÉTER PAR L'ENTREPRISE] (jamais inventés).

Modèle : Sonnet 4.6 (cf. registry — suggestions structurées sans génération longue).
Source : NotebookLM N7 (Scoring) + N8 (Coach).
Raw extract: docs/notebook-extracts/skill-92-criteres-RSE-2026-raw.md
System prompt: prompts/criteres_rse_2026.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_ccap_text: str = ""
    profil_entreprise: dict = Field(default_factory=dict)
    phrases_rse_bibliotheque: list[str] = Field(default_factory=list)


class CritereDetecte(BaseModel):
    categorie: str  # dechets | carbone | biosources | insertion | mobilite
    citation_dce: str
    implicite: bool = False


class SuggestionRSE(BaseModel):
    categorie: str
    engagement: str
    indicateur_chiffre: str = "[À COMPLÉTER PAR L'ENTREPRISE]"


class EcartStep5(BaseModel):
    categorie: str
    severite: str  # 🟢 | 🟡 | 🔴


class Output(SkillOutput):
    criteres_detectes: list[CritereDetecte]
    suggestions: list[SuggestionRSE]
    section_rse_markdown: str
    ecarts_step5: list[EcartStep5] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class CriteresRse2026(Skill):
    name = "criteres-RSE-2026"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "2"  # v2 : certifications RSE (BBCA/Effinergie/NF Habitat HQE) sourcées — corpus N7 enrichi
    system_prompt_path = "prompts/criteres_rse_2026.md"

    notebook_sources = ["N7", "N8"]
    pipeline_step = 4
    differentiateur = 13  # D13 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        import json

        raw = await client.complete(
            model=self.model,
            system_prompt=self.system_prompt,
            user_prompt=(
                f"## Profil entreprise\n{json.dumps(inp.profil_entreprise, ensure_ascii=False)}\n\n"
                f"## CCTP + CCAP\n{inp.cctp_ccap_text}\n\n"
                "## Détecte les critères RSE et suggère les engagements (JSON conforme au schéma Output). "
                "Aucun indicateur chiffré inventé : toujours [À COMPLÉTER PAR L'ENTREPRISE]."
            ),
            schema=Output,
            max_tokens=4096,
        )
        return Output.model_validate(raw)
