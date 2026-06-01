"""Skill #95 — calculateur-OAB-temps-reel.

Calcul DÉTERMINISTE (aucun appel LLM) du risque d'offre anormalement basse (OAB)
selon la méthode de la double moyenne (L2152-5 CCP) : M1 → exclusion > 1,2×M1 →
M2 → seuil 0,9×M2. Gauge vert/orange/rouge + marge avant zone OAB.

Modèle : "none" (calcul pur, cf. règle de mission ; divergence registry=Haiku loggée).
Source : NotebookLM N7 (Scoring) — méthode double moyenne + TA Nantes Verchéenne.
Raw extract: docs/notebook-extracts/skill-95-calculateur-OAB-temps-reel-raw.md
System prompt (référence, non envoyé) : prompts/calculateur_oab_temps_reel.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register

SEUIL_HAUT = 1.2  # exclusion offres > 1,2 × M1
SEUIL_OAB = 0.9   # offre < 0,9 × M2 → suspicion OAB (variante AMF : 0,85)
RAPPEL_CONTRADICTOIRE = (
    "Une OAB ne peut être rejetée sans procédure contradictoire préalable "
    "(TA Nantes, 19/05/2025, Société Verchéenne, n° 2506407)."
)


class Input(SkillInput):
    prix_candidat: float
    prix_offres: list[float] = Field(default_factory=list)  # toutes offres acceptables (inclut candidat)
    seuil_oab: float = SEUIL_OAB


class Output(SkillOutput):
    m1: float
    m2: float
    seuil_oab_euros: float
    marge_avant_oab: float
    gauge: str  # vert | orange | rouge
    est_oab: bool
    rappel_juridique: str
    avertissements: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class CalculateurOabTempsReel(Skill):
    name = "calculateur-OAB-temps-reel"
    category = "verification"
    model = "none"  # calcul déterministe, aucun appel LLM
    version = "1"
    system_prompt_path = "prompts/calculateur_oab_temps_reel.md"

    notebook_sources = ["N7"]
    pipeline_step = 5
    differentiateur = 7  # D7 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        avertissements: list[str] = []
        offres = [p for p in inp.prix_offres if p > 0]
        if not offres:
            offres = [inp.prix_candidat]
            avertissements.append(
                "[À COMPLÉTER — aucune offre concurrente fournie] : calcul sur le seul prix candidat."
            )

        m1 = sum(offres) / len(offres)
        restantes = [p for p in offres if p <= SEUIL_HAUT * m1]
        m2 = sum(restantes) / len(restantes) if restantes else m1
        seuil_oab_euros = round(inp.seuil_oab * m2, 2)
        marge = round(inp.prix_candidat - seuil_oab_euros, 2)
        est_oab = inp.prix_candidat < seuil_oab_euros

        if est_oab:
            gauge = "rouge"
        elif inp.prix_candidat < 0.95 * m2:
            gauge = "orange"
        else:
            gauge = "vert"

        return Output(
            m1=round(m1, 2),
            m2=round(m2, 2),
            seuil_oab_euros=seuil_oab_euros,
            marge_avant_oab=marge,
            gauge=gauge,
            est_oab=est_oab,
            rappel_juridique=RAPPEL_CONTRADICTOIRE,
            avertissements=avertissements,
            sources_nbk=["N7"],
        )
