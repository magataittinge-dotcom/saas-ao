"""Audit log smoke tests.

The audit_logger.log_action helper should never raise (a failed audit row
must never break a user-facing request) but should write a row in the
common path.
"""
import pytest

from models.audit_log import AuditLog
from services.audit_logger import log_action


def test_log_action_inserts_row(db_session, test_user):
    log_action(
        db_session,
        test_user,
        "test.action",
        target_type="thing",
        target_id="abc-123",
        extra={"foo": "bar"},
    )
    rows = db_session.query(AuditLog).all()
    assert len(rows) == 1
    row = rows[0]
    assert row.action == "test.action"
    assert row.user_id == test_user.id
    assert row.organization_id == test_user.organization_id
    assert row.extra == {"foo": "bar"}


def test_log_action_truncates_huge_extra(db_session, test_user):
    huge_payload = {f"k{i}": "x" * 1000 for i in range(20)}  # ~20 KB
    log_action(db_session, test_user, "test.huge", extra=huge_payload)
    row = db_session.query(AuditLog).first()
    assert row.extra is not None
    assert row.extra.get("_truncated") is True


def test_log_action_swallows_invalid_payload(db_session, test_user):
    class Unserializable:
        def __repr__(self):
            return "weird"

    # Even passing a non-serialisable object should not raise.
    log_action(db_session, test_user, "test.bad", extra={"x": Unserializable()})
    # The function should still create a row (with a fallback marker).
    rows = db_session.query(AuditLog).all()
    assert len(rows) == 1


def test_log_action_with_no_user(db_session):
    """System actions (cron, webhook) have no user — must still log."""
    log_action(db_session, None, "system.cron",
               organization_id=None, extra={"job": "cleanup"})
    row = db_session.query(AuditLog).first()
    assert row is not None
    assert row.user_id is None
    assert row.action == "system.cron"


# Wired audit log on real endpoints
def test_project_delete_writes_audit_row(client, db_session, test_org):
    from models.project import Project
    p = Project(id="proj-audit", organization_id=test_org.id, name="Test")
    db_session.add(p)
    db_session.commit()

    resp = client.delete(f"/api/projects/{p.id}")
    assert resp.status_code == 204

    rows = db_session.query(AuditLog).filter(AuditLog.action == "project.delete").all()
    assert len(rows) == 1
    assert rows[0].target_id == "proj-audit"


def test_project_restore_writes_audit_row(client, db_session, test_org):
    from datetime import datetime
    from models.project import Project
    p = Project(id="proj-rst", organization_id=test_org.id, name="To restore",
                deleted_at=datetime.utcnow())
    db_session.add(p)
    db_session.commit()

    resp = client.post(f"/api/projects/{p.id}/restore")
    assert resp.status_code == 200
    assert resp.json()["id"] == "proj-rst"

    rows = db_session.query(AuditLog).filter(AuditLog.action == "project.restore").all()
    assert len(rows) == 1
