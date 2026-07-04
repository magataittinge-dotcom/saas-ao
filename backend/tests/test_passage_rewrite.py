"""
Tests C9b — réécriture IA ciblée par passage (éditeur mémoire).

  • POST /projects/{id}/memoire/rewrite-passage : réécrit le passage SEUL
    (Opus 4.7) et retourne {original, rewritten} — le mémoire en base n'est
    JAMAIS modifié par cet endpoint (accepter/rejeter = choix front).
  • Actions : reformuler / plus_technique / plus_concis / insister (saisie
    libre obligatoire pour insister).
  • Usage loggé par org (compteur simple, pas de quota V1).
"""
import pytest

from models.memoire import MemoireTechnique
from models.project import Project


CONTENT = {"preambule": "Texte original du préambule.", "partie_a": {}, "partie_b": {}, "partie_c": {}}


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


@pytest.fixture
def project_with_memoire(db_session, test_org):
    p = Project(id="proj-c9b", organization_id=test_org.id, name="AO C9b")
    db_session.add(p)
    db_session.add(MemoireTechnique(project_id="proj-c9b", content_json=dict(CONTENT)))
    db_session.commit()
    return p


def _mock_opus(monkeypatch, result="Passage réécrit plus techniquement."):
    import services.ai.passage_rewriter as pr
    calls = {"n": 0, "kwargs": None}

    def fake(passage, action, instruction):
        calls["n"] += 1
        calls["kwargs"] = {"passage": passage, "action": action, "instruction": instruction}
        return result
    monkeypatch.setattr(pr, "_call_opus", fake)
    return calls


# ─── Réécriture du passage seul ──────────────────────────────────────────────

def test_rewrite_returns_passage_memoire_untouched(
    client, db_session, test_org, project_with_memoire, monkeypatch,
):
    calls = _mock_opus(monkeypatch)

    resp = client.post("/api/projects/proj-c9b/memoire/rewrite-passage", json={
        "passage": "Texte original du préambule.",
        "action": "plus_technique",
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["original"] == "Texte original du préambule."
    assert body["rewritten"] == "Passage réécrit plus techniquement."
    assert calls["n"] == 1
    assert calls["kwargs"]["action"] == "plus_technique"

    # Le mémoire en base est INTACT (accepter/rejeter = décision front).
    db_session.expire_all()
    memoire = db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-c9b",
    ).first()
    assert memoire.content_json == CONTENT


def test_insister_requires_instruction(client, db_session, test_org, project_with_memoire, monkeypatch):
    _mock_opus(monkeypatch)

    resp = client.post("/api/projects/proj-c9b/memoire/rewrite-passage", json={
        "passage": "Texte.", "action": "insister",
    })
    assert resp.status_code == 422

    resp2 = client.post("/api/projects/proj-c9b/memoire/rewrite-passage", json={
        "passage": "Texte original.", "action": "insister",
        "instruction": "la sécurité des compagnons",
    })
    assert resp2.status_code == 200


def test_invalid_action_rejected(client, db_session, test_org, project_with_memoire, monkeypatch):
    _mock_opus(monkeypatch)
    resp = client.post("/api/projects/proj-c9b/memoire/rewrite-passage", json={
        "passage": "Texte.", "action": "faire_du_cafe",
    })
    assert resp.status_code == 422


def test_empty_or_oversize_passage_rejected(client, db_session, test_org, project_with_memoire, monkeypatch):
    _mock_opus(monkeypatch)
    assert client.post("/api/projects/proj-c9b/memoire/rewrite-passage", json={
        "passage": "  ", "action": "reformuler",
    }).status_code == 422
    assert client.post("/api/projects/proj-c9b/memoire/rewrite-passage", json={
        "passage": "x" * 6001, "action": "reformuler",
    }).status_code == 422


def test_usage_logged_per_org(client, db_session, test_org, project_with_memoire, monkeypatch):
    from models.audit_log import AuditLog
    _mock_opus(monkeypatch)

    client.post("/api/projects/proj-c9b/memoire/rewrite-passage", json={
        "passage": "Texte original.", "action": "plus_concis",
    })
    logs = db_session.query(AuditLog).filter(
        AuditLog.organization_id == test_org.id,
        AuditLog.action == "memoire.rewrite_passage",
    ).all()
    assert len(logs) == 1


def test_cross_org_404(client, db_session, test_org, monkeypatch):
    from models.organization import Organization
    _mock_opus(monkeypatch)
    db_session.add(Organization(id="org-c9b-other", name="Autre"))
    db_session.flush()
    db_session.add(Project(id="proj-c9b-other", organization_id="org-c9b-other", name="X"))
    db_session.commit()

    resp = client.post("/api/projects/proj-c9b-other/memoire/rewrite-passage", json={
        "passage": "Texte.", "action": "reformuler",
    })
    assert resp.status_code == 404
