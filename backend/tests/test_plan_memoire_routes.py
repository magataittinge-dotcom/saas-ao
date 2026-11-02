"""B1 — routes du plan du mémoire : proposition, enregistrement, validation, isolement entre organisations."""
import pytest

from models.compliance_item import ComplianceItem
from models.organization import Organization
from models.plan_memoire import PlanMemoire
from models.project import Project, ProjectDocument

PID = "proj-plan"
URL = f"/api/projects/{PID}/plan-memoire"

CRITERES = [{"nom": "Valeur technique", "poids": 60, "sous_criteres": [
    {"nom": "Gestion et valorisation des déchets", "poids": 30}, {"nom": "Moyens humains et matériels", "poids": 30}]},
    {"nom": "Prix", "poids": 40}]

RC = ("Article 5. Le mémoire technique comprendra :\n- la présentation de l'organisation du chantier ;\n"
      "- un zorglub quantique inventé ;\nArticle 6. Jugement.")


@pytest.fixture(autouse=True)
def _pas_de_limite(monkeypatch):
    import routers.plan_memoire as m
    monkeypatch.setattr(m.limiter, "enabled", False, raising=False)


def _projet(db, org_id, pid=PID):
    db.add(Project(id=pid, organization_id=org_id, name="AO plan", selected_lot="lot1", selected_lot_name="Lot 1",
                   current_step=4, status="en_cours", processing_status="ready", criteres_jugement=CRITERES))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf", extracted_text=RC))
    db.commit()


def test_proposition_sans_enregistrement(client, db_session, test_org):
    _projet(db_session, test_org.id)
    r = client.get(URL)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["enregistre"] is False and c["valide"] is False and c["version"] == 0
    assert c["resume"]["parties"] == 26                      # 25 + « zorglub quantique »
    assert c["resume"]["sous_criteres_total"] == 2 and c["resume"]["sous_criteres_servis"] == 2
    assert c["a_couvrir"] == []
    ajout = [p for p in c["parties"] if ".ajout_" in p["cle"]]
    assert [p["titre"] for p in ajout] == ["Un zorglub quantique inventé"]
    assert ajout[0]["source"]["document"] == "rc.pdf"
    # rien n'est écrit par une simple lecture
    assert db_session.query(PlanMemoire).count() == 0
    # le critère prix n'apparaît dans aucune partie
    assert "Prix" not in str(c["parties"]) and "Prix" not in str(c["a_couvrir"])


def test_enregistrer_puis_valider(client, db_session, test_org):
    _projet(db_session, test_org.id)
    plan = client.get(URL).json()["parties"]
    corps = {"parties": [{"cle": p["cle"], "titre": p["titre"], "retiree": p["cle"] in ("partie_b.dechets", "partie_c.mesures_environnementales"),
                          "attendue": p["attendue"]} for p in plan]}
    r = client.put(URL, json=corps)
    assert r.status_code == 200, r.text
    assert r.json()["enregistre"] and not r.json()["valide"] and r.json()["version"] == 1
    assert [s["nom"] for s in r.json()["a_couvrir"]] == ["Gestion et valorisation des déchets"]

    # même plan, enregistré de nouveau : la version ne bouge pas
    assert client.put(URL, json=corps).json()["version"] == 1

    v = client.post(URL + "/valider")
    assert v.status_code == 200 and v.json()["valide"] and v.json()["valide_le"]
    # une modification remet le plan à valider
    corps["parties"][0]["titre"] = "Notre implantation"
    r = client.put(URL, json=corps)
    assert r.json()["valide"] is False and r.json()["version"] == 2
    assert r.json()["parties"][0]["titre"] == "Notre implantation"
    assert r.json()["parties"][0]["titre_modele"] == "Implantation géographique"


def test_valider_sans_rien_enregistrer_valide_la_proposition(client, db_session, test_org):
    _projet(db_session, test_org.id)
    v = client.post(URL + "/valider")
    assert v.status_code == 200 and v.json()["valide"] and v.json()["resume"]["parties"] == 26
    assert db_session.query(PlanMemoire).count() == 1


def test_valider_avec_le_plan_envoye(client, db_session, test_org):
    _projet(db_session, test_org.id)
    corps = {"parties": [{"cle": "partie_a.historique", "titre": "Notre histoire"},
                         {"cle": "partie_c.ajout_1", "titre": "Une partie à nous"}]}
    v = client.post(URL + "/valider", json=corps)
    assert v.status_code == 200 and v.json()["valide"]
    assert [p["cle"] for p in v.json()["parties"]] == ["partie_a.historique", "partie_c.ajout_1"]


@pytest.mark.parametrize("corps", [
    {"parties": []},
    {"parties": [{"cle": "partie_a.inconnue"}]},
    {"parties": [{"cle": "partie_a.historique"}, {"cle": "partie_a.historique"}]},
    {"parties": [{"cle": "partie_a.historique", "retiree": True}]},
    {"parties": [{"cle": "partie_a.ajout_1", "titre": ""}]},
    {"parties": [{"cle": "partie_a.ajout_1", "titre": "x" * 121}]},
    {"parties": [{"cle": "partie_a.historique", "fiche": {"voulu": "x" * 1001}}]},
    {"parties": [{"cle": "partie_a.historique", "fiche": {"references": ["r"] * 51}}]},
    {"parties": [{"cle": "partie_a.historique", "fiche": {"secret": "x"}}]},
    {"parties": [{"cle": "partie_a.historique", "attendue": "n'importe quoi"}]},
    {"parties": [{"cle": "partie_a.historique", "role": "admin"}]},
    {"parties": [{"cle": "partie_a.ajout_%d" % i, "titre": "T"} for i in range(1, 62)]},
])
def test_plan_invalide_refuse(client, db_session, test_org, corps):
    _projet(db_session, test_org.id)
    assert client.put(URL, json=corps).status_code == 422
    assert db_session.query(PlanMemoire).count() == 0


def test_autre_organisation_404_partout(client, db_session, test_org):
    db_session.add(Organization(id="org-autre", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre")
    corps = {"parties": [{"cle": "partie_a.historique"}]}
    assert client.get(URL).status_code == 404
    assert client.put(URL, json=corps).status_code == 404
    assert client.post(URL + "/valider").status_code == 404
    assert client.post(URL + "/valider", json=corps).status_code == 404
    assert db_session.query(PlanMemoire).count() == 0


def test_un_plan_d_une_autre_organisation_n_est_jamais_lu(client, db_session, test_org):
    """Même si une ligne de plan existe pour le dossier avec une autre organisation, elle n'est ni lue ni modifiée."""
    _projet(db_session, test_org.id)
    db_session.add(Organization(id="org-autre", name="Autre BTP"))
    db_session.add(PlanMemoire(project_id=PID, organization_id="org-autre", lot="lot1", version=7,
                               parties=[{"cle": "partie_a.historique", "partie": "partie_a", "titre": "Espion", "retiree": False,
                                         "attendue": None, "fiche": {}}]))
    db_session.commit()
    c = client.get(URL).json()
    assert c["enregistre"] is False and "Espion" not in str(c)
