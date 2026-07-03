"""
Tests C3+C4 — nombre de lots annoncé (déterministe) + filet IA sur échec objectif.

Règles :
  • lots_announced : extrait du RC par regex (« divisé en X lots », tableau
    d'allotissement) — 0 € API.
  • Le filet IA (UN SEUL appel Sonnet) se déclenche STRICTEMENT si :
      - zéro lot détecté alors que le DCE mentionne un allotissement, OU
      - écart détectés vs annoncés, OU
      - lot sans libellé (nom vide ou générique « Lot N »).
    Sinon ZÉRO appel IA.
  • Les lots issus du filet portent source "ia_fallback".
  • Jamais de lot sans libellé en sortie (anomalie loggée, pas affichée).
"""
import pytest

from models.project import Project, ProjectDocument


RC_13_LOTS = """
REGLEMENT DE LA CONSULTATION
Article 3 — Allotissement
Le marché est divisé en 13 lots, attribués séparément.
Lot 1 — Gros œuvre
Lot 2 — Charpente
"""

RC_SANS_ANNONCE = """
CCTP Lot 3 : Plomberie sanitaire
Les travaux comprennent la pose des équipements.
"""


# ─── Extraction déterministe du nombre annoncé ───────────────────────────────

def test_extract_announced_count_divise_en():
    from services.lot_detector import extract_announced_lot_count

    assert extract_announced_lot_count(RC_13_LOTS) == 13
    assert extract_announced_lot_count("Le marché est alloti en 5 lots.") == 5
    assert extract_announced_lot_count("décomposé en 7 lots séparés") == 7
    assert extract_announced_lot_count("La consultation comporte 8 lots.") == 8
    assert extract_announced_lot_count("réparti en 2 lots distincts") == 2


def test_extract_announced_count_none_when_absent():
    from services.lot_detector import extract_announced_lot_count

    assert extract_announced_lot_count(RC_SANS_ANNONCE) is None
    assert extract_announced_lot_count("") is None
    assert extract_announced_lot_count("Le lot 4 concerne l'électricité.") is None


def test_extract_announced_count_bounds():
    from services.lot_detector import extract_announced_lot_count

    # 0 lots ou valeurs délirantes → ignorées
    assert extract_announced_lot_count("divisé en 0 lots") is None
    assert extract_announced_lot_count("divisé en 99 lots") is None


# ─── Déclencheur du filet (strict) ───────────────────────────────────────────

def _lot(id_, nom, sources=None, confidence=80):
    return {"id": id_, "nom": nom, "confidence": confidence,
            "sources": sources or ["rc_text"]}


def test_trigger_zero_lots_but_allotissement_mentioned():
    from services.ai.lot_fallback import should_trigger

    triggered, reason = should_trigger([], announced=None, mentions_allotissement=True)
    assert triggered
    assert "aucun lot" in reason.lower()


def test_no_trigger_zero_lots_no_allotissement():
    """DCE mono-lot sans allotissement → pas de filet."""
    from services.ai.lot_fallback import should_trigger

    triggered, _ = should_trigger([], announced=None, mentions_allotissement=False)
    assert not triggered


def test_trigger_count_mismatch():
    from services.ai.lot_fallback import should_trigger

    detected = [_lot(f"lot{i}", f"Lot {i} — Corps d'état {i}") for i in range(1, 10)]
    triggered, reason = should_trigger(detected, announced=13, mentions_allotissement=True)
    assert triggered
    assert "13" in reason and "9" in reason


def test_trigger_generic_label():
    from services.ai.lot_fallback import should_trigger

    detected = [_lot("lot1", "Lot 1 — Gros œuvre"), _lot("lot6", "Lot 6")]
    triggered, reason = should_trigger(detected, announced=2, mentions_allotissement=True)
    assert triggered
    assert "libellé" in reason.lower()


def test_no_trigger_clean_dce():
    """DCE propre (type Gueux) : compte exact + tous les libellés → ZÉRO IA."""
    from services.ai.lot_fallback import should_trigger

    detected = [
        _lot("lot1", "Lot 1 — Gros œuvre"),
        _lot("lot2", "Lot 2 — Charpente bois"),
        _lot("lot3", "Lot 3 — Couverture"),
    ]
    triggered, _ = should_trigger(detected, announced=3, mentions_allotissement=True)
    assert not triggered


def test_no_trigger_no_announcement_and_labeled():
    from services.ai.lot_fallback import should_trigger

    detected = [_lot("lot1", "Lot 1 — Démolition"), _lot("lot2", "Lot 2 — Maçonnerie")]
    triggered, _ = should_trigger(detected, announced=None, mentions_allotissement=True)
    assert not triggered


# ─── Orchestration : zéro ou UN appel IA ─────────────────────────────────────

def test_clean_dce_makes_zero_ia_calls(monkeypatch):
    import services.ai.lot_fallback as lf

    def _must_not_call(*a, **k):
        raise AssertionError("appel Claude interdit sur un DCE propre")
    monkeypatch.setattr(lf, "_call_claude", _must_not_call)

    detected = [
        _lot("lot1", "Lot 1 — Gros œuvre"),
        _lot("lot2", "Lot 2 — Charpente"),
        _lot("lot3", "Lot 3 — Couverture"),
    ]
    lots, ia_used = lf.run_fallback_if_needed(
        {"RC.pdf": RC_13_LOTS.replace("13", "3")}, detected, announced=3,
    )
    assert ia_used is False
    assert lots == detected


