"""A6 — routes /api/veille : contrat, isolation, curseur, filtres, création d'AO."""
import base64
import json
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from database import SessionLocal, get_db
from main import app
from models.avis_veille import AvisVeille
from models.organization import Organization
from models.preferences_veille import PreferencesVeille
from models.project import Project
from models.user import User
from routers.auth import get_auth_user
from services.cache import org_cache

AUJOURD = date.today()


@pytest.fixture(autouse=True)
def _cache_propre():
    org_cache.invalidate("veille:")
    yield


@pytest.fixture
def deux_orgs(db_session):
    db_session.add_all([Organization(id="org-A", name="A"), Organization(id="org-B", name="B")])
    db_session.commit()
    a = User(id="user-A", email="a@a.fr", name="Alice", organization_id="org-A", created_at=datetime.utcnow() - timedelta(days=30))
    b = User(id="user-B", email="b@b.fr", name="Bob", organization_id="org-B", created_at=datetime.utcnow() - timedelta(days=30))
    db_session.add_all([a, b])
    db_session.commit()
    return a, b


def _client_en_tant_que(user):
    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _auth(request=None):
        return user

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = _auth
    return TestClient(app)


@pytest.fixture(autouse=True)
def _nettoyage():
    yield
    app.dependency_overrides.clear()


def _avis(db, idweb, departements=("44",), jours=10, metiers=("couverture",), procedure="ouvert", objet=None,
          parution=None, acheteur="Commune d'Exemple", url_dossier="https://profil.example.test/dce"):
    ligne = AvisVeille(id_boamp=idweb, objet=objet or f"Travaux {idweb}", acheteur=acheteur, departements=list(departements),
                       date_parution=parution or AUJOURD - timedelta(days=1), date_limite=AUJOURD + timedelta(days=jours),
                       procedure=procedure, procedure_libelle="Procédure Ouverte", famille="FNS", metiers=list(metiers),
                       url_avis=f"https://www.boamp.fr/pages/avis/?q=idweb:{idweb}", url_dossier=url_dossier)
    db.add(ligne)
    db.commit()
    return ligne


# ── Préférences ─────────────────────────────────────────────────────────────────────────────────

def test_preferences_par_defaut_sans_ligne(client):
    r = client.get("/api/veille/preferences")
    assert r.status_code == 200
    assert r.json() == {"departements": [], "ville": None,
                        "filtres": {"metiers": [], "delai_jours": None, "procedures": [], "mots_cles": ""},
                        "tri": "date_limite", "derniere_visite": None}


def test_preferences_put_partiel_puis_relecture(client):
    r = client.put("/api/veille/preferences", json={"departements": ["44", "49", "44"], "filtres": {"metiers": ["couverture"]}})
    assert r.status_code == 200 and r.json()["departements"] == ["44", "49"]          # doublon retiré
    r = client.put("/api/veille/preferences", json={"filtres": {"delai_jours": 15}, "tri": "date_parution"})
    corps = r.json()
    assert corps["departements"] == ["44", "49"]                                      # inchangé
    assert corps["filtres"] == {"metiers": ["couverture"], "delai_jours": 15, "procedures": [], "mots_cles": ""}
    assert corps["tri"] == "date_parution"
    assert client.get("/api/veille/preferences").json() == corps


def test_preferences_ville_stockee_puis_effacee(client):
    ville = {"libelle": "Nantes", "code_insee": "44109", "code_postal": "44000", "departement": "44",
             "lat": 47.2184, "lon": -1.5536, "rayon_km": 50}
    assert client.put("/api/veille/preferences", json={"ville": ville}).json()["ville"] == ville
    assert client.put("/api/veille/preferences", json={"ville": None}).json()["ville"] is None


@pytest.mark.parametrize("corps", [
    {"departements": ["99"]}, {"departements": ["20"]}, {"departements": ["977"]}, {"departements": ["ab"]},
    {"departements": [f"{n:02d}" for n in range(1, 32)]},                              # 31 > 30
    {"filtres": {"mots_cles": "x" * 121}}, {"filtres": {"delai_jours": 10}}, {"filtres": {"metiers": ["inconnu"]}},
    {"filtres": {"procedures": ["secret"]}}, {"tri": "prix"}, {"inconnu": 1},
    {"ville": {"libelle": "X", "code_insee": "1", "code_postal": "1", "departement": "99", "lat": 0, "lon": 0}},
])
def test_preferences_validation_stricte_422(client, corps):
    assert client.put("/api/veille/preferences", json=corps).status_code == 422


