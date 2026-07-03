"""
Tests C2 — vérification SIRET via l'API Sirene (recherche-entreprises.api.gouv.fr).

Contrat :
  • SIRET valide → lookup Sirene → profil org pré-rempli (raison sociale,
    adresse, NAF, tranche effectif), siret_verified=True.
  • SIRET au format invalide → erreur claire, inscription NON bloquée
    (fallback saisie manuelle, siret non stocké).
  • SIRET introuvable / API down → dégradation gracieuse : compte créé,
    siret stocké non vérifié, warning explicite.
  • 1 SIRET = 1 essai gratuit : doublon → compte OK mais trial_granted=False
    → quota free à 0 (402 avec message clair).
"""
import pytest

from models.organization import Organization


# Exemple de la documentation INSEE — clé de Luhn valide.
VALID_SIRET = "73282932000074"
INVALID_LUHN_SIRET = "12345678901234"


def _fake_info(siret: str = VALID_SIRET):
    from services.insee_service import SireneInfo
    return SireneInfo(
        siret=siret,
        raison_sociale="BATI FACADE SARL",
        adresse="12 RUE DES MACONS 14000 CAEN",
        naf_code="43.34Z",
        effectif_tranche="10 à 19 salariés",
    )


# ─── Validation de format (unit) ─────────────────────────────────────────────

def test_normalize_siret_accepts_valid_luhn():
    from services.insee_service import normalize_siret

    assert normalize_siret(VALID_SIRET) == VALID_SIRET
    assert normalize_siret("732 829 320 00074") == VALID_SIRET  # espaces tolérés


def test_normalize_siret_rejects_bad_input():
    from services.insee_service import SiretFormatError, normalize_siret

    with pytest.raises(SiretFormatError):
        normalize_siret("1234")                    # trop court
    with pytest.raises(SiretFormatError):
        normalize_siret("ABCDEFGHIJKLMN")          # non numérique
    with pytest.raises(SiretFormatError):
        normalize_siret(INVALID_LUHN_SIRET)        # clé de Luhn invalide
    with pytest.raises(SiretFormatError):
        normalize_siret("")


def test_normalize_siret_la_poste_exception():
    """Les SIRET La Poste (356000000XXXXX) échappent à la règle de Luhn."""
    from services.insee_service import normalize_siret

    assert normalize_siret("35600000000048") == "35600000000048"


# ─── Parsing de la réponse API (unit) ────────────────────────────────────────

def test_lookup_parses_api_payload(monkeypatch):
    import services.insee_service as insee

    payload = {
        "results": [{
            "nom_raison_sociale": "BATI FACADE SARL",
            "nom_complet": "BATI FACADE",
            "siege": {
                "siret": VALID_SIRET,
                "adresse": "12 RUE DES MACONS 14000 CAEN",
                "activite_principale": "43.34Z",
                "tranche_effectif_salarie": "11",
            },
            "matching_etablissements": [],
        }],
        "total_results": 1,
    }
    monkeypatch.setattr(insee, "_fetch_sirene", lambda siret: payload)

    info = insee.lookup_siret(VALID_SIRET)
    assert info.raison_sociale == "BATI FACADE SARL"
    assert info.adresse == "12 RUE DES MACONS 14000 CAEN"
    assert info.naf_code == "43.34Z"
    assert info.effectif_tranche == "10 à 19 salariés"  # code 11 → label


def test_lookup_not_found(monkeypatch):
    import services.insee_service as insee

    monkeypatch.setattr(insee, "_fetch_sirene", lambda siret: {"results": [], "total_results": 0})
    with pytest.raises(insee.SiretNotFoundError):
        insee.lookup_siret(VALID_SIRET)


def test_lookup_retries_then_succeeds(monkeypatch):
    """Une erreur réseau transitoire est réessayée avant de réussir."""
    import services.insee_service as insee

    calls = {"n": 0}

    def flaky(siret):
        calls["n"] += 1
        if calls["n"] == 1:
            raise insee.SireneUnavailableError("timeout")
        return {
            "results": [{"nom_raison_sociale": "X", "siege": {"siret": siret}}],
            "total_results": 1,
        }

    monkeypatch.setattr(insee, "_fetch_sirene", flaky)
    monkeypatch.setattr(insee.time, "sleep", lambda s: None)

    info = insee.lookup_siret(VALID_SIRET)
    assert info.raison_sociale == "X"
    assert calls["n"] == 2


