"""Finale (12/11) — tolérance d'horloge courte et bornée sur le jeton de Clerk.

Vu sur le banc environ une connexion sur dix : l'horloge du serveur retarde de quelques
secondes sur celle de Clerk, le jeton tout juste émis porte un `iat`/`nbf` « dans le futur »,
PyJWT lève `ImmatureSignatureError` et le client lit « Votre session n'est plus reconnue ».
Règle : une tolérance de quelques secondes (`auth.TOLERANCE_HORLOGE_S`, la valeur d'usage du
SDK de Clerk), jamais plus ; un jeton émis « dans 5 minutes » ou expiré au-delà de la tolérance
reste refusé. Aucun appel réseau : le JWKS est remplacé par la clé publique de test.
"""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from routers import auth


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
    monkeypatch.setattr(auth.settings, "FRONTEND_URL", "https://synorix.tech")
    monkeypatch.setattr(auth.settings, "DEBUG", False)


def _jeton(cle, decalage_emission: int, duree: int = 60) -> str:
    """Jeton émis à `maintenant + decalage_emission` (comme une horloge de Clerk en avance)."""
    emis = int(time.time()) + decalage_emission
    charge = {"sub": "user_inventé", "iat": emis, "nbf": emis, "exp": emis + duree}
    return jwt.encode(charge, cle, algorithm="RS256", headers={"kid": "k"})


def test_tolerance_courte_et_bornee():
    assert 0 < auth.TOLERANCE_HORLOGE_S <= 10


def test_jeton_emis_dans_5_secondes_accepte(cle, jwks):
    assert auth._decode_clerk_token(_jeton(cle, 4))["sub"] == "user_inventé"


def test_jeton_emis_dans_5_minutes_refuse(cle, jwks):
    with pytest.raises(HTTPException) as e:
        auth._decode_clerk_token(_jeton(cle, 300))
    assert e.value.status_code == 401


def test_jeton_expire_refuse(cle, jwks):
    """Expiré il y a 30 s (bien au-delà de la tolérance) : refusé, « session expirée »."""
    with pytest.raises(HTTPException) as e:
        auth._decode_clerk_token(_jeton(cle, -90, duree=60))
    assert e.value.status_code == 401
    assert "expiré" in e.value.detail


def test_jeton_normal_accepte(cle, jwks):
    assert auth._decode_clerk_token(_jeton(cle, 0))["sub"] == "user_inventé"
