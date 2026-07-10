"""
Tests quotas mensuels (C1) — compteurs + enforcement.

Règles (PRD v3.0, vision V1 FINALE) :
  • Unité : 1 lot = 1 mémoire = 1 unité ; 1 analyse = 1 unité.
  • Pro    : 40 analyses + 40 mémoires / mois — dépassement → 402 + upgrade.
  • Business : illimité (fair-use), jamais bloqué.
  • Free   : 1 AO d'essai offert à la création (1 analyse + 1 mémoire, À VIE —
    pas de reset mensuel sur le plan free).
  • Décompte : 1 analyse AU LANCEMENT, REMBOURSÉE sur échec TECHNIQUE
    (panne API/5xx/crédit — pas si le DCE ne donne rien) ; 1 mémoire PAR LOT
    généré, AU SUCCÈS (échec ou contenu 100 % placeholder ne consomme pas).
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


def _join_analysis():
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


def test_multilot_402_free_has_upgrade_cta_and_no_monthly_wording(
    client, db_session, test_org, no_rate_limit,
):
    """Audit #10 — le pré-check multi-lots court-circuitait check_quota :
    message sans CTA upgrade et « ce mois » faux en plan free (essai à vie)."""
    _make_analyzable_project(db_session, test_org.id, "proj-q402a")

    resp = client.post("/api/projects/proj-q402a/analyze",
                       json={"lots": ["lot1", "lot2"]})
    assert resp.status_code == 402
    detail = resp.json()["detail"]
    assert "Pro" in detail            # CTA upgrade explicite
    assert "essai" in detail          # libellé free correct
    assert "ce mois" not in detail    # pas de fenêtre mensuelle en essai


def test_multilot_402_pro_points_to_business(
    client, db_session, test_org, no_rate_limit,
):
    test_org.plan = "pro"
    db_session.commit()
    _consume_n(db_session, test_org.id, "analysis", 39)
    _make_analyzable_project(db_session, test_org.id, "proj-q402b")

    resp = client.post("/api/projects/proj-q402b/analyze",
                       json={"lots": ["lot1", "lot2"]})
    assert resp.status_code == 402
    detail = resp.json()["detail"]
    assert "Business" in detail
    assert "1 analyse(s) restante(s)" in detail


def test_analysis_technical_failure_refunds_unit(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    """Échec TECHNIQUE (panne API/5xx/crédit épuisé) → l'unité décomptée au
    lancement est REMBOURSÉE : la relance ne re-paie pas."""
    from services.ai import dce_analyzer

    test_org.plan = "pro"
    db_session.commit()
    _make_analyzable_project(db_session, test_org.id, "proj-q2")

    def _boom(self, *a, **kw):
        raise RuntimeError("Erreur API Claude (status 500): credit balance too low")
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _boom)

    resp = client.post("/api/projects/proj-q2/analyze")
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"
    _join_analysis()
    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "analysis",
    ).count()
    assert used == 0


def test_analysis_partial_failure_refunds_only_failed_lot(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    """2 lots : lot1 réussit, lot2 tombe en panne API → seule l'unité du
    lot2 est remboursée (le lot1 livré reste dû)."""
    from datetime import date
    from services.ai import dce_analyzer, checklist_matcher

    test_org.plan = "pro"
    db_session.commit()
    p = Project(id="proj-q2b", organization_id=test_org.id, name="X",
                deadline=date.today(),
                lots_detectes=[{"id": "lot1", "nom": "Lot 01 — GO"},
                               {"id": "lot2", "nom": "Lot 02 — Étanchéité"}])
    db_session.add(p)
    db_session.add(ProjectDocument(
        project_id="proj-q2b", type="rc", file_url="x", file_name="rc.pdf",
        extracted_text="Règlement. Candidature. " * 40))
    db_session.add(ProjectDocument(
        project_id="proj-q2b", type="cctp", file_url="x", file_name="cctp lot 01.pdf",
        extracted_text="CCTP lot 1. " * 40, related_lots=["1"]))
    db_session.add(ProjectDocument(
        project_id="proj-q2b", type="cctp", file_url="x", file_name="cctp lot 02.pdf",
        extracted_text="CCTP lot 2. " * 40, related_lots=["2"]))
    db_session.commit()

    _REQ = {"exigence": "Fournir DC1", "source_document": "RC", "source_page": 1,
            "source_excerpt": "Candidature.", "category": "candidature",
            "priority": "obligatoire"}

    def _pass(self, pass_text, system_prompt, label, *a, **kw):
        if "lot2" in label:
            raise RuntimeError("Erreur API Claude (status 529): overloaded")
        return {"requirements": [dict(_REQ)], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _pass)

    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)

    resp = client.post("/api/projects/proj-q2b/analyze", json={"lots": ["lot1", "lot2"]})
    assert resp.status_code == 200, resp.text
    _join_analysis()

    rows = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "analysis",
    ).all()
    assert len(rows) == 1
    assert rows[0].lot == "lot1"


def test_analysis_no_requirements_not_refunded(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    """Frontière : l'IA a tourné sans erreur mais le DCE n'a rien donné
    (no_requirements) → PAS un échec technique, l'unité reste décomptée."""
    from services.ai import dce_analyzer

    test_org.plan = "pro"
    db_session.commit()
    _make_analyzable_project(db_session, test_org.id, "proj-q2c")

    def _empty(self, *a, **kw):
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _empty)

    resp = client.post("/api/projects/proj-q2c/analyze")
    assert resp.status_code == 200
    _join_analysis()
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


