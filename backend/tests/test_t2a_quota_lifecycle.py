"""T2a — cycle de vie du quota (le compteur d'argent).

- R4  refund lié aux IDs consommés du run (jamais « la ligne la plus
      récente ») → une unité livrée par un run précédent ne peut PAS être
      remboursée par erreur.
- R3  anti double-run ATOMIQUE (claim DB, cross-worker) : un projet déjà
      en analyse → 409 AVANT toute consommation.
"""
from datetime import date

from models.organization import Organization
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption
from services import quota


# ── R4 : refund par IDs ────────────────────────────────────────────────────
def test_refund_ids_deletes_only_given_rows(db_session, test_org):
    r1 = quota.consume(db_session, test_org, "analysis", project_id="p", lot="lot1")
    r2 = quota.consume(db_session, test_org, "analysis", project_id="p", lot="lot2")
    db_session.commit()
    id1, id2 = r1.id, r2.id  # snapshot avant toute suppression

    n = quota.refund_ids(db_session, [id1])
    db_session.commit()
    assert n == 1

    remaining = db_session.query(QuotaConsumption).filter_by(
        organization_id=test_org.id).all()
    assert [r.id for r in remaining] == [id2]

    # idempotent : re-rembourser un id déjà supprimé = no-op
    assert quota.refund_ids(db_session, [id1]) == 0


def test_refund_ids_never_touches_a_historical_run(db_session, test_org):
    # unité LIVRÉE lors d'un run précédent (même org/projet/lot)
    hist = quota.consume(db_session, test_org, "analysis", project_id="p", lot="lot1")
    db_session.commit()
    hist_id = hist.id

    # nouveau run : le même lot est re-consommé
    fresh = quota.consume(db_session, test_org, "analysis", project_id="p", lot="lot1")
    db_session.commit()
    fresh_id = fresh.id  # snapshot avant suppression

    # on rembourse UNIQUEMENT l'unité de ce run, par id
    quota.refund_ids(db_session, [fresh_id])
    db_session.commit()

    ids = [r.id for r in db_session.query(QuotaConsumption).all()]
    assert hist_id in ids, "l'unité livrée d'un run précédent ne doit JAMAIS être remboursée"
    assert fresh_id not in ids


# ── R3 : anti double-run atomique, sans consommation ───────────────────────
def test_analyze_on_running_project_is_409_before_consume(client, db_session, test_org, monkeypatch):
    from services.ai import dce_analyzer
    monkeypatch.setattr(
        dce_analyzer.DCEAnalyzer, "_run_pass_chunked",
        lambda self, *a, **k: {"requirements": [], "criteres_jugement": [], "infos_marche": {}},
    )

    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.add(Project(
        id="proj-running", organization_id=test_org.id, name="X",
        deadline=date.today(), processing_status="analyzing",
    ))
    db_session.add(ProjectDocument(
        project_id="proj-running", type="rc", file_url="x",
        file_name="rc.pdf", extracted_text="Règlement de consultation. " * 80,
    ))
    db_session.commit()

    before = db_session.query(QuotaConsumption).filter_by(
        organization_id=test_org.id).count()

    resp = client.post("/api/projects/proj-running/analyze")
    assert resp.status_code == 409, resp.text

    db_session.expire_all()
    after = db_session.query(QuotaConsumption).filter_by(
        organization_id=test_org.id).count()
    assert after == before, "un 409 anti-double-run ne doit JAMAIS consommer d'unité"
