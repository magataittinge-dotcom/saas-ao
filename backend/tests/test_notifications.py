"""
Tests C23 — infrastructure notifications sobres (in-app + email).

  • Modèle + service d'émission avec dedup_key → idempotence (jamais de
    doublon si le job quotidien tourne 2×).
  • Types V1 : memoire_ready, deadline_j3, deadline_j1, doc_expiring,
    relance_30j.
  • Email SMTP via env vars ; SMTP absent → in-app seul + warning loggé,
    JAMAIS de crash.
"""
from datetime import date, datetime, timedelta

import pytest

from models.document import Document
from models.notification import Notification
from models.project import Project


# ─── Service d'émission + idempotence ────────────────────────────────────────

def test_notify_creates_notification(db_session, test_org):
    from services.notifications import notify

    n = notify(
        db_session, test_org.id, "memoire_ready",
        titre="Votre mémoire est prêt",
        corps="Le mémoire du lot 2 est généré.",
    )
    db_session.commit()
    assert n is not None
    row = db_session.query(Notification).one()
    assert row.type == "memoire_ready"
    assert row.read is False


def test_dedup_key_prevents_duplicates(db_session, test_org):
    from services.notifications import notify

    key = "deadline_j1:proj-1:2026-08-01"
    first = notify(db_session, test_org.id, "deadline_j1", titre="J-1", corps="x", dedup_key=key)
    db_session.commit()
    second = notify(db_session, test_org.id, "deadline_j1", titre="J-1", corps="x", dedup_key=key)
    db_session.commit()

    assert first is not None
    assert second is None
    assert db_session.query(Notification).count() == 1


def test_unknown_type_rejected(db_session, test_org):
    from services.notifications import notify

    with pytest.raises(ValueError):
        notify(db_session, test_org.id, "marketing_promo", titre="x", corps="y")


# ─── SMTP : dégradation propre ───────────────────────────────────────────────

def test_no_smtp_config_never_crashes(db_session, test_org, caplog):
    """SMTP absent → notification in-app créée, warning loggé, zéro crash."""
    from services.notifications import notify

    with caplog.at_level("WARNING"):
        n = notify(
            db_session, test_org.id, "memoire_ready",
            titre="Prêt", corps="x", send_email=True,
        )
    db_session.commit()
    assert n is not None
    assert any("SMTP" in r.message for r in caplog.records)


def test_smtp_configured_sends_email(db_session, test_org, test_user, monkeypatch):
    import services.notifications as notif_mod

    sent = {}

    def fake_send(to, subject, body):
        sent["to"] = to
        sent["subject"] = subject
    monkeypatch.setattr(notif_mod, "_smtp_configured", lambda: True)
    monkeypatch.setattr(notif_mod, "_send_email", fake_send)

    notif_mod.notify(
        db_session, test_org.id, "deadline_j1",
        titre="Échéance demain", corps="x", send_email=True,
    )
    db_session.commit()
    assert sent["to"] == ["test@synorix.fr"]
    assert "Échéance demain" in sent["subject"]


def test_smtp_failure_does_not_lose_notification(db_session, test_org, monkeypatch, caplog):
    import services.notifications as notif_mod

    monkeypatch.setattr(notif_mod, "_smtp_configured", lambda: True)

    def boom(*a, **k):
        raise ConnectionError("smtp down")
    monkeypatch.setattr(notif_mod, "_send_email", boom)

    with caplog.at_level("WARNING"):
        n = notif_mod.notify(
            db_session, test_org.id, "doc_expiring", titre="Doc expirant",
            corps="x", send_email=True,
        )
    db_session.commit()
    assert n is not None
    assert db_session.query(Notification).count() == 1


# ─── Scan quotidien : deadlines, docs expirants, relance ─────────────────────

def _project(db, org_id, pid, deadline=None, status="en_cours", updated_days_ago=None):
    p = Project(id=pid, organization_id=org_id, name=f"AO {pid}", status=status, deadline=deadline)
    db.add(p)
    db.commit()
    if updated_days_ago is not None:
        db.query(Project).filter(Project.id == pid).update(
            {"updated_at": datetime.utcnow() - timedelta(days=updated_days_ago)},
        )
        db.commit()
    return p


def test_daily_scan_deadline_j3_and_j1(db_session, test_org):
    from services.notifications import run_daily_scan

    _project(db_session, test_org.id, "p-j3", deadline=date.today() + timedelta(days=3))
    _project(db_session, test_org.id, "p-j1", deadline=date.today() + timedelta(days=1))
    _project(db_session, test_org.id, "p-far", deadline=date.today() + timedelta(days=15))

    run_daily_scan(db_session)

    types = {n.type for n in db_session.query(Notification).all()}
    assert "deadline_j3" in types
    assert "deadline_j1" in types
    bodies = " ".join(n.titre for n in db_session.query(Notification).all())
    assert "p-far" not in bodies


def test_daily_scan_idempotent(db_session, test_org):
    """Le job qui tourne 2× ne crée AUCUN doublon."""
    from services.notifications import run_daily_scan

    _project(db_session, test_org.id, "p-j1b", deadline=date.today() + timedelta(days=1))
    run_daily_scan(db_session)
    count_first = db_session.query(Notification).count()
    run_daily_scan(db_session)
    assert db_session.query(Notification).count() == count_first


