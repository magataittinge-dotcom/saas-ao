"""
Tests C14 — cycle de vie des statuts post-export + stats.

  Prêt (workflow) → Déposé/soumis (1 clic, date de dépôt) → Gagné / Perdu.
  Transitions invalides → 422 (gagné/perdu terminaux ; gagné direct sans
  dépôt interdit). « Analysé — sans suite » (B7) intégré : réouvrable.
  Relance 30 j basée sur la date de dépôt réelle (depose_at).
"""
from datetime import datetime, timedelta

import pytest

from models.notification import Notification
from models.project import Project


def _project(db, org_id, pid, status="analyzed"):
    p = Project(id=pid, organization_id=org_id, name=f"AO {pid}", status=status)
    db.add(p)
    db.commit()
    return p


def _patch_status(client, pid, status):
    return client.patch(f"/api/projects/{pid}", json={"status": status})


# ─── Transitions valides ─────────────────────────────────────────────────────

def test_depose_sets_date(client, db_session, test_org):
    _project(db_session, test_org.id, "p-c14a")

    resp = _patch_status(client, "p-c14a", "soumis")
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    p = db_session.query(Project).filter(Project.id == "p-c14a").first()
    assert p.status == "soumis"
    assert p.depose_at is not None
    assert (datetime.utcnow() - p.depose_at).total_seconds() < 60


def test_full_cycle_to_gagne(client, db_session, test_org):
    _project(db_session, test_org.id, "p-c14b")
    assert _patch_status(client, "p-c14b", "soumis").status_code == 200
    assert _patch_status(client, "p-c14b", "gagné").status_code == 200


def test_sans_suite_reopenable(client, db_session, test_org):
    _project(db_session, test_org.id, "p-c14c", status="sans_suite")
    assert _patch_status(client, "p-c14c", "en_cours").status_code == 200


# ─── Transitions invalides → 422 ─────────────────────────────────────────────

def test_gagne_requires_depot_first(client, db_session, test_org):
    _project(db_session, test_org.id, "p-c14d", status="analyzed")
    resp = _patch_status(client, "p-c14d", "gagné")
    assert resp.status_code == 422
    db_session.expire_all()
    assert db_session.query(Project).filter(Project.id == "p-c14d").first().status == "analyzed"


def test_terminal_statuses_locked(client, db_session, test_org):
    _project(db_session, test_org.id, "p-c14e", status="gagné")
    assert _patch_status(client, "p-c14e", "soumis").status_code == 422
    assert _patch_status(client, "p-c14e", "perdu").status_code == 422

    _project(db_session, test_org.id, "p-c14f", status="perdu")
    assert _patch_status(client, "p-c14f", "gagné").status_code == 422


def test_same_status_is_noop_allowed(client, db_session, test_org):
    _project(db_session, test_org.id, "p-c14g", status="analyzed")
    assert _patch_status(client, "p-c14g", "analyzed").status_code == 200


# ─── Stats : taux de réussite ────────────────────────────────────────────────

def test_stats_taux_reussite(client, db_session, test_org):
    _project(db_session, test_org.id, "p-w1", status="gagné")
    _project(db_session, test_org.id, "p-w2", status="gagné")
    _project(db_session, test_org.id, "p-l1", status="perdu")

    resp = client.get("/api/dashboard/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["taux_succes"] == 67  # 2 / 3


def test_stats_soumis_ce_mois_based_on_depose_at(client, db_session, test_org):
    """Audit #11 — un AO déposé ce mois puis GAGNÉ disparaissait du compteur
    « soumis ce mois » (comptage sur le statut courant, pas sur depose_at)."""
    from services.cache import org_cache

    # Déposés ce mois puis DÉCIDÉS (gagné/perdu) → doivent RESTER comptés.
    _project(db_session, test_org.id, "p-sm1")
    assert _patch_status(client, "p-sm1", "soumis").status_code == 200
    assert _patch_status(client, "p-sm1", "gagné").status_code == 200
    _project(db_session, test_org.id, "p-sm3")
    assert _patch_status(client, "p-sm3", "soumis").status_code == 200
    assert _patch_status(client, "p-sm3", "perdu").status_code == 200

    # Encore « soumis » mais déposé il y a 40 jours → hors compteur du mois
    # (l'ancienne règle le comptait, lui, et perdait les deux décidés).
    _project(db_session, test_org.id, "p-sm2", status="soumis")
    db_session.query(Project).filter(Project.id == "p-sm2").update(
        {"depose_at": datetime.utcnow() - timedelta(days=40)},
    )
    db_session.commit()

    org_cache.clear()
    body = client.get("/api/dashboard/stats").json()
    assert body["projects_soumis_ce_mois"] == 2


# ─── Relance 30 j : basée sur la date de dépôt réelle ────────────────────────

def test_relance_uses_depose_at(client, db_session, test_org):
    from services.notifications import run_daily_scan

    p = _project(db_session, test_org.id, "p-c14h")
    assert _patch_status(client, "p-c14h", "soumis").status_code == 200
    # Dépôt daté d'il y a 31 jours (updated_at récent : c'est bien depose_at qui compte)
    db_session.expire_all()
    db_session.query(Project).filter(Project.id == "p-c14h").update(
        {"depose_at": datetime.utcnow() - timedelta(days=31)},
    )
    db_session.commit()

    run_daily_scan(db_session)
    run_daily_scan(db_session)

    notifs = db_session.query(Notification).filter(
        Notification.type == "relance_30j",
    ).all()
    assert len(notifs) == 1
    assert "avez-vous eu un retour ?" in notifs[0].corps


def test_no_relance_when_freshly_deposed(client, db_session, test_org):
    from services.notifications import run_daily_scan

    _project(db_session, test_org.id, "p-c14i")
    assert _patch_status(client, "p-c14i", "soumis").status_code == 200

    run_daily_scan(db_session)
    assert db_session.query(Notification).filter(
        Notification.type == "relance_30j",
    ).count() == 0
