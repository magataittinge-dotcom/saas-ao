"""
Rétro-planning auto (C20) — déterministe, 0 € API.

Construit la timeline du lot à partir des champs critiques (C5) :
    visite de site (si obligatoire et datée) → date limite des questions
    → dépôt recommandé (deadline − 24 h) → deadline.

Aucune date n'est JAMAIS inventée : une étape sans date n'apparaît pas.
Les dates passées sont marquées (passed=True), pas supprimées.
"""
from datetime import date, timedelta
from typing import List, Optional


def _step(sid: str, label: str, d: str, heure: Optional[str] = None,
          note: Optional[str] = None, today: Optional[date] = None) -> dict:
    return {
        "id": sid,
        "label": label,
        "date": d,
        "heure": heure,
        "note": note,
        "passed": date.fromisoformat(d) < (today or date.today()),
    }


def build_retroplanning(critical_fields: dict, today: Optional[date] = None) -> List[dict]:
    """critical_fields (format C5, un lot) → étapes ordonnées de la timeline."""
    cf = critical_fields or {}
    steps: List[dict] = []

    def _value(key):
        return (cf.get(key) or {}).get("value")

    # ── Visite de site — uniquement si OBLIGATOIRE et datée ──────────────────
    visite = _value("visite_site") or {}
    if visite.get("statut") == "obligatoire" and visite.get("date"):
        steps.append(_step(
            "visite", "Visite de site obligatoire", visite["date"], today=today,
        ))

    # ── Date limite des questions ─────────────────────────────────────────────
    questions = _value("date_limite_questions")
    if questions:
        steps.append(_step(
            "questions", "Dernier jour pour poser vos questions", questions, today=today,
        ))

    # ── Dépôt recommandé (J−1) puis deadline ──────────────────────────────────
    remise = _value("date_limite_remise") or {}
    if remise.get("date"):
        try:
            deadline_date = date.fromisoformat(remise["date"])
        except ValueError:
            deadline_date = None
        if deadline_date:
            steps.append(_step(
                "depot_recommande",
                "Dépôt recommandé",
                (deadline_date - timedelta(days=1)).isoformat(),
                note="Les plateformes de dépôt saturent le dernier jour — visez la veille.",
                today=today,
            ))
            steps.append(_step(
                "deadline", "Remise des offres", deadline_date.isoformat(),
                heure=remise.get("heure"), today=today,
            ))

    steps.sort(key=lambda s: s["date"])
    return steps