def _join_memoire():
    """Génération détachée : attendre la fin du job avant les asserts."""
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)


def test_memoire_counts_one_unit_per_lot(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    _mock_generator_success(monkeypatch)
    test_org.plan = "pro"
    db_session.commit()
    project = _make_analyzable_project(db_session, test_org.id, "proj-q3", lot="lot1")

    resp1 = client.post("/api/projects/proj-q3/memoire/generate", json={})
    assert resp1.status_code == 200, resp1.text
    _join_memoire()

    # Deuxième lot du même AO → 2e unité.
    project.selected_lot = "lot2"
    db_session.commit()
    resp2 = client.post("/api/projects/proj-q3/memoire/generate", json={})
    assert resp2.status_code == 200, resp2.text
    _join_memoire()

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

    # Contrat détaché : POST → "started", l'échec arrive dans le job de fond
    # → statut error, et surtout AUCUNE unité consommée.
    resp = client.post("/api/projects/proj-q5/memoire/generate", json={})
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"
    _join_memoire()
    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).count()
    assert used == 0
    db_session.expire_all()
    from models.project import Project as _P
    assert db_session.get(_P, "proj-q5").processing_status == "error"


def test_memoire_all_placeholders_is_failure_not_consumed(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    """Crédit API épuisé en plein run → le générateur rend un contenu 100 %
    placeholders. C'est un ÉCHEC : pas de mémoire fantôme en base, 0 unité
    consommée, statut error (constat de l'audit Phase 2)."""
    import routers.memoire as memoire_mod
    from models.memoire import MemoireTechnique

    test_org.plan = "pro"
    db_session.commit()
    _make_analyzable_project(db_session, test_org.id, "proj-q7", lot="lot1")

    _ALL_PLACEHOLDER = {
        "preambule": "[SECTION À RÉGÉNÉRER : preambule]",
        "partie_a": {"implantation": "[SECTION À RÉGÉNÉRER : partie_a.implantation]"},
        "partie_b": {},
        "partie_c": {},
        "_generation_meta": {"warnings": ["preambule", "partie_a.implantation"]},
    }

    async def _empty(self, **kwargs):
        return dict(_ALL_PLACEHOLDER)
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _empty)

    resp = client.post("/api/projects/proj-q7/memoire/generate", json={})
    assert resp.status_code == 200
    _join_memoire()

    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).count()
    assert used == 0
    assert db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-q7").first() is None
    db_session.expire_all()
    from models.project import Project as _P
    assert db_session.get(_P, "proj-q7").processing_status == "error"


def test_memoire_partial_content_is_consumed(
    client, db_session, test_org, no_rate_limit, monkeypatch,
):
    """Frontière : au moins UNE section réelle générée → c'est un succès
    partiel exploitable, l'unité est consommée et le mémoire persisté."""
    import routers.memoire as memoire_mod
    from models.memoire import MemoireTechnique

    test_org.plan = "pro"
    db_session.commit()
    _make_analyzable_project(db_session, test_org.id, "proj-q8", lot="lot1")

    _PARTIAL = {
        "preambule": "Notre entreprise intervient depuis 20 ans.",
        "partie_a": {"implantation": "[SECTION À RÉGÉNÉRER : partie_a.implantation]"},
        "partie_b": {},
        "partie_c": {},
    }

    async def _partial(self, **kwargs):
        return dict(_PARTIAL)
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _partial)

    resp = client.post("/api/projects/proj-q8/memoire/generate", json={})
    assert resp.status_code == 200
    _join_memoire()

    used = db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id,
        QuotaConsumption.kind == "memoire",
    ).count()
    assert used == 1
    assert db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-q8").first() is not None


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
    _join_memoire()
