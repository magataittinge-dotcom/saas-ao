"""Répétition du 3/11 — le jeton Clerk n'est accepté que s'il a été obtenu sur
l'origine de Synorix (revendication `azp`, « authorized party »).

Sans cette vérification, avec une seule instance Clerk partagée entre le PC de
développement et synorix.tech, un jeton obtenu sur `http://localhost:3000` était
accepté par la production. Règle :
  • `azp` présent : doit être `FRONTEND_URL` (ou, en DEBUG seulement, une origine
    locale du front) sinon 401 ;
  • `azp` absent : accepté. Clerk le pose sur les jetons de session émis à un
    navigateur ; un jeton sans `azp` vient de l'API Backend de Clerk, que seul le
    détenteur de la clé secrète peut appeler, et le SDK officiel de Clerk fait de
    même (il ne contrôle `azp` que s'il est présent). La signature (JWKS) reste
    vérifiée dans tous les cas.
Aucun appel réseau : le JWKS est remplacé par la clé publique de test.
"""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from routers import auth

PROD = "https://synorix.tech"


@pytest.fixture(scope="module")
def cle():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def jwks(cle, monkeypatch):
    class _Cle:
        key = cle.public_key()

    class _Client:
        def get_signing_key_from_jwt(self, token):
            return _Cle()

    monkeypatch.setattr(auth, "_get_jwks_client", lambda: _Client())


def _jeton(cle, **revendications) -> str:
    charge = {"sub": "user_inventé", "exp": int(time.time()) + 300, **revendications}
    return jwt.encode(charge, cle, algorithm="RS256", headers={"kid": "k"})


@pytest.fixture
def prod(monkeypatch):
    monkeypatch.setattr(auth.settings, "FRONTEND_URL", PROD)
    monkeypatch.setattr(auth.settings, "DEBUG", False)


@pytest.fixture
def dev(monkeypatch):
    monkeypatch.setattr(auth.settings, "FRONTEND_URL", "http://localhost:3000")
    monkeypatch.setattr(auth.settings, "DEBUG", True)


def test_azp_de_synorix_accepte(cle, jwks, prod):
    assert auth._decode_clerk_token(_jeton(cle, azp=PROD))["sub"] == "user_inventé"


def test_azp_avec_barre_finale_dans_frontend_url_accepte(cle, jwks, monkeypatch):
    monkeypatch.setattr(auth.settings, "FRONTEND_URL", PROD + "/")
    monkeypatch.setattr(auth.settings, "DEBUG", False)
    assert auth._decode_clerk_token(_jeton(cle, azp=PROD))


@pytest.mark.parametrize("azp", [
    "https://autre-site.example",
    "https://synorix.tech.evil.example",
    "http://synorix.tech",
    "https://www.synorix.tech",
    "",
    ["https://synorix.tech"],
    42,
])
def test_azp_etranger_ou_mal_forme_refuse_401(cle, jwks, prod, azp):
    with pytest.raises(HTTPException) as e:
        auth._decode_clerk_token(_jeton(cle, azp=azp))
    assert e.value.status_code == 401


@pytest.mark.parametrize("local", [
    "http://localhost:3000", "http://localhost:5173",
    "http://127.0.0.1:3000", "http://127.0.0.1:5173",
])
def test_azp_localhost_refuse_en_production(cle, jwks, prod, local):
    """Le cas visé : jeton obtenu sur le PC de développement, présenté à la prod."""
    with pytest.raises(HTTPException) as e:
        auth._decode_clerk_token(_jeton(cle, azp=local))
    assert e.value.status_code == 401


@pytest.mark.parametrize("local", ["http://localhost:3000", "http://localhost:5173"])
def test_azp_localhost_accepte_en_debug(cle, jwks, dev, local):
    assert auth._decode_clerk_token(_jeton(cle, azp=local))


def test_azp_etranger_refuse_meme_en_debug(cle, jwks, dev):
    with pytest.raises(HTTPException) as e:
        auth._decode_clerk_token(_jeton(cle, azp="https://autre-site.example"))
    assert e.value.status_code == 401


def test_azp_absent_accepte(cle, jwks, prod):
    """Décision : absent = accepté (voir l'en-tête du fichier)."""
    assert auth._decode_clerk_token(_jeton(cle))["sub"] == "user_inventé"


def test_signature_toujours_verifiee(cle, jwks, prod):
    """`azp` correct ne remplace pas la signature."""
    autre = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException) as e:
        auth._decode_clerk_token(_jeton(autre, azp=PROD))
    assert e.value.status_code == 401


def test_route_protegee_refuse_un_jeton_localhost_en_production(cle, jwks, prod):
    """Chaîne d'authentification réelle : 401 avant tout accès à la base."""
    from fastapi.testclient import TestClient

    from main import app

    r = TestClient(app, raise_server_exceptions=False).get(
        "/api/auth/me", headers={"Authorization": f"Bearer {_jeton(cle, azp='http://localhost:3000')}"})
    assert r.status_code == 401, r.text
