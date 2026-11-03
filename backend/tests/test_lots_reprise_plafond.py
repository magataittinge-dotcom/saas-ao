"""3/11 (A1) : le filet IA des lots, non lancé parce que le plafond de lectures assistées était atteint, est retenté à la PROCHAINE
ouverture de l'écran des lots (GET /lots sans `sans_ia`) une fois le plafond remis à zéro. Jamais en tâche de fond, jamais depuis
le dépôt (`sans_ia=1`), jamais par-dessus ce que l'utilisateur a fait (lot renommé ou choisi). Données inventées."""
from types import SimpleNamespace

import pytest

from models.depot_entreprise import CoutIA
from models.project import Project, ProjectDocument
import services.ai.lot_fallback as lf
from services import couts_ia, depot_budget

RC_TEXTE = "Le marché est divisé en 13 lots.\nLot 1 — Gros œuvre inventé\nLot 2 — Charpente inventée"
PID = "p-reprise"


def _lot(lot_id, nom, **kw):
    return {"id": lot_id, "nom": nom, "confidence": 90, "sources": ["rc_table"], **kw}


def _projet(db, org_id, pid=PID, plafond="jour", lots=None, **kw):
    """Un projet dont l'écran des lots a déjà tourné avec le plafond atteint : résultat sans IA en cache + `ia_plafond`."""
    lots = lots if lots is not None else [_lot("lot1", "Lot 1 — Gros œuvre inventé"), _lot("lot2", "Lot 2 — Charpente inventée")]
    ecartes = {"hors_liste": 11, "sans_intitule": 0}
    if plafond:
        ecartes["ia_plafond"] = plafond
    db.add(Project(id=pid, organization_id=org_id, name="AO reprise", lots_detectes=lots, lots_ecartes=ecartes,
                   processing_status="ready", **kw))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf", file_name="RC.pdf", extracted_text=RC_TEXTE))
    db.commit()


def _docs(pid=PID):
    return [{"id": "d1", "file_name": "RC.pdf", "file_url": f"/uploads/projects/{pid}/rc.pdf", "extracted_text": RC_TEXTE, "type": "rc", "related_lots": None}]


def _plafond_du_jour_atteint(db, org_id, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "1")
    couts_ia.enregistrer(db, org_id, depot_budget.USAGE, lf._MODEL, {"input_tokens": 10, "output_tokens": 10})


class _FauxFil:
    lances: list = []

    def __init__(self, target=None, args=(), kwargs=None, **_):
        self.cible, self.args, self.kwargs = target, args, kwargs or {}

    def start(self):
        _FauxFil.lances.append((self.cible, self.args, self.kwargs))


@pytest.fixture
def faux_fil(monkeypatch):
    import routers.projects as projects_mod
    _FauxFil.lances = []
    monkeypatch.setattr(projects_mod, "threading", SimpleNamespace(Thread=_FauxFil, Lock=__import__("threading").Lock))
    return _FauxFil.lances


@pytest.fixture
def appels_ia(monkeypatch):
    appels = {"n": 0}

    def faux(excerpts, detected, announced, on_usage=None):
        appels["n"] += 1
        if on_usage:
            on_usage({"input_tokens": 1200, "output_tokens": 150})
        return [{"id": "lot3", "nom": "Lot 3 — Menuiseries inventées"}]
    monkeypatch.setattr(lf, "_call_claude", faux)
    return appels


def _relu(db, pid=PID):
    db.expire_all()
    return db.get(Project, pid)


def test_plafond_remis_a_zero_la_detection_repart_a_l_ouverture_de_l_ecran_des_lots(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id)
    r = client.get(f"/api/projects/{PID}/lots")
    assert r.status_code == 200
    assert r.json()["status"] == "detecting_lots"                    # même réponse qu'un cache manquant : le front attend puis rappelle
    assert len(faux_fil) == 1 and faux_fil[0][2].get("sans_ia") is False
    p = _relu(db_session)
    assert p.lots_detectes is None and p.lots_ecartes is None         # état d'un cache manquant : plus d'ancienne liste servie
    assert p.processing_status == "detecting_lots"


def test_la_reprise_va_jusqu_au_filet_compte_dans_le_plafond_et_retire_le_marqueur(client, db_session, test_org, faux_fil, appels_ia, monkeypatch):
    import routers.projects as projects_mod
    monkeypatch.setattr(projects_mod.lot_detector, "detect", lambda *a, **k: [_lot("lot1", "Lot 1 — Gros œuvre inventé"), _lot("lot2", "Lot 2 — Charpente inventée")])
    _projet(db_session, test_org.id)
    avant = depot_budget.appels_du_jour(db_session, test_org.id)
    client.get(f"/api/projects/{PID}/lots")
    cible, args, kwargs = faux_fil[0]
    cible(*args, **kwargs)                                            # le fil, exécuté ici
    assert appels_ia["n"] == 1
    assert depot_budget.appels_du_jour(db_session, test_org.id) == avant + 1
    p = _relu(db_session)
    assert {l["id"] for l in p.lots_detectes} == {"lot1", "lot2", "lot3"}
    assert "ia_plafond" not in (p.lots_ecartes or {})
    r = client.get(f"/api/projects/{PID}/lots")                       # ensuite le cache est servi, sans nouvelle reprise
    assert r.json()["cached"] is True and len(faux_fil) == 1


