"""S-17 (audit de sécurité, P2) — corps sans longueur maximale : au-delà de la colonne, Postgres refusait et le client
recevait 500 « Erreur interne » ; les textes du profil, sans borne, partaient dans le prompt du mémoire.

Désormais chaque texte est borné dans le schéma (aligné sur sa colonne ; 20 000 caractères pour les textes du
profil) : 422 avec le champ en cause, jamais 500. Valeurs inventées."""
import pytest

from models.project import Project


@pytest.fixture
def projet(db_session, test_org):
    db_session.add(Project(id="p-s17", organization_id=test_org.id, name="AO S-17"))
    db_session.commit()


@pytest.mark.parametrize("champ,taille", [("name", 501), ("maitre_ouvrage", 256)])
def test_ao_trop_long_422(client, projet, champ, taille):
    r = client.patch("/api/projects/p-s17", json={champ: "a" * taille})
    assert r.status_code == 422
    assert champ in r.text


def test_creation_d_ao_trop_long_422(client):
    assert client.post("/api/projects", json={"name": "a" * 501}).status_code == 422
    assert client.post("/api/projects", json={"name": "AO", "maitre_ouvrage": "m" * 256}).status_code == 422


def test_ao_a_la_limite_passe(client, projet):
    assert client.patch("/api/projects/p-s17", json={"name": "a" * 500, "maitre_ouvrage": "m" * 255}).status_code == 200


@pytest.mark.parametrize("champ,taille", [
    ("name", 256), ("address", 20_001), ("presentation", 20_001), ("historique", 20_001), ("activites", 20_001),
    ("organigramme", 20_001), ("moyens_informatiques", 20_001), ("vehicules", 20_001), ("materiel", 20_001),
    ("fournisseurs", 20_001),
])
def test_profil_trop_long_422(client, champ, taille):
    r = client.patch("/api/organizations/me", json={champ: "a" * taille})
    assert r.status_code == 422, r.text


def test_profil_a_la_limite_passe(client):
    assert client.patch("/api/organizations/me", json={"presentation": "a" * 20_000}).status_code == 200


@pytest.mark.parametrize("champ,taille", [("name", 256), ("role", 256), ("specialite", 256), ("certifications", 501)])
def test_personne_cle_trop_longue_422(client, champ, taille):
    corps = {"name": "Chef", "role": "Chef de chantier", champ: "a" * taille}
    assert client.post("/api/users/team", json=corps).status_code == 422


def test_inscription_nom_d_entreprise_trop_long_422():
    from pydantic import ValidationError
    from schemas.auth import SyncRequest
    with pytest.raises(ValidationError):
        SyncRequest(organization_name="a" * 256)
    with pytest.raises(ValidationError):
        SyncRequest(siret="1" * 40)
    assert SyncRequest(organization_name="a" * 255).organization_name
