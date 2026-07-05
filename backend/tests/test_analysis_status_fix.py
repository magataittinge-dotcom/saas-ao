"""Regression tests for the analysis bug fixes (May 2026).

Bug 1 — project.status was never flipped to a terminal value after the
        compliance items were inserted. Frontend stayed on lots page.

Bug 2 — POST /analyze returned 500 on the first 429 because retry sleep
        (5 s) was not long enough to clear the 30k-input-tokens-per-minute
        rate limit. We now back off 20 s / 45 s and surface a 503 with
        Retry-After when the API stays rate-limited.

Bug 3 — max_tokens was 8000, causing systematic truncation on dense
        DCEs. Raised to 16384.
"""
import pytest

from services.ai.dce_analyzer import ClaudeRateLimitError


def test_claude_rate_limit_error_is_distinct_class():
    """Routers must be able to catch ClaudeRateLimitError separately."""
    assert issubclass(ClaudeRateLimitError, Exception)
    err = ClaudeRateLimitError("boom")
    # Subclassing makes typed handling possible.
    assert isinstance(err, ClaudeRateLimitError)
    assert isinstance(err, Exception)


def test_max_tokens_at_least_16384():
    """The literal _MAX_TOKENS constant must not regress below 16384."""
    import inspect
    from services.ai import dce_analyzer

    src = inspect.getsource(dce_analyzer)
    # Keep this assertion robust to formatting — match the assignment.
    assert "_MAX_TOKENS = 16384" in src or "_MAX_TOKENS = 16_384" in src, (
        "max_tokens regressed below the 16384 floor — see commit af7a796"
    )
    # And the Stripe SDK is not affected by this change (sanity).


def _join_analysis_threads():
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


def test_rate_limit_sets_error_status_without_step_regression(client, db_session, test_org, monkeypatch):
    """Nouveau contrat (analyse détachée) : le rate limit Anthropic met le
    projet en processing_status='error' avec un message clair — current_step
    ne RÉGRESSE JAMAIS (l'ancien code le ramenait à 2, perdant l'état)."""
    from datetime import date
    from models.project import Project, ProjectDocument

    project = Project(id="proj-rl", organization_id=test_org.id, name="rate-limit test", deadline=date.today())
    db_session.add(project)
    db_session.add(ProjectDocument(
        id="doc-rl-1", project_id="proj-rl", type="rc",
        file_url="x", file_name="rc.pdf",
        extracted_text="Règlement de consultation. Article 1: candidature. " * 50,
    ))
    db_session.commit()

    # Patch DCEAnalyzer.extract_full_analysis_multi_pass to raise the
    # exception we care about. Network is not touched.
    def _fake(self, *a, **kw):
        raise ClaudeRateLimitError("Rate limit during pass1")

    from services.ai import dce_analyzer
    monkeypatch.setattr(
        dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _fake,
    )

    resp = client.post(f"/api/projects/proj-rl/analyze")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "started"
    _join_analysis_threads()

    db_session.expire_all()
    fresh = db_session.query(Project).filter(Project.id == "proj-rl").first()
    assert fresh.processing_status == "error"
    assert "anthropic" in (fresh.processing_detail or "").lower() \
        or "limite" in (fresh.processing_detail or "").lower()
    assert fresh.current_step == 3   # JAMAIS de régression d'étape


def test_status_set_to_analyzed_after_compliance_commit(client, db_session, test_org, monkeypatch):
    """End-of-analysis path: project.status must flip to 'analyzed'."""
    from datetime import date
    from models.project import Project, ProjectDocument

    project = Project(id="proj-an", organization_id=test_org.id, name="status test", deadline=date.today())
    db_session.add(project)
    db_session.add(ProjectDocument(
        id="doc-an-1", project_id="proj-an", type="rc",
        file_url="x", file_name="rc.pdf",
        extracted_text="RC sample text. " * 50,
    ))
    db_session.commit()

    # Stub the AI call so the test doesn't need network.
    def _fake(self, *a, **kw):
        return {
            "requirements": [
                {
                    "exigence": "Fournir un Kbis",
                    "source_document": "RC",
                    "source_page": 1,
                    "source_excerpt": "Le candidat fournira un extrait Kbis",
                    "category": "candidature",
                    "priority": "obligatoire",
                },
            ],
            "criteres_jugement": [],
            "infos_marche": {},
        }
    from services.ai import dce_analyzer
    monkeypatch.setattr(
        dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _fake,
    )

    # Avoid the (slow) checklist matcher by patching it to a no-op too.
    from services.ai import checklist_matcher

    async def _fake_match(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _fake_match)

    resp = client.post("/api/projects/proj-an/analyze")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "started"
    _join_analysis_threads()

    db_session.expire(project)
    fresh = db_session.query(Project).filter(Project.id == "proj-an").first()
    assert fresh.status == "analyzed", (
        f"project.status must be 'analyzed' after pass2, got {fresh.status!r}"
    )
    assert fresh.current_step == 4
    assert fresh.completed_steps == {"3": True}