def test_preferences_codes_officiels_acceptes(client):
    codes = ["01", "2A", "2B", "95", "971", "976"]
    assert client.put("/api/veille/preferences", json={"departements": codes}).json()["departements"] == codes


def test_preferences_isolees_entre_utilisateurs_et_organisations(db_session, deux_orgs):
    a, b = deux_orgs
    ca = _client_en_tant_que(a)
    ca.put("/api/veille/preferences", json={"departements": ["44"], "filtres": {"mots_cles": "secret de A"}})
    ca.post("/api/veille/visite")
    cb = _client_en_tant_que(b)
    lu = cb.get("/api/veille/preferences").json()
    assert lu["departements"] == [] and lu["filtres"]["mots_cles"] == "" and lu["derniere_visite"] is None
    cb.put("/api/veille/preferences", json={"departements": ["75"]})
    assert _client_en_tant_que(a).get("/api/veille/preferences").json()["departements"] == ["44"]
    lignes = {l.user_id: l.organization_id for l in db_session.query(PreferencesVeille).all()}
    assert lignes == {"user-A": "org-A", "user-B": "org-B"}


def test_visite_pose_l_horodatage_utc(client):
    r = client.post("/api/veille/visite")
    assert r.status_code == 200
    horodatage = r.json()["derniere_visite"]
    assert horodatage.endswith("Z")
    assert abs(datetime.fromisoformat(horodatage.rstrip("Z")) - datetime.utcnow()) < timedelta(seconds=10)
    assert client.get("/api/veille/preferences").json()["derniere_visite"] == horodatage


def test_metiers_liste_codes_et_libelles(client):
    corps = client.get("/api/veille/metiers").json()["metiers"]
    codes = [m["code"] for m in corps]
    assert "gros_oeuvre" in codes and codes[-1] == "autre" and len(codes) == 18
    assert all(m["libelle"] for m in corps)


# ── Comptes ─────────────────────────────────────────────────────────────────────────────────────

def test_comptes_selon_le_contrat(client, db_session):
    _avis(db_session, "c1", ("44", "49"), metiers=("couverture",))
    _avis(db_session, "c2", ("44",), metiers=("plomberie",), jours=3)
    r = client.get("/api/veille/comptes")
    assert r.status_code == 200
    corps = r.json()
    assert corps["comptes"] == {"44": 2, "49": 1} and corps["total"] == 2
    assert corps["source"] == "BOAMP – DILA, licence ouverte" and corps["actualise_le"].endswith("Z")
    assert client.get("/api/veille/comptes?metiers=plomberie").json()["comptes"] == {"44": 1}
    assert client.get("/api/veille/comptes?delai_jours=7").json()["total"] == 1
    assert client.get("/api/veille/comptes?procedures=restreint").json()["total"] == 0


@pytest.mark.parametrize("requete", ["delai_jours=10", "metiers=inconnu", "procedures=x", "delai_jours=abc"])
def test_comptes_parametres_invalides_422(client, requete):
    assert client.get(f"/api/veille/comptes?{requete}").status_code == 422


# ── Liste ───────────────────────────────────────────────────────────────────────────────────────

def test_avis_exige_departements(client):
    assert client.get("/api/veille/avis").status_code == 422
    vide = client.get("/api/veille/avis?departements=").json()
    assert vide == {"items": [], "curseur_suivant": None, "total": 0}


def test_avis_departement_inconnu_422(client):
    assert client.get("/api/veille/avis?departements=44,99").status_code == 422


def test_avis_forme_de_la_reponse(client, db_session):
    _avis(db_session, "l1", ("44", "49"), objet="Rénovation de la toiture", procedure="adaptee")
    corps = client.get("/api/veille/avis?departements=49").json()
    assert corps["total"] == 1 and corps["curseur_suivant"] is None
    (item,) = corps["items"]
    assert set(item) == {"id", "id_boamp", "objet", "acheteur", "departements", "date_parution", "date_limite", "procedure",
                         "procedure_libelle", "famille", "metiers", "url_avis", "url_dossier", "nouveau"}
    assert item["departements"] == ["44", "49"] and item["procedure"] == "adaptee" and item["id_boamp"] == "l1"
    assert item["date_limite"] == (AUJOURD + timedelta(days=10)).isoformat()


