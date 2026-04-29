"""Phase 3 quick-win endpoints — expiring vault docs + Go/No-Go scoring."""
from datetime import date, timedelta

from models.document import Document
from models.project import Project
from models.reference import Reference
from models.checklist_item import ChecklistItem
from models.memoire import MemoireTechnique


# ─── /api/documents/expiring-soon ────────────────────────────────────────────

def test_expiring_soon_empty(client):
    resp = client.get("/api/documents/expiring-soon")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 0
    assert body["items"] == []


def test_expiring_soon_includes_expired_and_soon(client, db_session, test_org):
    today = date.today()
    db_session.add_all([
        Document(id="d1", organization_id=test_org.id, type="urssaf",
                 file_url="x", file_name="urssaf.pdf",
                 status="valid", expiry_date=today + timedelta(days=180)),  # too far
        Document(id="d2", organization_id=test_org.id, type="kbis",
                 file_url="y", file_name="kbis.pdf",
                 status="expiring_soon", expiry_date=today + timedelta(days=10)),
        Document(id="d3", organization_id=test_org.id, type="decennale",
                 file_url="z", file_name="dec.pdf",
                 status="expired", expiry_date=today - timedelta(days=5)),
    ])
    db_session.commit()

    resp = client.get("/api/documents/expiring-soon?days=30")
    body = resp.json()
    ids = [i["id"] for i in body["items"]]
    assert body["count"] == 2
    assert "d2" in ids and "d3" in ids
    assert "d1" not in ids
    # Order: expired first (most negative days_left).
    assert body["items"][0]["id"] == "d3"


def test_expiring_soon_excludes_soft_deleted(client, db_session, test_org):
    from datetime import datetime as _dt
    db_session.add(Document(
        id="dgone", organization_id=test_org.id, type="urssaf",
        file_url="x", file_name="x.pdf", status="expired",
        expiry_date=date.today() - timedelta(days=2),
        deleted_at=_dt.utcnow(),
    ))
    db_session.commit()

    resp = client.get("/api/documents/expiring-soon")
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


# ─── /api/projects/{id}/go-no-go ─────────────────────────────────────────────

def test_go_no_go_empty_project_low_score(client, db_session, test_org):
    p = Project(id="proj-empty", organization_id=test_org.id, name="empty",
                deadline=date.today() + timedelta(days=20))
    db_session.add(p)
    db_session.commit()

    resp = client.get(f"/api/projects/{p.id}/go-no-go")
    assert resp.status_code == 200
    body = resp.json()
    assert "score" in body and 0 <= body["score"] <= 100
    assert body["verdict"] in {"GO", "GO modéré", "À RISQUE", "NO-GO"}
    assert "breakdown" in body and "temps" in body["breakdown"]


def test_go_no_go_full_project_high_score(client, db_session, test_org):
    p = Project(
        id="proj-full", organization_id=test_org.id, name="ITE école Bordeaux",
        deadline=date.today() + timedelta(days=20),
        selected_lot_name="Lot 5 — Façade ITE",
        dpgf_remplie_url="/uploads/projects/proj-full/dpgf_remplie/x.xlsx",
        dpgf_remplie_check={"valid": True},
    )
    db_session.add(p)
    db_session.add_all([
        Reference(id=f"ref-{i}", organization_id=test_org.id,
                  intitule=f"ITE bâtiment {i}", lot="façade ITE", annee=2024,
                  is_reference=True)
        for i in range(4)
    ])
    db_session.add_all([
        ChecklistItem(id=f"ci-{i}", project_id="proj-full",
                      document_type_required=f"piece_{i}", status="present",
                      source_kind="vault")
        for i in range(5)
    ])
    db_session.add(MemoireTechnique(
        id="mem-full", project_id="proj-full",
        content_json={"preambule": "x", "partie_a": "x", "partie_b": "x", "partie_c": "x"},
        version=1,
    ))
    db_session.commit()

    resp = client.get(f"/api/projects/{p.id}/go-no-go")
    body = resp.json()
    assert body["score"] >= 80
    assert body["verdict"] == "GO"


def test_go_no_go_blocks_cross_org(client, db_session):
    # The shared client is bound to test_user (org-test-1). Projects belonging
    # to another org must not be reachable.
    from models.organization import Organization
    other = Organization(id="org-other", name="Other")
    db_session.add(other)
    db_session.add(Project(id="proj-other", organization_id="org-other", name="X"))
    db_session.commit()

    resp = client.get("/api/projects/proj-other/go-no-go")
    assert resp.status_code == 404
