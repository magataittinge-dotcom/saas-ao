"""Carte IGN du siège sur « Mon entreprise » (D3) : la route ne prend jamais d'adresse, jamais d'identifiant.

Elle lit l'adresse ENREGISTRÉE de l'entreprise de l'utilisateur connecté (isolation entre entreprises) et
rend la carte déjà composée par services/maps_service (aucun appel réseau ici : la fabrique est remplacée).
Entreprises et adresses inventées.
"""
import base64

from tests.test_fiches_entreprise import _comme_b, deux_entreprises  # noqa: F401  (fixture)

URL = "/api/organizations/me/carte"
PNG = b"\x89PNG\r\n\x1a\n-carte-inventee"
LEGENDE = "Situation de l'entreprise — 12 avenue du Port, 51100 Reims. Source : IGN – Plan IGN v2 (Géoplateforme)"


def _fabrique(monkeypatch, resultat=(PNG, LEGENDE)):
    appels = []

    def faux(company_address, project_address=None, source_lieu=None):
        appels.append((company_address, project_address))
        return resultat

    monkeypatch.setattr("routers.organizations.generate_location_map", faux)
    return appels


def test_la_carte_du_siege_est_celle_de_l_entreprise_connectee(client, deux_entreprises, monkeypatch):
    appels = _fabrique(monkeypatch)
    r = client.get(URL)
    assert r.status_code == 200
    corps = r.json()
    assert base64.b64decode(corps["image_base64"]) == PNG
    assert corps["legende"] == LEGENDE
    assert appels == [("12 avenue du Port, 51100 Reims", None)]       # le siège seul, pas de chantier


def test_isolation_l_autre_entreprise_a_sa_propre_adresse(client, deux_entreprises, monkeypatch):
    appels = _fabrique(monkeypatch)
    _comme_b()
    assert client.get(URL).status_code == 200
    assert appels == [("4 rue des Tilleuls, 51000 Châlons", None)]


def test_la_route_ignore_toute_adresse_envoyee(client, deux_entreprises, monkeypatch):
    appels = _fabrique(monkeypatch)
    client.get(URL, params={"adresse": "1 rue de l'Inconnu, 75000 Paris", "address": "x", "org_id": "org-b"})
    assert appels == [("12 avenue du Port, 51100 Reims", None)]


def test_sans_adresse_pas_de_carte_et_aucun_appel(client, deux_entreprises, db_session, test_org, monkeypatch):
    appels = _fabrique(monkeypatch)
    test_org.address = "  "
    db_session.commit()
    assert client.get(URL).status_code == 204
    assert appels == []


def test_adresse_introuvable_pas_de_carte(client, deux_entreprises, monkeypatch):
    _fabrique(monkeypatch, resultat=(None, None))
    r = client.get(URL)
    assert r.status_code == 204 and r.content == b""


def test_la_route_demande_une_connexion(client, deux_entreprises, monkeypatch):
    from main import app
    from routers.auth import get_auth_user

    _fabrique(monkeypatch)
    app.dependency_overrides.pop(get_auth_user, None)
    assert client.get(URL).status_code in (401, 403)
