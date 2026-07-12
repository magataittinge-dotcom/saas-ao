"""T3b — intégrité RGPD (R6) + robustesse extraction ZIP (R9).

R6 : la suppression de compte oubliait QuotaConsumption + Notification
     (FK vers organizations → 500 sur Postgres pour toute org active) et
     ne purgeait pas les fichiers disque. Fix : suppression complète +
     rmtree des uploads.
"""
from datetime import date

from models.notification import Notification
from models.organization import Organization
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption
from services.file_storage import UPLOADS_ROOT


def test_rgpd_delete_purges_quota_notifications_and_files(client, db_session, test_org):
    org_id = test_org.id
    db_session.add(Project(id="p-rgpd", organization_id=org_id, name="X", deadline=date.today()))
    db_session.add(ProjectDocument(project_id="p-rgpd", type="rc", file_url="x", file_name="rc.pdf"))
    db_session.add(QuotaConsumption(organization_id=org_id, kind="analysis", project_id="p-rgpd", lot="all"))
    db_session.add(Notification(organization_id=org_id, type="analysis_ready", titre="Analyse terminée"))
    db_session.commit()

    # fichier disque réel sous le répertoire du projet
    proj_dir = UPLOADS_ROOT / "projects" / "p-rgpd"
    proj_dir.mkdir(parents=True, exist_ok=True)
    f = proj_dir / "secret.pdf"
    f.write_bytes(b"donnees personnelles")
    assert f.exists()

    resp = client.delete("/api/users/me")
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    # données personnelles purgées : org, quota, notifications, projet
    assert db_session.query(QuotaConsumption).filter_by(organization_id=org_id).count() == 0
    assert db_session.query(Notification).filter_by(organization_id=org_id).count() == 0
    assert db_session.query(Project).filter_by(organization_id=org_id).count() == 0
    assert db_session.query(Organization).filter_by(id=org_id).first() is None
    # fichiers disque purgés
    assert not f.exists()
    assert not proj_dir.exists()


def test_zip_extraction_failure_sets_error_not_stuck(client, db_session, test_org, monkeypatch):
    """R9 — un échec NON-HTTP (MemoryError…) pendant l'extraction ZIP repasse
    le projet en 'error' (relançable), plus jamais coincé 'extracting_zip'."""
    import routers.projects as pj

    db_session.add(Project(id="p-zip", organization_id=test_org.id, name="Z", deadline=date.today()))
    db_session.commit()

    async def _boom(*a, **k):
        raise MemoryError("archive imbriquée trop grosse")
    monkeypatch.setattr(pj, "_handle_zip_upload", _boom)

    files = {"file": ("dce.zip", b"PK\x03\x04fake-zip", "application/zip")}
    resp = client.post("/api/projects/p-zip/documents", files=files)
    assert resp.status_code == 500, resp.text

    db_session.expire_all()
    p = db_session.get(Project, "p-zip")
    assert p.processing_status == "error", f"coincé sur {p.processing_status!r}"
