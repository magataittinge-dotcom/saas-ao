"""T2b — réconciliation des runs orphelins (R5) + anti double-run mémoire (R3).

Un run laissé 'analyzing'/'generating' par un crash process est, au
démarrage : (analyse) remboursé exactement via active_run_consumptions +
rouvert ; (mémoire) simplement rouvert (rien n'est consommé au lancement).
Et une génération déjà en cours → 409 atomique.
"""
import json
from datetime import date

from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption
from services import quota
from services.run_reconciliation import reconcile_orphan_runs


def test_reconcile_analysis_orphan_refunds_and_reopens(db_session, test_org):
    row = quota.consume(db_session, test_org, "analysis", project_id="p-orph", lot="all")
    db_session.flush()
    cid = row.id
    db_session.add(Project(
        id="p-orph", organization_id=test_org.id, name="X", deadline=date.today(),
        processing_status="analyzing", active_run_consumptions=json.dumps([cid]),
    ))
    db_session.commit()

    assert reconcile_orphan_runs(db_session) == 1
    db_session.expire_all()

    p = db_session.get(Project, "p-orph")
    assert p.processing_status == "error"
    assert p.active_run_consumptions is None
    assert "relancez" in (p.processing_detail or "").lower()
    # l'unité consommée par le run mort a été recréditée (ligne supprimée)
    assert db_session.query(QuotaConsumption).filter_by(id=cid).first() is None


def test_reconcile_memoire_orphan_reopens_without_refund(db_session, test_org):
    # mémoire : consommation AU SUCCÈS → un orphelin n'a rien consommé
    quota.consume(db_session, test_org, "memoire", project_id="p-gen", lot="all")
    db_session.add(Project(
        id="p-gen", organization_id=test_org.id, name="Y", deadline=date.today(),
        processing_status="generating",
    ))
    db_session.commit()
    before = db_session.query(QuotaConsumption).filter_by(kind="memoire").count()

    assert reconcile_orphan_runs(db_session) == 1
    db_session.expire_all()

    p = db_session.get(Project, "p-gen")
    assert p.processing_status == "error"
    # aucune consommation mémoire remboursée (active_run_consumptions vide)
    after = db_session.query(QuotaConsumption).filter_by(kind="memoire").count()
    assert after == before


def test_reconcile_ignores_healthy_projects(db_session, test_org):
    db_session.add(Project(id="p-ok", organization_id=test_org.id, name="Z",
                           deadline=date.today(), processing_status="ready"))
    db_session.commit()
    assert reconcile_orphan_runs(db_session) == 0
    db_session.expire_all()
    assert db_session.get(Project, "p-ok").processing_status == "ready"


def test_memoire_double_run_is_409(client, db_session, test_org):
    db_session.add(Project(id="p-mem", organization_id=test_org.id, name="M",
                           deadline=date.today(), processing_status="generating"))
    db_session.add(ProjectDocument(project_id="p-mem", type="rc", file_url="x",
                   file_name="rc.pdf", extracted_text="Règlement de consultation. " * 50))
    db_session.commit()

    resp = client.post("/api/projects/p-mem/memoire/generate", json={})
    assert resp.status_code == 409, resp.text