def test_degraded_dce_triggers_exactly_one_ia_call(monkeypatch):
    """Annoncé 13, détectés 9 → UN appel, lots manquants ajoutés en ia_fallback."""
    import services.ai.lot_fallback as lf

    calls = {"n": 0}

    def fake_claude(excerpts, detected, announced):
        calls["n"] += 1
        return [
            {"id": "lot10", "nom": "Lot 10 — Peinture"},
            {"id": "lot11", "nom": "Lot 11 — Ascenseur"},
            {"id": "lot12", "nom": "Lot 12 — VRD"},
            {"id": "lot13", "nom": "Lot 13 — Espaces verts"},
        ]
    monkeypatch.setattr(lf, "_call_claude", fake_claude)

    detected = [_lot(f"lot{i}", f"Lot {i} — Corps d'état {i}") for i in range(1, 10)]
    lots, ia_used = lf.run_fallback_if_needed({"RC.pdf": RC_13_LOTS}, detected, announced=13)

    assert ia_used is True
    assert calls["n"] == 1
    assert len(lots) == 13
    added = [l for l in lots if "ia_fallback" in l["sources"]]
    assert {l["id"] for l in added} == {"lot10", "lot11", "lot12", "lot13"}
    assert all(l["nom"] for l in added)


def test_ia_fills_generic_label_keeps_id(monkeypatch):
    import services.ai.lot_fallback as lf

    monkeypatch.setattr(
        lf, "_call_claude",
        lambda e, d, a: [{"id": "lot6", "nom": "Lot 6 — Menuiseries extérieures"}],
    )

    detected = [_lot("lot1", "Lot 1 — Gros œuvre"), _lot("lot6", "Lot 6")]
    lots, ia_used = lf.run_fallback_if_needed({"RC.pdf": RC_13_LOTS}, detected, announced=2)

    assert ia_used is True
    lot6 = next(l for l in lots if l["id"] == "lot6")
    assert lot6["nom"] == "Lot 6 — Menuiseries extérieures"
    assert "ia_fallback" in lot6["sources"]
    assert len(lots) == 2  # pas de doublon créé


def test_ia_lot_without_label_never_displayed(monkeypatch, caplog):
    """Un lot IA sans libellé est loggé comme anomalie, jamais retourné."""
    import services.ai.lot_fallback as lf

    monkeypatch.setattr(
        lf, "_call_claude",
        lambda e, d, a: [
            {"id": "lot10", "nom": ""},                      # anomalie
            {"id": "lot11", "nom": "Lot 11 — Ascenseur"},    # ok
        ],
    )

    detected = [_lot(f"lot{i}", f"Lot {i} — CE {i}") for i in range(1, 10)]
    with caplog.at_level("WARNING"):
        lots, _ = lf.run_fallback_if_needed({"RC.pdf": RC_13_LOTS}, detected, announced=11)

    ids = {l["id"] for l in lots}
    assert "lot11" in ids
    assert "lot10" not in ids
    assert any("libellé" in r.message.lower() for r in caplog.records)


def test_ia_failure_degrades_gracefully(monkeypatch, caplog):
    """Claude down → on garde les lots regex, pas d'exception."""
    import services.ai.lot_fallback as lf

    def boom(*a, **k):
        raise RuntimeError("api down")
    monkeypatch.setattr(lf, "_call_claude", boom)

    detected = [_lot(f"lot{i}", f"Lot {i} — CE {i}") for i in range(1, 10)]
    with caplog.at_level("WARNING"):
        lots, ia_used = lf.run_fallback_if_needed({"RC.pdf": RC_13_LOTS}, detected, announced=13)
    assert ia_used is False
    assert lots == detected


def test_drop_unlabeled_final_guard(caplog):
    from services.ai.lot_fallback import drop_unlabeled

    lots = [_lot("lot1", "Lot 1 — Gros œuvre"), _lot("lot2", ""), _lot("lot3", "   ")]
    with caplog.at_level("WARNING"):
        out = drop_unlabeled(lots)
    assert [l["id"] for l in out] == ["lot1"]
    assert sum("libellé" in r.message.lower() for r in caplog.records) >= 1


# ─── Intégration background : lots_announced persisté + zéro IA si propre ────

def test_background_detection_stores_announced_and_skips_ia(
    db_session, test_org, monkeypatch,
):
    import routers.projects as projects_mod
    import services.ai.lot_fallback as lf

    project = Project(id="proj-lots-1", organization_id=test_org.id, name="AO lots")
    db_session.add(project)
    db_session.add(ProjectDocument(
        project_id="proj-lots-1", type="rc", file_url="/uploads/projects/proj-lots-1/rc.pdf",
        file_name="RC.pdf",
        extracted_text=RC_13_LOTS.replace("13", "2") + "\nLot 2 — Charpente bois",
    ))
    db_session.commit()

    clean_lots = [
        _lot("lot1", "Lot 1 — Gros œuvre"),
        _lot("lot2", "Lot 2 — Charpente bois"),
    ]
    monkeypatch.setattr(projects_mod.lot_detector, "detect", lambda *a, **k: list(clean_lots))

    def _must_not_call(*a, **k):
        raise AssertionError("aucun appel IA attendu")
    monkeypatch.setattr(lf, "_call_claude", _must_not_call)

    docs_data = [{
        "id": "d1", "file_name": "RC.pdf", "file_url": "/uploads/projects/proj-lots-1/rc.pdf",
        "extracted_text": RC_13_LOTS.replace("13", "2"), "type": "rc", "related_lots": None,
    }]
    projects_mod._run_lot_detection_background("proj-lots-1", docs_data, projects_mod.UPLOADS_ROOT)

    db_session.expire_all()
    refreshed = db_session.query(Project).filter(Project.id == "proj-lots-1").first()
    assert refreshed.lots_announced == 2
    assert len(refreshed.lots_detectes) == 2
    assert refreshed.processing_status == "ready"
