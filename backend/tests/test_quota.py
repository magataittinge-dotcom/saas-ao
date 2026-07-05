"""
Tests quotas mensuels (C1) — compteurs + enforcement.

Règles (PRD v3.0, vision V1 FINALE) :
  • Unité : 1 lot = 1 mémoire = 1 unité ; 1 analyse = 1 unité.
  • Pro    : 40 analyses + 40 mémoires / mois — dépassement → 402 + upgrade.
  • Business : illimité (fair-use), jamais bloqué.
  • Free   : 1 AO d'essai offert à la création (1 analyse + 1 mémoire, À VIE —
    pas de reset mensuel sur le plan free).
  • Décompte : 1 analyse AU LANCEMENT (même si l'analyse échoue ensuite) ;
    1 mémoire PAR LOT généré (au succès — un échec ne consomme pas).
  • Reset mensuel : fenêtre ancrée sur la date d'abonnement.
  • Blocage doux : 402 avec message d'upgrade explicite, jamais silencieux.
"""
import asyncio
from datetime import datetime, timedelta

import pytest

from models.organization import Organization
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _consume_n(db, org_id: str, kind: str, n: int, when: datetime = None):
    for _ in range(n):
        row = QuotaConsumption(organization_id=org_id, kind=kind)
        if when is not None:
            row.created_at = when
        db.add(row)
    db.commit()


def _make_analyzable_project(db, org_id: str, pid: str, lot: str = None) -> Project:
    p = Project(id=pid, organization_id=org_id, name=f"AO {pid}", selected_lot=lot)
    db.add(p)
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
        file_name="rc.pdf", extracted_text="Règlement de consultation : contenu test " * 20,
    ))
    db.commit()
    return p


@pytest.fixture
def no_rate_limit(monkeypatch):
    from main import app
    if hasattr(app.state, "limiter"):
        monkeypatch.setattr(app.state.limiter, "enabled", False, raising=False)


# ─── Fenêtre mensuelle ancrée sur la date d'abonnement ───────────────────────

def test_period_start_same_month_after_anniversary():
    from services.quota import current_period_start

    anchor = datetime(2026, 1, 15, 10, 0)
    now = datetime(2026, 7, 20, 8, 0)
    assert current_period_start(anchor, now) == datetime(2026, 7, 15, 10, 0)


def test_period_start_previous_month_before_anniversary():
    from services.quota import current_period_start

    anchor = datetime(2026, 1, 15, 10, 0)
    now = datetime(2026, 7, 10, 8, 0)
    assert current_period_start(anchor, now) == datetime(2026, 6, 15, 10, 0)


def test_period_start_clamps_end_of_month():
    """Ancre le 31 → en février l'anniversaire est ramené au dernier jour du
    mois (28) ; avant cet anniversaire, la période courante reste janvier."""
    from services.quota import current_period_start

    anchor = datetime(2026, 1, 31, 9, 0)
    # Après l'anniversaire clampé (28/02 09:00) → la fenêtre démarre le 28/02.
    assert current_period_start(anchor, datetime(2026, 2, 28, 12, 0)) == datetime(2026, 2, 28, 9, 0)
    # Avant l'anniversaire clampé → on est encore dans la fenêtre de janvier.
    assert current_period_start(anchor, datetime(2026, 2, 15, 12, 0)) == datetime(2026, 1, 31, 9, 0)


# ─── Statut / enforcement au niveau service ──────────────────────────────────

def test_pro_blocked_at_41st_analysis(db_session, test_org):
    from fastapi import HTTPException
    from services.quota import check_quota

    test_org.plan = "pro"
    db_session.commit()
    _consume_n(db_session, test_org.id, "analysis", 40)

    with pytest.raises(HTTPException) as exc:
        check_quota(db_session, test_org, "analysis")
    assert exc.value.status_code == 402
    assert "Business" in exc.value.detail  # message upgrade explicite


def test_pro_memoire_and_analysis_counters_are_independent(db_session, test_org):
    from services.quota import check_quota

    test_org.plan = "pro"
    db_session.commit()
    _consume_n(db_session, test_org.id, "analysis", 40)

    # 40 analyses consommées ne bloquent PAS les mémoires.
    check_quota(db_session, test_org, "memoire")


def test_pro_monthly_reset_anchored_on_subscription_date(db_session, test_org):
    """40 unités datées de la période précédente → la fenêtre courante est vide."""
    from services.quota import check_quota, get_quota_status

    test_org.plan = "pro"
    test_org.subscription_started_at = datetime.utcnow() - timedelta(days=65)
    db_session.commit()
    _consume_n(
        db_session, test_org.id, "analysis", 40,
        when=datetime.utcnow() - timedelta(days=40),  # période précédente
    )

    check_quota(db_session, test_org, "analysis")  # ne lève pas
    status = get_quota_status(db_session, test_org)
    assert status["analyses"]["used"] == 0
    assert status["analyses"]["limit"] == 40


