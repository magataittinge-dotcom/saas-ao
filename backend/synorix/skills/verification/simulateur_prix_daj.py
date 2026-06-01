"""Skill #85 — simulateur-prix-DAJ.

Calcul DÉTERMINISTE (aucun appel LLM) de la note prix du candidat selon les 3
formules officielles DAJ (inversement proportionnelle, linéaire, moyenne) +
variante AMF, et identification de la formule la plus favorable.

Modèle : "none" (calcul pur, cf. règle de mission ; divergence registry=Haiku loggée).
Source : NotebookLM N7 (Scoring) — 3 formules DAJ (réutilise capture #13).
Raw extract: docs/notebook-extracts/skill-66-67-85-nommage-depot-daj-raw.md
System prompt (référence, non envoyé) : prompts/simulateur_prix_daj.md
"""

from pydantic import BaseModel, Field

from synorix.ai.client import Client
from synorix.skills.base import Skill, SkillInput, SkillOutput
from synorix.skills.registry import register


class Input(SkillInput):
    prix_candidat: float
    prix_offres: list[float] = Field(default_factory=list)  # toutes offres (inclut candidat)
    base: float = 10.0  # base de notation (10, 40, 50...)
    formule_rc: str | None = None  # formule imposée par le RC, si connue


class NoteFormule(BaseModel):
    formule: str
    note: float


class Output(SkillOutput):
    notes: list[NoteFormule]
    formule_la_plus_favorable: str
    note_formule_rc: float | None = None
    avertissements: list[str] = Field(default_factory=list)
    sources_nbk: list[str]


@register
class SimulateurPrixDaj(Skill):
    name = "simulateur-prix-DAJ"
    category = "verification"
    model = "none"  # calcul déterministe, aucun appel LLM
    version = "1"
    system_prompt_path = "prompts/simulateur_prix_daj.md"

    notebook_sources = ["N7"]
    pipeline_step = 5
    differentiateur = 6  # D6 (PRD §1.7)

    async def run(self, inp: Input, *, client: Client) -> Output:
        avertissements: list[str] = []
        offres = [p for p in inp.prix_offres if p > 0] or [inp.prix_candidat]
        prix_bas = min(offres)
        prix_haut = max(offres)
        prix_moyen = sum(offres) / len(offres)
        b = inp.base
        c = inp.prix_candidat

        notes: list[NoteFormule] = []
        # Inversement proportionnelle
        notes.append(NoteFormule(formule="inversement-proportionnelle", note=round(prix_bas / c * b, 3)))
        # Linéaire
        if prix_haut != prix_bas:
            lin = b - b * ((c - prix_bas) / (prix_haut - prix_bas))
        else:
            lin = b
            avertissements.append("Formule linéaire : prix haut = prix bas (une seule offre).")
        notes.append(NoteFormule(formule="lineaire", note=round(lin, 3)))
        # Moyenne des offres
        notes.append(NoteFormule(formule="moyenne", note=round((b * prix_moyen) / (prix_moyen + c), 3)))
        # Variante AMF (base 100)
        notes.append(NoteFormule(formule="amf-base100", note=round(200 * prix_bas / (prix_bas + c), 3)))

        # Plus favorable parmi les 3 formules DAJ (base homogène)
        daj = [n for n in notes if n.formule in {"inversement-proportionnelle", "lineaire", "moyenne"}]
        favorable = max(daj, key=lambda n: n.note).formule

        note_rc = None
        if inp.formule_rc:
            match = next((n for n in notes if n.formule == inp.formule_rc), None)
            if match:
                note_rc = match.note
            else:
                avertissements.append(
                    f"[À COMPLÉTER] : formule RC '{inp.formule_rc}' non reconnue parmi les formules DAJ."
                )

        return Output(
            notes=notes,
            formule_la_plus_favorable=favorable,
            note_formule_rc=note_rc,
            avertissements=avertissements,
            sources_nbk=["N7"],
        )