def test_daily_scan_doc_expiring(db_session, test_org):
    from services.notifications import run_daily_scan

    db_session.add(Document(
        organization_id=test_org.id, type="urssaf",
        category="attestations_sociales_fiscales",
        file_url="/uploads/x.pdf", file_name="urssaf.pdf",
        expiry_date=date.today() + timedelta(days=10), status="expiring_soon",
    ))
    db_session.commit()

    run_daily_scan(db_session)
    notifs = db_session.query(Notification).filter(Notification.type == "doc_expiring").all()
    assert len(notifs) == 1
    assert "urssaf.pdf" in notifs[0].corps


def test_daily_scan_relance_30j_exactly_once(db_session, test_org):
    from services.notifications import run_daily_scan

    _project(db_session, test_org.id, "p-depose", status="soumis", updated_days_ago=31)
    run_daily_scan(db_session)
    run_daily_scan(db_session)

    notifs = db_session.query(Notification).filter(Notification.type == "relance_30j").all()
    assert len(notifs) == 1
    assert "déposé il y a 30 jours — avez-vous eu un retour ?" in notifs[0].corps
    assert "AO p-depose" in notifs[0].corps


def test_daily_scan_relance_not_before_30j(db_session, test_org):
    from services.notifications import run_daily_scan

    _project(db_session, test_org.id, "p-recent", status="soumis", updated_days_ago=10)
    run_daily_scan(db_session)
    assert db_session.query(Notification).filter(
        Notification.type == "relance_30j",
    ).count() == 0


# ─── Émission memoire_ready à la génération ──────────────────────────────────

def test_memoire_ready_emitted_on_generation(client, db_session, test_org, monkeypatch):
    import routers.memoire as memoire_mod
    from models.project import ProjectDocument

    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)

    async def _fake(self, **kwargs):
        return {"preambule": "x", "partie_a": {}, "partie_b": {}, "partie_c": {}}
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _fake)

    test_org.plan = "pro"
    db_session.add(Project(id="p-notif", organization_id=test_org.id, name="AO Gueux"))
    db_session.add(ProjectDocument(
        project_id="p-notif", type="rc", file_url="/uploads/x.pdf",
        file_name="rc.pdf", extracted_text="RC " * 30,
    ))
    db_session.commit()

    resp = client.post("/api/projects/p-notif/memoire/generate", json={})
    assert resp.status_code == 200, resp.text
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)

    notifs = db_session.query(Notification).filter(
        Notification.type == "memoire_ready",
    ).all()
    assert len(notifs) == 1


def test_analysis_ready_emitted_on_analysis_end(client, db_session, test_org, monkeypatch):
    """Audit #12 — le type « fin d'analyse » n'existait pas : memoire_ready
    avait sa notification, l'analyse (le run le plus long du produit) non."""
    from models.project import Project, ProjectDocument
    from services.ai import dce_analyzer, checklist_matcher

    test_org.plan = "pro"
    db_session.add(Project(id="p-notif-an", organization_id=test_org.id, name="AO Gueux"))
    db_session.add(ProjectDocument(
        project_id="p-notif-an", type="rc", file_url="x",
        file_name="rc.pdf", extracted_text="RC " * 30,
    ))
    db_session.commit()

    def _ok(self, *a, **kw):
        return {"requirements": [
            {"exigence": "Fournir un Kbis", "source_document": "RC", "source_page": 1,
             "source_excerpt": "x", "category": "candidature", "priority": "obligatoire"}],
            "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _ok)

    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)

    resp = client.post("/api/projects/p-notif-an/analyze")
    assert resp.status_code == 200, resp.text
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)

    notifs = db_session.query(Notification).filter(
        Notification.type == "analysis_ready",
    ).all()
    assert len(notifs) == 1
    assert "AO Gueux" in notifs[0].titre
    assert "exigence" in (notifs[0].corps or "")


# ─── Endpoints ───────────────────────────────────────────────────────────────

def test_list_and_mark_read(client, db_session, test_org):
    from services.notifications import notify

    notify(db_session, test_org.id, "memoire_ready", titre="A", corps="a")
    notify(db_session, test_org.id, "doc_expiring", titre="B", corps="b")
    db_session.commit()

    resp = client.get("/api/notifications")
    assert resp.status_code == 200
    body = resp.json()
    assert body["unread"] == 2
    assert len(body["items"]) == 2

    nid = body["items"][0]["id"]
    assert client.post(f"/api/notifications/{nid}/read").status_code == 200
    assert client.get("/api/notifications").json()["unread"] == 1

    assert client.post("/api/notifications/read-all").status_code == 200
    assert client.get("/api/notifications").json()["unread"] == 0


def test_notifications_org_isolation(client, db_session, test_org):
    from models.organization import Organization
    from services.notifications import notify

    db_session.add(Organization(id="org-notif-other", name="Autre"))
    db_session.flush()
    notify(db_session, "org-notif-other", "memoire_ready", titre="Secret", corps="x")
    db_session.commit()

    body = client.get("/api/notifications").json()
    assert body["unread"] == 0
    assert all(n["titre"] != "Secret" for n in body["items"])