def test_lookup_gives_up_after_retries(monkeypatch):
    import services.insee_service as insee

    def down(siret):
        raise insee.SireneUnavailableError("down")

    monkeypatch.setattr(insee, "_fetch_sirene", down)
    monkeypatch.setattr(insee.time, "sleep", lambda s: None)

    with pytest.raises(insee.SireneUnavailableError):
        insee.lookup_siret(VALID_SIRET)


# ─── Inscription : POST /auth/sync ───────────────────────────────────────────

def test_sync_valid_siret_prefills_profile(client, db_session, test_org, monkeypatch):
    import routers.auth as auth_mod

    monkeypatch.setattr(auth_mod.insee_service, "lookup_siret", lambda s: _fake_info(s))

    resp = client.post("/api/auth/sync", json={"siret": VALID_SIRET, "plan": "free"})
    assert resp.status_code == 200, resp.text

    db_session.refresh(test_org)
    assert test_org.siret == VALID_SIRET
    assert test_org.siret_verified is True
    assert test_org.address == "12 RUE DES MACONS 14000 CAEN"
    assert test_org.naf_code == "43.34Z"
    assert test_org.effectif_tranche == "10 à 19 salariés"
    assert test_org.trial_granted is True
    # La raison sociale pré-remplit le nom si l'utilisateur n'en a pas fourni.
    assert test_org.name == "BATI FACADE SARL"


def test_sync_user_provided_name_takes_precedence(client, db_session, test_org, monkeypatch):
    import routers.auth as auth_mod

    monkeypatch.setattr(auth_mod.insee_service, "lookup_siret", lambda s: _fake_info(s))

    resp = client.post("/api/auth/sync", json={
        "organization_name": "Mon Nom Choisi",
        "siret": VALID_SIRET,
    })
    assert resp.status_code == 200
    db_session.refresh(test_org)
    assert test_org.name == "Mon Nom Choisi"
    assert test_org.address == "12 RUE DES MACONS 14000 CAEN"


def test_sync_invalid_siret_not_blocking(client, db_session, test_org):
    """Format invalide → erreur claire mais inscription NON bloquée."""
    resp = client.post("/api/auth/sync", json={
        "organization_name": "Ma Boite",
        "siret": INVALID_LUHN_SIRET,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "siret_warning" in body
    assert "invalide" in body["siret_warning"].lower()

    db_session.refresh(test_org)
    assert test_org.siret is None          # pas de SIRET erroné stocké
    assert test_org.name == "Ma Boite"     # le compte vit sa vie


def test_sync_api_down_graceful(client, db_session, test_org, monkeypatch):
    """API Sirene indisponible → SIRET stocké non vérifié, compte OK."""
    import routers.auth as auth_mod
    from services.insee_service import SireneUnavailableError

    def down(s):
        raise SireneUnavailableError("api down")
    monkeypatch.setattr(auth_mod.insee_service, "lookup_siret", down)

    resp = client.post("/api/auth/sync", json={"siret": VALID_SIRET})
    assert resp.status_code == 200
    assert "siret_warning" in resp.json()

    db_session.refresh(test_org)
    assert test_org.siret == VALID_SIRET
    assert test_org.siret_verified is False
    assert test_org.trial_granted is True  # pas pénalisé par une panne INSEE


def test_sync_duplicate_siret_refuses_trial_not_account(
    client, db_session, test_org, monkeypatch,
):
    """Doublon SIRET → le COMPTE est créé mais l'essai gratuit est refusé."""
    import routers.auth as auth_mod

    other = Organization(id="org-deja-la", name="Premier Compte", siret=VALID_SIRET)
    db_session.add(other)
    db_session.commit()

    monkeypatch.setattr(auth_mod.insee_service, "lookup_siret", lambda s: _fake_info(s))

    resp = client.post("/api/auth/sync", json={"siret": VALID_SIRET})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "siret_warning" in body
    assert "essai" in body["siret_warning"].lower()

    db_session.refresh(test_org)
    assert test_org.trial_granted is False
    assert test_org.siret is None          # l'unicité en base est préservée


def test_free_org_without_trial_is_blocked_with_clear_message(db_session, test_org):
    from fastapi import HTTPException
    from services.quota import check_quota

    test_org.trial_granted = False
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        check_quota(db_session, test_org, "analysis")
    assert exc.value.status_code == 402
    assert "SIRET" in exc.value.detail
