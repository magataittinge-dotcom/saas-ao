"""Un jeton forgé ne déclenche pas un appel au JWKS de Clerk à chaque requête.

GHSA-fhv5-28vv-h8m8 (CVE-2026-48524) puis GHSA-2gx3-rcp4-g85q (CVE-2026-101917,
correctif incomplet) : jusqu'à PyJWT 2.14, `PyJWKClient` rechargeait le jeu de
clés de Clerk pour chaque `kid` inconnu. Le `kid` est lu dans l'en-tête du
jeton, avant toute vérification : sans compte, n'importe qui pouvait faire
partir un appel bloquant vers Clerk (délai 30 s) par requête, dans un fil du
pool de l'API (un seul processus sur le KVM 1). PyJWT 2.15.1 : au plus un
rechargement forcé par 30 s.

Aucun appel réseau : le chargement du JWKS est remplacé par un compteur.
"""
import base64
import json

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from routers import auth


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _jeton_forge(kid: str) -> str:
    entete = _b64(json.dumps({"alg": "RS256", "typ": "JWT", "kid": kid}).encode())
    charge = _b64(json.dumps({"sub": "user_inconnu"}).encode())
    return f"{entete}.{charge}.{_b64(b'signature-fausse')}"


@pytest.fixture
def jwks_compte(monkeypatch):
    """Le vrai client de Synorix (`_get_jwks_client`), JWKS remplacé par un compteur."""
    cle = rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key()
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(cle))
    jwk.update({"kid": "cle-connue", "use": "sig", "alg": "RS256"})
    monkeypatch.setattr(auth, "_jwks_client", None)
    client = auth._get_jwks_client()
    appels = {"n": 0}

    def fetch_data():
        appels["n"] += 1
        return {"keys": [jwk]}

    monkeypatch.setattr(client, "fetch_data", fetch_data)
    return appels


def test_jetons_forges_ne_rechargent_pas_le_jwks_a_chaque_requete(jwks_compte):
    for i in range(20):
        with pytest.raises(Exception):  # jeton refusé : seul le nombre d'appels compte ici
            auth._decode_clerk_token(_jeton_forge(f"kid-inconnu-{i}"))
    assert jwks_compte["n"] <= 2, f"{jwks_compte['n']} appels au JWKS de Clerk pour 20 jetons forgés"
