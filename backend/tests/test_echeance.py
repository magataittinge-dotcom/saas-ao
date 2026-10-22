"""1.14 — Une seule vérité pour l'échéance et « en cours ».

  • Chaque AO expose `echeance` = {date, heure} : la date saisie (avec l'heure
    du RC si le RC donne le même jour), sinon la date et l'heure lues dans le
    RC (champs critiques du lot courant), sinon la date relevée par l'analyse.
  • « En cours » = brouillon, en cours ou analysé, au serveur comme à l'écran.
"""
from datetime import date

from models.project import Project
from schemas.project import ProjectResponse

RC = {"lot5": {"date_limite_remise": {"value": {"date": "2026-04-10", "heure": "14h00"}, "source": None}}}


def _projet(db, org_id, pid, **champs):
    p = Project(id=pid, organization_id=org_id, name=f"AO {pid}", **champs)
    db.add(p)
    db.commit()
    return p


def test_echeance_rc_avec_heure_quand_aucune_date_saisie(db_session, test_org):
    p = _projet(db_session, test_org.id, "e1", selected_lot="lot5", critical_fields=RC,
                infos_marche={"date_limite_reponse": "2026-04-10"})
    assert ProjectResponse.model_validate(p).echeance == {"date": "2026-04-10", "heure": "14h00"}


def test_echeance_date_saisie_prioritaire_avec_heure_du_rc_le_meme_jour(db_session, test_org):
    p = _projet(db_session, test_org.id, "e2", selected_lot="lot5", critical_fields=RC, deadline=date(2026, 4, 10))
    assert ProjectResponse.model_validate(p).echeance == {"date": "2026-04-10", "heure": "14h00"}
    p.deadline = date(2026, 4, 17)  # avenant : la date saisie l'emporte, sans heure
    assert ProjectResponse.model_validate(p).echeance == {"date": "2026-04-17", "heure": None}


def test_echeance_date_d_analyse_puis_aucune(db_session, test_org):
    p = _projet(db_session, test_org.id, "e3", infos_marche={"date_limite_reponse": "2026-04-10"})
    assert ProjectResponse.model_validate(p).echeance == {"date": "2026-04-10", "heure": None}
    p.infos_marche = {"date_limite_reponse": "vendredi prochain"}
    assert ProjectResponse.model_validate(p).echeance is None


def test_api_projets_expose_l_echeance_sans_les_champs_critiques(client, db_session, test_org):
    _projet(db_session, test_org.id, "e4", selected_lot="lot5", critical_fields=RC)
    projet = next(x for x in client.get("/api/projects").json() if x["id"] == "e4")
    assert projet["echeance"] == {"date": "2026-04-10", "heure": "14h00"}
    assert "critical_fields" not in projet


def test_stats_en_cours_compte_les_ao_analyses(client, db_session, test_org):
    from services.cache import org_cache
    for pid, statut in (("s1", "brouillon"), ("s2", "en_cours"), ("s3", "analyzed"),
                        ("s4", "sans_suite"), ("s5", "soumis"), ("s6", "gagné")):
        _projet(db_session, test_org.id, pid, status=statut)
    org_cache.clear()
    assert client.get("/api/dashboard/stats").json()["projects_en_cours"] == 3