def test_avis_filtres(client, db_session):
    _avis(db_session, "g1", ("75",), metiers=("plomberie",), jours=5, procedure="adaptee", objet="Plomberie de l'école")
    _avis(db_session, "g2", ("75",), metiers=("couverture",), jours=20, objet="Toiture")
    _avis(db_session, "g3", ("69",), metiers=("couverture",), jours=3, objet="Toiture lyonnaise")
    _avis(db_session, "g4", ("75",), jours=-2)                                                   # clos
    ids = lambda q: [i["id_boamp"] for i in client.get(f"/api/veille/avis?{q}").json()["items"]]
    assert ids("departements=75") == ["g1", "g2"]
    assert ids("departements=75,69") == ["g3", "g1", "g2"]                                       # tri par date limite
    assert ids("departements=75&metiers=plomberie") == ["g1"]
    assert ids("departements=75,69&delai_jours=7") == ["g3", "g1"]
    assert ids("departements=75,69&procedures=adaptee") == ["g1"]
    assert ids("departements=75,69&q=toiture") == ["g3", "g2"]
    assert ids("departements=75&q=%25") == []


def test_avis_tri_par_date_de_parution_decroissante(client, db_session):
    _avis(db_session, "t1", parution=AUJOURD - timedelta(days=3), jours=2)
    _avis(db_session, "t2", parution=AUJOURD - timedelta(days=1), jours=9)
    _avis(db_session, "t3", parution=AUJOURD - timedelta(days=2), jours=5)
    ids = [i["id_boamp"] for i in client.get("/api/veille/avis?departements=44&tri=date_parution").json()["items"]]
    assert ids == ["t2", "t3", "t1"]
    assert client.get("/api/veille/avis?departements=44&tri=prix").status_code == 422


@pytest.mark.parametrize("tri", ["date_limite", "date_parution"])
def test_curseur_stable_trois_pages_sans_doublon_ni_trou(client, db_session, tri):
    for n in range(23):                                  # dates volontairement répétées : le tie-break par id compte
        _avis(db_session, f"p{n:02d}", jours=1 + n % 4, parution=AUJOURD - timedelta(days=1 + n % 3))
    vus, curseur, pages = [], None, 0
    while True:
        url = f"/api/veille/avis?departements=44&tri={tri}&limite=10" + (f"&curseur={curseur}" if curseur else "")
        corps = client.get(url).json()
        assert corps["total"] == 23
        vus += [i["id_boamp"] for i in corps["items"]]
        pages += 1
        curseur = corps["curseur_suivant"]
        if not curseur:
            break
    assert pages == 3 and len(vus) == 23 and len(set(vus)) == 23
    tout = client.get(f"/api/veille/avis?departements=44&tri={tri}&limite=50").json()
    assert vus == [i["id_boamp"] for i in tout["items"]]                                   # même ordre, page ou non


def test_curseur_opaque_url_safe_et_invalide_refuse(client, db_session):
    for n in range(3):
        _avis(db_session, f"u{n}")
    curseur = client.get("/api/veille/avis?departements=44&limite=1").json()["curseur_suivant"]
    brut = base64.urlsafe_b64decode(curseur + "=" * (-len(curseur) % 4))
    valeur, identifiant = json.loads(brut)
    assert len(valeur) == 10 and identifiant
    assert all(c.isalnum() or c in "-_" for c in curseur)
    assert client.get("/api/veille/avis?departements=44&curseur=%21%21pas-un-curseur").status_code == 422
    assert client.get("/api/veille/avis?departements=44&limite=51").status_code == 422
    assert client.get("/api/veille/avis?departements=44&limite=0").status_code == 422


def test_nouveau_selon_la_derniere_visite(client, db_session, test_user):
    _avis(db_session, "n_ancien", parution=AUJOURD - timedelta(days=5))
    _avis(db_session, "n_recent", parution=AUJOURD)
    db_session.query(User).filter_by(id=test_user.id).update({"created_at": datetime.utcnow() - timedelta(days=30)})
    db_session.commit()
    def nouveaux():
        return {i["id_boamp"]: i["nouveau"] for i in client.get("/api/veille/avis?departements=44").json()["items"]}
    assert nouveaux() == {"n_ancien": False, "n_recent": False}                 # jamais visité, compte de plus de 24 h
    db_session.add(PreferencesVeille(user_id=test_user.id, organization_id=test_user.organization_id, departements=[],
                                     filtres={}, derniere_visite=datetime.utcnow() - timedelta(days=2)))
    db_session.commit()
    assert nouveaux() == {"n_ancien": False, "n_recent": True}                  # parus depuis la dernière visite
    client.post("/api/veille/visite")
    assert nouveaux() == {"n_ancien": False, "n_recent": False}


