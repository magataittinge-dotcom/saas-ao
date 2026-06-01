"""Skill #46 — redacteur-securite-ppsps.

Rédige toujours la section sécurité du mémoire (analyse des risques par tâche,
EPI, habilitations, co-activité/SPS, hygiène-secours) ; et, si l'option PPSPS est
activée, produit en plus une ébauche de PPSPS spécifique au chantier.

Modèle : Sonnet 4.6 (rédaction bornée, conformité).
Source : NotebookLM N3 (Mémoires gagnants). Réf. Code du travail R.4532 marquée [À COMPLÉTER] (hors corpus).
Raw extract: docs/notebook-extracts/skill-46-redacteur-securite-ppsps-raw.md
System prompt: prompts/redacteur_securite_ppsps.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    cctp_text: str = ""
    contexte_chantier: str = ""  # site occupé, co-activité, etc.
    risques_identifies: list[str] = Field(default_factory=list)
    generer_ppsps: bool = False


class AnalyseRisque(BaseModel):
    tache: str
    risque: str
    prevention: str
    epi: list[str] = Field(default_factory=list)


class SectionSecurite(BaseModel):
    titre: str
    analyse_risques: list[AnalyseRisque]
    habilitations: list[str] = Field(default_factory=list)
    coactivite_markdown: str
    hygiene_secours_markdown: str
    longueur_estimee_mots: int


class PPSPS(BaseModel):
    titre: str
    contenu_markdown: str
    obligatoire_si: str


class Output(SkillOutput):
    section_securite: SectionSecurite
    ppsps: PPSPS | None = None
    champs_a_completer: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class RedacteurSecuritePpsps(Skill):
    name = "redacteur-securite-ppsps"
    category = "memoire"
    model = "claude-sonnet-4-6"
    version = "1"
    system_prompt_path = "prompts/redacteur_securite_ppsps.md"

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
            max_tokens=6144,
        )
        return Output.model_validate(raw)

    def _build_user_prompt(self, inp: Input) -> str:
        risques = "\n".join(f"- {r}" for r in inp.risques_identifies) or "(à déduire du CCTP)"
        return f"""## Contexte chantier
{inp.contexte_chantier or "(non précisé)"}

## Risques identifiés
{risques}

## CCTP du lot
{inp.cctp_text or "(non fourni)"}

## Option PPSPS : {"ACTIVÉE — produire une ébauche PPSPS" if inp.generer_ppsps else "désactivée — ppsps = null"}

## Rédige la section sécurité (JSON conforme au schéma Output), spécifique au chantier.
"""
