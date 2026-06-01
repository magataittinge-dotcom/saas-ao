"""Skill #53 — generateur-ppsps.

Variante de #46 : génère un PPSPS COMPLET en pièce séparée (document clinique,
spécifique au chantier) quand il est demandé en pièce autonome.

Modèle : Sonnet 4.6 (conformité réglementaire bornée).
Source : NotebookLM N3 (Mémoires gagnants). Réf. Code du travail R.4532 hors corpus → [À COMPLÉTER].
Raw extract: docs/notebook-extracts/skill-51-53-54-55-variants-raw.md (+ skill-46-...-raw.md)
System prompt: prompts/generateur_ppsps.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str = ""
    contexte_chantier: str = ""
    risques_identifies: list[str] = Field(default_factory=list)
    renseignements_administratifs: dict = Field(default_factory=dict)


class AnalyseRisque(BaseModel):
    tache: str
    risque: str
    prevention: str
    equipements: list[str] = Field(default_factory=list)


class PPSPS(BaseModel):
    titre: str
    renseignements_administratifs: str
    analyse_risques: list[AnalyseRisque]
    organisation_secours_markdown: str
    hygiene_bases_vie_markdown: str
    coactivite_markdown: str
    obligatoire_si: str
    longueur_estimee_mots: int


class Output(SkillOutput):
    ppsps: PPSPS
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class GenerateurPpsps(Skill):
    name = "generateur-ppsps"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "2"  # v2 : obligation/seuils SPS-PPSPS sourcés (corpus N1 enrichi R.4532/L.4532-9)
    system_prompt_path = "prompts/generateur_ppsps.md"

    notebook_sources = ["N3", "N1"]
    pipeline_step = 4
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
        import json

        risques = "\n".join(f"- {r}" for r in inp.risques_identifies) or "(à déduire du CCTP)"
        return f"""## Renseignements administratifs
{json.dumps(inp.renseignements_administratifs, ensure_ascii=False, indent=2)}

## Contexte chantier
{inp.contexte_chantier or "(non précisé)"}

## Risques identifiés
{risques}

## CCTP du lot
{inp.cctp_text or "(non fourni)"}

## Génère le PPSPS complet (JSON conforme au schéma Output), spécifique au chantier.
Chaque risque rattaché à une tâche réelle. Réf. Code du travail → [À COMPLÉTER].
"""