def test_plafond_du_jour_toujours_atteint_le_cache_est_servi_tel_quel(client, db_session, test_org, faux_fil, monkeypatch):
    _plafond_du_jour_atteint(db_session, test_org.id, monkeypatch)
    _projet(db_session, test_org.id)
    r = client.get(f"/api/projects/{PID}/lots")
    assert r.json()["cached"] is True and [l["id"] for l in r.json()["lots"]] == ["lot1", "lot2"]
    assert r.json()["ecartes"]["ia_plafond"] == "jour"
    assert faux_fil == []
    assert _relu(db_session).lots_detectes is not None


def test_plafond_du_mois_toujours_atteint_aucune_reprise(client, db_session, test_org, faux_fil, monkeypatch):
    monkeypatch.setenv("DEPOT_BUDGET_MENSUEL_EUR", "0")
    _projet(db_session, test_org.id, plafond="mois")
    r = client.get(f"/api/projects/{PID}/lots")
    assert r.json()["cached"] is True and faux_fil == []


def test_avec_sans_ia_jamais_de_reprise_meme_plafond_remis_a_zero(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id)
    r = client.get(f"/api/projects/{PID}/lots?sans_ia=1")
    assert r.status_code == 200 and r.json()["cached"] is True
    assert faux_fil == []
    assert _relu(db_session).lots_ecartes["ia_plafond"] == "jour"


def test_un_cache_sans_marqueur_plafond_n_est_jamais_relance(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id, plafond=None)
    assert client.get(f"/api/projects/{PID}/lots").json()["cached"] is True
    assert faux_fil == []


def test_pas_de_reprise_si_un_lot_a_ete_renomme(client, db_session, test_org, faux_fil):
    lots = [_lot("lot1", "Lot 1", user_label="Gros œuvre (nom donné)"), _lot("lot2", "Lot 2 — Charpente inventée")]
    _projet(db_session, test_org.id, lots=lots)
    r = client.get(f"/api/projects/{PID}/lots")
    assert r.json()["cached"] is True and r.json()["lots"][0]["user_label"] == "Gros œuvre (nom donné)"
    assert faux_fil == []


def test_pas_de_reprise_si_un_lot_a_ete_choisi(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id, selected_lot="lot2", selected_lot_name="Lot 2 — Charpente inventée")
    assert client.get(f"/api/projects/{PID}/lots").json()["cached"] is True
    assert faux_fil == []


def test_pas_de_reprise_si_le_parcours_a_depasse_l_ecran_des_lots(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id, current_step=3, completed_steps={"1": True, "2": True})
    assert client.get(f"/api/projects/{PID}/lots").json()["cached"] is True
    assert faux_fil == []


def test_deux_ouvertures_simultanees_ne_lancent_qu_un_seul_filet(client, db_session, test_org, faux_fil):
    _projet(db_session, test_org.id)
    assert client.get(f"/api/projects/{PID}/lots").json()["status"] == "detecting_lots"
    r2 = client.get(f"/api/projects/{PID}/lots")
    assert r2.json()["status"] == "detecting_lots"
    assert len(faux_fil) == 1


def test_la_prise_est_atomique_une_ouverture_qui_a_lu_le_cache_avant_perd_la_course(client, db_session, test_org, faux_fil):
    """La seconde ouverture avait lu l'ancien cache avant la première : sa prise (UPDATE conditionnel) ne touche aucune ligne."""
    import routers.projects as projects_mod
    _projet(db_session, test_org.id)
    assert projects_mod._prendre_reprise_lots(db_session, PID) is True
    assert projects_mod._prendre_reprise_lots(db_session, PID) is False


def test_reprise_autre_organisation_404_et_projet_intact(client, db_session, test_org, faux_fil):
    from models.organization import Organization
    db_session.add(Organization(id="org-autre-reprise", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre-reprise")
    assert client.get(f"/api/projects/{PID}/lots").status_code == 404
    assert faux_fil == []
    p = _relu(db_session)
    assert p.lots_detectes is not None and p.lots_ecartes["ia_plafond"] == "jour" and p.processing_status == "ready"


def test_le_plafond_d_une_autre_entreprise_ne_bloque_pas_ma_reprise(client, db_session, test_org, faux_fil, monkeypatch):
    from models.organization import Organization
    db_session.add(Organization(id="org-voisine-reprise", name="Voisine BTP"))
    db_session.commit()
    _plafond_du_jour_atteint(db_session, "org-voisine-reprise", monkeypatch)
    _projet(db_session, test_org.id)
    assert client.get(f"/api/projects/{PID}/lots").json()["status"] == "detecting_lots"
    assert len(faux_fil) == 1
