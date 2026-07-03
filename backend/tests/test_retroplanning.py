"""
Tests C20 — rétro-planning auto (déterministe, 0 € API).

Timeline ordonnée : visite de site (si obligatoire) → date limite questions
→ dépôt recommandé (deadline − 24h) → deadline.
Aucune date inventée : étape sans date → absente. Dates passées marquées.
"""
from datetime import date, timedelta

import pytest


def _cf(remise=None, heure=None, questions=None, visite_statut=None, visite_date=None):
    """Construit un critical_fields minimal (format C5)."""
    return {
        "date_limite_remise": {
            "value": {"date": remise, "heure": heure} if remise else None,
            "source": None,
        },
        "date_limite_questions": {"value": questions, "source": None},
        "visite_site": {
            "value": {"statut": visite_statut or "non_mentionnee", "date": visite_date},
            "source": None,
        },
        "criteres": {"value": None, "source": None},
        "penalites": {"value": None, "source": None},
        "delai_execution": {"value": None, "source": None},
    }


FUTURE = (date.today() + timedelta(days=30)).isoformat()
FUTURE_Q = (date.today() + timedelta(days=20)).isoformat()
FUTURE_V = (date.today() + timedelta(days=10)).isoformat()


def test_full_timeline_ordered():
    from services.retroplanning import build_retroplanning

    steps = build_retroplanning(_cf(
        remise=FUTURE, heure="12h00", questions=FUTURE_Q,
        visite_statut="obligatoire", visite_date=FUTURE_V,
    ))
    ids = [s["id"] for s in steps]
    assert ids == ["visite", "questions", "depot_recommande", "deadline"]
    # Ordre chronologique strict
    dates = [s["date"] for s in steps]
    assert dates == sorted(dates)


def test_depot_recommande_is_deadline_minus_24h():
    from services.retroplanning import build_retroplanning

    steps = build_retroplanning(_cf(remise=FUTURE, heure="12h00"))
    depot = next(s for s in steps if s["id"] == "depot_recommande")
    deadline = next(s for s in steps if s["id"] == "deadline")
    assert depot["date"] == (date.fromisoformat(FUTURE) - timedelta(days=1)).isoformat()
    assert "recommand" in depot["label"].lower()
    assert "saturent" in (depot["note"] or "")
    assert deadline["date"] == FUTURE
    assert deadline["heure"] == "12h00"


def test_steps_without_date_are_omitted():
    from services.retroplanning import build_retroplanning

    # Pas de questions, pas de visite → seulement dépôt recommandé + deadline
    steps = build_retroplanning(_cf(remise=FUTURE))
    ids = [s["id"] for s in steps]
    assert ids == ["depot_recommande", "deadline"]


def test_visite_facultative_not_included():
    from services.retroplanning import build_retroplanning

    steps = build_retroplanning(_cf(
        remise=FUTURE, visite_statut="facultative", visite_date=FUTURE_V,
    ))
    assert "visite" not in [s["id"] for s in steps]


def test_visite_obligatoire_without_date_omitted():
    """Visite obligatoire mais sans date connue → pas d'étape (date jamais
    inventée) — l'info reste dans le bandeau critique."""
    from services.retroplanning import build_retroplanning

    steps = build_retroplanning(_cf(remise=FUTURE, visite_statut="obligatoire"))
    assert "visite" not in [s["id"] for s in steps]


def test_past_dates_marked():
    from services.retroplanning import build_retroplanning

    past_q = (date.today() - timedelta(days=5)).isoformat()
    steps = build_retroplanning(_cf(remise=FUTURE, questions=past_q))
    questions = next(s for s in steps if s["id"] == "questions")
    deadline = next(s for s in steps if s["id"] == "deadline")
    assert questions["passed"] is True
    assert deadline["passed"] is False


def test_no_deadline_no_timeline():
    from services.retroplanning import build_retroplanning

    assert build_retroplanning(_cf(questions=FUTURE_Q)) == [
        s for s in build_retroplanning(_cf(questions=FUTURE_Q)) if s["id"] == "questions"
    ]
    # Sans deadline il ne peut pas y avoir de dépôt recommandé
    ids = [s["id"] for s in build_retroplanning(_cf(questions=FUTURE_Q))]
    assert "depot_recommande" not in ids and "deadline" not in ids


def test_endpoint_retroplanning(client, db_session, test_org):
    from models.project import Project

    p = Project(
        id="proj-c20", organization_id=test_org.id, name="Gueux", selected_lot="lot1",
        critical_fields={"lot1": _cf(remise=FUTURE, heure="12h00", questions=FUTURE_Q)},
    )
    db_session.add(p)
    db_session.commit()

    resp = client.get("/api/projects/proj-c20/retroplanning")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ids = [s["id"] for s in body["steps"]]
    assert ids == ["questions", "depot_recommande", "deadline"]
