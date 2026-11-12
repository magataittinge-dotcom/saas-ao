"""S-09 (audit de sécurité, P2) — un compte local n'est relié à un compte Clerk que par son adresse PRINCIPALE et VÉRIFIÉE.

Avant : `_sync_clerk_user` prenait `email_addresses[0]` sans regarder si l'adresse était vérifiée ni principale, et
réécrivait `clerk_id` même s'il pointait déjà vers un autre compte Clerk : quiconque faisait accepter à Clerk une
adresse non vérifiée prenait le compte local (et l'organisation) qui portait cette adresse.
Désormais : adresse principale (`primary_email_address_id`) ; liaison seulement si elle est vérifiée (sinon 403, rien
n'est relié). Un compte déjà relié à un autre compte Clerk est relié de nouveau si l'adresse est vérifiée, avec une
alerte au journal : sinon le passage à l'instance Clerk de production (nouveaux identifiants) fermerait la porte à
tous les clients (décision notée dans le rapport SERVEUR-1). Faux Clerk, aucun appel réseau.
"""
import pytest
from fastapi import HTTPException

import routers.auth as auth_mod
from models.organization import Organization
from models.user import User


def _clerk(adresses, principale=None):
    return {"id": "x", "primary_email_address_id": principale, "email_addresses": adresses,
            "first_name": "Prénom", "last_name": "Nom"}


def _adresse(id_, email, statut="verified"):
    return {"id": id_, "email_address": email, "verification": {"status": statut}}


@pytest.fixture
def compte_local(db_session):
    db_session.add(Organization(id="org-loc", name="Locale"))
    db_session.add(User(id="u-loc", email="patron@exemple.test", name="Patron", organization_id="org-loc"))
    db_session.commit()


def _sync(monkeypatch, db, donnees, clerk_id="clerk-nouveau"):
    monkeypatch.setattr(auth_mod, "_fetch_clerk_user", lambda _id: donnees)
    return auth_mod._sync_clerk_user(clerk_id, db)


def test_adresse_principale_verifiee_relie_le_compte(db_session, compte_local, monkeypatch):
    user = _sync(monkeypatch, db_session, _clerk([_adresse("e1", "autre@exemple.test"),
                                                  _adresse("e2", "patron@exemple.test")], principale="e2"))
    assert user.id == "u-loc" and user.clerk_id == "clerk-nouveau"


def test_adresse_non_verifiee_ne_relie_pas(db_session, compte_local, monkeypatch):
    with pytest.raises(HTTPException) as e:
        _sync(monkeypatch, db_session, _clerk([_adresse("e1", "patron@exemple.test", "unverified")], principale="e1"))
    assert e.value.status_code == 403
    db_session.expire_all()
    assert db_session.get(User, "u-loc").clerk_id is None


def test_seule_l_adresse_principale_compte(db_session, compte_local, monkeypatch):
    """La première adresse n'est pas forcément la principale : c'est la principale qui décide."""
    user = _sync(monkeypatch, db_session, _clerk([_adresse("e1", "patron@exemple.test", "unverified"),
                                                  _adresse("e2", "neuf@exemple.test")], principale="e2"))
    assert user.id != "u-loc" and user.email == "neuf@exemple.test"
    db_session.expire_all()
    assert db_session.get(User, "u-loc").clerk_id is None


def test_compte_deja_relie_a_un_autre_clerk(db_session, compte_local, monkeypatch, caplog):
    db_session.get(User, "u-loc").clerk_id = "clerk-ancien"
    db_session.commit()
    with pytest.raises(HTTPException) as e:                       # adresse non vérifiée : rien ne change
        _sync(monkeypatch, db_session, _clerk([_adresse("e1", "patron@exemple.test", "unverified")], principale="e1"))
    assert e.value.status_code == 403
    db_session.expire_all()
    assert db_session.get(User, "u-loc").clerk_id == "clerk-ancien"
    with caplog.at_level("WARNING", logger="routers.auth"):       # vérifiée : reliée, alerte sans adresse
        user = _sync(monkeypatch, db_session, _clerk([_adresse("e1", "patron@exemple.test")], principale="e1"))
    assert user.id == "u-loc" and user.clerk_id == "clerk-nouveau"
    alertes = [r.getMessage() for r in caplog.records if r.name == "routers.auth"]
    assert alertes and all("patron@" not in a for a in alertes)


def test_messages_sobres():
    for msg in (auth_mod.MSG_ADRESSE_A_CONFIRMER,):
        assert "!" not in msg and not any(m in msg.lower() for m in ("manquant", "incomplet", "absent"))
