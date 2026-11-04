"""G7 (recette Ozcan) — le SIRET se saisit et se contrôle depuis « Mon entreprise », profil non vide.

Même service que l'inscription (`/auth/sync` → `_apply_siret` → Sirene), avec `depuis_profil` : les phrases parlent à
quelqu'un qui est déjà dans « Mon entreprise » (jamais « vous pourrez le corriger dans Mon entreprise »), et un SIRET
déjà pris n'enlève pas l'essai d'un compte existant. L'organisation vient du jeton, jamais du corps. Sirene simulé."""
import pytest

from models.organization import Organization

VALID = "73282932000074"
AUTRE_VALIDE = "35600000000048"   # La Poste (règle de Luhn exemptée), jamais appelé en réseau
INVALIDE = "12345678901234"


def _info(siret=VALID, nom="BATI FACADE SARL", adresse="12 RUE DES MACONS 14000 CAEN"):
    from services.insee_service import SireneInfo
    return SireneInfo(siret=siret, raison_sociale=nom, adresse=adresse, naf_code="43.34Z", effectif_tranche="10 à 19 salariés")


@pytest.fixture
def sirene(monkeypatch):
    import routers.auth as auth_mod
    appels = []

    def _lookup(s):
        appels.append(s)
        return _info(s)
    monkeypatch.setattr(auth_mod.insee_service, "lookup_siret", _lookup)
    return appels


def _profil_non_vide(db, org, **kw):
    org.name = "Ancien nom"
    org.forme_juridique = "SARL"
    org.address = "1 rue Ancienne 51000 CHALONS"
    for k, v in kw.items():
        setattr(org, k, v)
    db.commit()


def test_siret_valide_remplit_nom_et_garde_l_adresse_deja_saisie(client, db_session, test_org, sirene):
    _profil_non_vide(db_session, test_org)
    r = client.post("/api/auth/sync", json={"siret": VALID, "depuis_profil": True})
    assert r.status_code == 200, r.text
    assert "siret_warning" not in r.json()
    assert sirene == [VALID]
    db_session.refresh(test_org)
    assert test_org.siret == VALID and test_org.siret_verified is True
    assert test_org.name == "BATI FACADE SARL"                       # la raison sociale du répertoire
    assert test_org.address == "1 rue Ancienne 51000 CHALONS"        # comme à l'inscription : l'adresse saisie est gardée
    assert r.json()["organization"]["name"] == "BATI FACADE SARL"    # lu par la règle services/raison_sociale.py


def test_siret_valide_remplit_l_adresse_quand_elle_est_vide(client, db_session, test_org, sirene):
    _profil_non_vide(db_session, test_org, address=None)
    client.post("/api/auth/sync", json={"siret": VALID, "depuis_profil": True})
    db_session.refresh(test_org)
    assert test_org.address == "12 RUE DES MACONS 14000 CAEN"


def test_siret_invalide_message_sobre_et_rien_ne_change(client, db_session, test_org, sirene):
    _profil_non_vide(db_session, test_org, siret=VALID, siret_verified=True)
    r = client.post("/api/auth/sync", json={"siret": INVALIDE, "depuis_profil": True})
    assert r.status_code == 200
    avertissement = r.json()["siret_warning"]
    assert "invalide" in avertissement.lower()
    assert "Mon entreprise" not in avertissement and "!" not in avertissement
    assert sirene == []                                               # aucun appel au répertoire
    db_session.refresh(test_org)
    assert test_org.siret == VALID and test_org.name == "Ancien nom"


def test_siret_deja_pris_n_enleve_pas_l_essai_d_un_compte_existant(client, db_session, test_org, sirene):
    _profil_non_vide(db_session, test_org)
    db_session.add(Organization(id="org-autre", name="Autre", siret=VALID))
    db_session.commit()
    r = client.post("/api/auth/sync", json={"siret": VALID, "depuis_profil": True})
    avertissement = r.json()["siret_warning"]
    assert "déjà" in avertissement and "essai" not in avertissement.lower()
    db_session.refresh(test_org)
    assert test_org.siret is None and test_org.trial_granted is True


def test_sirene_indisponible_le_numero_est_garde_a_verifier(client, db_session, test_org, monkeypatch):
    import routers.auth as auth_mod
    from services.insee_service import SireneUnavailableError

    def _panne(s):
        raise SireneUnavailableError("down")
    monkeypatch.setattr(auth_mod.insee_service, "lookup_siret", _panne)
    _profil_non_vide(db_session, test_org)
    r = client.post("/api/auth/sync", json={"siret": VALID, "depuis_profil": True})
    assert "indisponible" in r.json()["siret_warning"]
    db_session.refresh(test_org)
    assert test_org.siret == VALID and test_org.siret_verified is False and test_org.name == "Ancien nom"


def test_l_organisation_vient_du_jeton_jamais_du_corps(client, db_session, test_org, sirene):
    """Cross-org : un identifiant d'organisation glissé dans le corps est ignoré ; l'autre entreprise ne bouge pas."""
    autre = Organization(id="org-b", name="Dupré SARL", siret=AUTRE_VALIDE, siret_verified=True)
    db_session.add(autre)
    db_session.commit()
    r = client.post("/api/auth/sync", json={"siret": VALID, "depuis_profil": True,
                                            "organization_id": "org-b", "org_id": "org-b"})
    assert r.status_code == 200
    db_session.refresh(autre)
    db_session.refresh(test_org)
    assert autre.siret == AUTRE_VALIDE and autre.name == "Dupré SARL"
    assert test_org.siret == VALID