def test_nouveau_pour_un_compte_de_moins_de_24_heures(client, db_session, test_user):
    _avis(db_session, "n_neuf", parution=AUJOURD - timedelta(days=5))
    db_session.query(User).filter_by(id=test_user.id).update({"created_at": datetime.utcnow() - timedelta(hours=2)})
    db_session.commit()
    (item,) = client.get("/api/veille/avis?departements=44").json()["items"]
    assert item["nouveau"] is True


# ── Création d'AO ───────────────────────────────────────────────────────────────────────────────

def test_creer_ao_prerempli_dans_l_organisation_de_l_utilisateur(db_session, deux_orgs):
    a, b = deux_orgs
    avis = _avis(db_session, "ao1", objet="O" * 600, acheteur="Commune d'Exemple", jours=12)
    r = _client_en_tant_que(a).post(f"/api/veille/avis/{avis.id}/creer-ao")
    assert r.status_code == 200
    projet = db_session.get(Project, r.json()["project_id"])
    assert projet.organization_id == "org-A"
    assert projet.name == "O" * 500 and projet.maitre_ouvrage == "Commune d'Exemple"
    assert projet.deadline == AUJOURD + timedelta(days=12) and projet.status == "brouillon"
    assert projet.infos_marche["source_avis"] == {"id_boamp": "ao1", "url_avis": avis.url_avis, "url_dossier": avis.url_dossier}
    assert db_session.query(Project).filter_by(organization_id="org-B").count() == 0


def test_creer_ao_ne_consomme_aucune_unite_de_quota(client, db_session, test_org):
    from models.quota_consumption import QuotaConsumption
    avis = _avis(db_session, "ao2")
    assert client.post(f"/api/veille/avis/{avis.id}/creer-ao").status_code == 200
    assert db_session.query(QuotaConsumption).count() == 0


def test_creer_ao_404_si_inconnu_ou_clos(client, db_session):
    clos = _avis(db_session, "ao3", jours=-1)
    assert client.post(f"/api/veille/avis/{clos.id}/creer-ao").status_code == 404
    assert client.post("/api/veille/avis/n-existe-pas/creer-ao").status_code == 404


def test_creer_ao_deux_fois_renvoie_le_meme_projet(client, db_session):
    avis = _avis(db_session, "ao4")
    p1 = client.post(f"/api/veille/avis/{avis.id}/creer-ao").json()["project_id"]
    p2 = client.post(f"/api/veille/avis/{avis.id}/creer-ao").json()["project_id"]
    assert p1 == p2 and db_session.query(Project).count() == 1


def test_creer_ao_depuis_un_autre_organisation_cree_son_propre_projet(db_session, deux_orgs):
    a, b = deux_orgs
    avis = _avis(db_session, "ao5")
    pa = _client_en_tant_que(a).post(f"/api/veille/avis/{avis.id}/creer-ao").json()["project_id"]
    pb = _client_en_tant_que(b).post(f"/api/veille/avis/{avis.id}/creer-ao").json()["project_id"]
    assert pa != pb
    assert db_session.get(Project, pa).organization_id == "org-A" and db_session.get(Project, pb).organization_id == "org-B"


def test_l_analyse_conserve_la_source_de_l_avis():
    from routers.analysis import conserver_source_avis
    avant = {"source_avis": {"id_boamp": "x", "url_avis": "u", "url_dossier": None}}
    assert conserver_source_avis(avant, {"objet": "Marché"}) == {"objet": "Marché", "source_avis": avant["source_avis"]}
    assert conserver_source_avis(None, {"objet": "Marché"}) == {"objet": "Marché"}
    assert conserver_source_avis(avant, None)["source_avis"] == avant["source_avis"]


# ── Sécurité ────────────────────────────────────────────────────────────────────────────────────

def test_toutes_les_routes_exigent_un_utilisateur_connecte():
    app.dependency_overrides.clear()
    c = TestClient(app)
    for methode, url in (("get", "/api/veille/preferences"), ("put", "/api/veille/preferences"), ("post", "/api/veille/visite"),
                         ("get", "/api/veille/metiers"), ("get", "/api/veille/comptes"), ("get", "/api/veille/avis?departements=44"),
                         ("post", "/api/veille/avis/x/creer-ao")):
        assert getattr(c, methode)(url).status_code in (401, 403), url


def test_les_routes_sont_limitees_par_slowapi(client):
    from services.rate_limit import limiter
    limiter.enabled = True
    try:
        limiter.reset()
        codes = [client.get("/api/veille/metiers").status_code for _ in range(65)]
        assert 429 in codes and codes[0] == 200
    finally:
        limiter.enabled = False
        limiter.reset()