def test_business_never_blocked(db_session, test_org):
    from services.quota import check_quota, get_quota_status

    test_org.plan = "business"
    db_session.commit()
    _consume_n(db_session, test_org.id, "analysis", 100)
    _consume_n(db_session, test_org.id, "memoire", 100)

    check_quota(db_session, test_org, "analysis")
    check_quota(db_session, test_org, "memoire")
    status = get_quota_status(db_session, test_org)
    assert status["analyses"]["limit"] is None  # illimité


def test_free_limited_to_one_ao_lifetime(db_session, test_org):
    """Free = 1 AO d'essai À VIE : une conso vieille de 2 mois compte encore."""
    from fastapi import HTTPException
    from services.quota import check_quota

    assert test_org.plan == "free"
    _consume_n(
        db_session, test_org.id, "analysis", 1,
        when=datetime.utcnow() - timedelta(days=60),
    )

    with pytest.raises(HTTPException) as exc:
        check_quota(db_session, test_org, "analysis")
    assert exc.value.status_code == 402
    assert "Pro" in exc.value.detail  # upgrade vers Pro


# ─── Endpoint analyse : décompte au lancement + 402 au dépassement ───────────

def test_analysis_402_when_pro_quota_exhausted(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    import routers.analysis as analysis_mod

    test_org.plan = "pro"
    db_session.commit()
    _consume_n(db_session, test_org.id, "analysis", 40)
    _make_analyzable_project(db_session, test_org.id, "proj-q1")

    def _must_not_be_called(*a, **k):
        raise AssertionError("l'analyzer ne doit pas être appelé quand le quota est épuisé")
    monkeypatch.setattr(analysis_mod.DCEAnalyzer, "__init__", _must_not_be_called)

    resp = client.post("/api/projects/proj-q1/analyze")
    assert resp.status_code == 402
    assert "quota" in resp.json()["detail"].lower()


def test_analysis_consumed_at_launch_even_if_it_fails(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    """« 1 analyse au lancement » : l'unité est décomptée même si l'analyse
    échoue ensuite (timeout Claude par ex.)."""
    import routers.analysis as analysis_mod

    test_org.plan = "pro"
    db_session.commit()
    _make_analyzable_project(db_session, test_org.id, "proj-q2")

    async def _boom(self, *a, **k):
        raise asyncio.TimeoutError()
    monkeypatch.setattr(
        analysis_mod.DCEAnalyzer, "extract_full_analysis_multi_pass", _boom,
    )

    # Nouveau contrat (analyse détachée) : POST → 200 "started" ; l'échec
    # arrive dans le job de fond, l'unité reste décomptée au lancement.
    resp = client.post("/api/projects/proj-q2/analyze")
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)
    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "analysis",
    ).count()
    assert used == 1


# ─── Endpoint mémoire : 1 unité PAR LOT généré, au succès ────────────────────

_DUMMY_CONTENT = {"preambule": "test", "partie_a": {}, "partie_b": {}, "partie_c": {}}


def _mock_generator_success(monkeypatch):
    import routers.memoire as memoire_mod

    async def _fake_generate(self, **kwargs):
        return _DUMMY_CONTENT
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _fake_generate)


def test_memoire_counts_one_unit_per_lot(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    _mock_generator_success(monkeypatch)
    test_org.plan = "pro"
    db_session.commit()
    project = _make_analyzable_project(db_session, test_org.id, "proj-q3", lot="lot1")

    resp1 = client.post("/api/projects/proj-q3/memoire/generate", json={})
    assert resp1.status_code == 200, resp1.text

    # Deuxième lot du même AO → 2e unité.
    project.selected_lot = "lot2"
    db_session.commit()
    resp2 = client.post("/api/projects/proj-q3/memoire/generate", json={})
    assert resp2.status_code == 200, resp2.text

    rows = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).all()
    assert len(rows) == 2
    assert sorted(r.lot for r in rows) == ["lot1", "lot2"]


def test_memoire_402_when_pro_quota_exhausted(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    _mock_generator_success(monkeypatch)
    test_org.plan = "pro"
    db_session.commit()
    _consume_n(db_session, test_org.id, "memoire", 40)
    _make_analyzable_project(db_session, test_org.id, "proj-q4", lot="lot1")

    resp = client.post("/api/projects/proj-q4/memoire/generate", json={})
    assert resp.status_code == 402
    assert "quota" in resp.json()["detail"].lower()


def test_memoire_failure_does_not_consume(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    import routers.memoire as memoire_mod

    test_org.plan = "pro"
    db_session.commit()
    _make_analyzable_project(db_session, test_org.id, "proj-q5", lot="lot1")

    async def _boom(self, **kwargs):
        raise RuntimeError("claude down")
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _boom)

    resp = client.post("/api/projects/proj-q5/memoire/generate", json={})
    assert resp.status_code == 500
    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).count()
    assert used == 0


def test_business_generates_beyond_40(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    _mock_generator_success(monkeypatch)
    test_org.plan = "business"
    db_session.commit()
    _consume_n(db_session, test_org.id, "memoire", 40)
    _make_analyzable_project(db_session, test_org.id, "proj-q6", lot="lot1")

    resp = client.post("/api/projects/proj-q6/memoire/generate", json={})
    assert resp.status_code == 200, resp.text
