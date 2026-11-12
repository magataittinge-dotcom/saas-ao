"""Second test de bout en bout (rapport E2E-2, bug 1) : après l'échec de la rédaction du mémoire, l'écran dit ce qui s'est
passé, que rien n'est décompté, et propose « Relancer la rédaction ». Le serveur porte la phrase du produit (jamais l'erreur
technique) ; l'unité « mémoire » n'est décomptée qu'au succès. Données inventées.
"""
from datetime import date


def test_l_echec_de_la_redaction_dit_que_rien_n_est_decompte(client, db_session, test_org, test_user, monkeypatch, caplog):
    import routers.memoire as mm
    from models.project import Project
    from models.quota_consumption import QuotaConsumption

    db_session.add(Project(id="proj-redac-panne", organization_id=test_org.id, name="AO inventé", deadline=date.today(),
                           current_step=5, processing_status="generating"))
    db_session.commit()

    def _panne(*a, **k):
        raise RuntimeError("Connection error [tentatives 3/3]")
    monkeypatch.setattr(mm, "_lire_contexte_generation", _panne)

    mm._run_memoire_job_corps("proj-redac-panne", test_org.id, test_user.id, {}, None, None)

    db_session.expire_all()
    p = db_session.get(Project, "proj-redac-panne")
    assert p.processing_status == "error"
    assert p.processing_detail == mm.MSG_ECHEC_REDACTION
    assert "Rien n’a été décompté" in mm.MSG_ECHEC_REDACTION
    assert "génération" not in mm.MSG_ECHEC_REDACTION and "Connection" not in p.processing_detail
    assert p.current_step == 5, "jamais de recul d'étape"
    assert db_session.query(QuotaConsumption).filter(QuotaConsumption.kind == "memoire").count() == 0
