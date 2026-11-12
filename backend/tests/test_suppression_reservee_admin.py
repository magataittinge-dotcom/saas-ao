"""Point 74 de DECISIONS.md — supprimer le compte efface TOUTE l'organisation (AO, coffre-fort, équipe, abonnement) : le
geste est réservé à l'administrateur. Un simple membre reçoit un 403 avec une phrase qui dit à qui s'adresser, et rien
ne change (ni demande posée, ni ligne effacée, ni appel au fournisseur de paiement). Même règle pour l'annulation d'une
suppression programmée et pour l'aperçu du dialogue."""
from datetime import datetime, timedelta

from models.organization import Organization
from models.project import Project
from models.user import User

PHRASE = "réservée à l’administrateur"


def _membre(db_session, test_user):
    db_session.get(User, test_user.id).role = "member"
    db_session.add(Project(id="p-membre", organization_id=test_user.organization_id, name="AO du membre"))
    db_session.commit()


def _interdire_paiement(monkeypatch):
    from services import resiliation_compte

    def _jamais(*a, **k):
        raise AssertionError("aucun appel au fournisseur de paiement pour un membre")
    monkeypatch.setattr(resiliation_compte, "programmer_ou_resilier", _jamais)
    monkeypatch.setattr(resiliation_compte, "reprendre_abonnements", _jamais)
    monkeypatch.setattr(resiliation_compte, "executer_suppression", _jamais)


def test_un_membre_ne_supprime_pas_l_organisation(client, db_session, test_user, monkeypatch):
    _membre(db_session, test_user)
    _interdire_paiement(monkeypatch)
    r = client.delete("/api/users/me")
    assert r.status_code == 403, r.text
    assert PHRASE in r.json()["detail"]
    db_session.expire_all()
    org = db_session.get(Organization, test_user.organization_id)
    assert org is not None and org.suppression_prevue_le is None
    assert db_session.get(Project, "p-membre") is not None


def test_un_membre_n_annule_pas_une_suppression_programmee(client, db_session, test_user, monkeypatch):
    _membre(db_session, test_user)
    _interdire_paiement(monkeypatch)
    prevue = datetime.utcnow() + timedelta(days=10)
    db_session.get(Organization, test_user.organization_id).suppression_prevue_le = prevue
    db_session.commit()
    r = client.post("/api/users/me/annuler-suppression")
    assert r.status_code == 403, r.text
    assert PHRASE in r.json()["detail"]
    db_session.expire_all()
    assert db_session.get(Organization, test_user.organization_id).suppression_prevue_le is not None


def test_un_membre_ne_lit_pas_l_apercu_de_suppression(client, db_session, test_user):
    _membre(db_session, test_user)
    r = client.get("/api/users/me/suppression")
    assert r.status_code == 403, r.text
    assert PHRASE in r.json()["detail"]


def test_l_administrateur_garde_le_geste(client, db_session, test_user):
    assert db_session.get(User, test_user.id).role == "admin"
    r = client.get("/api/users/me/suppression")
    assert r.status_code == 200, r.text
    assert r.json()["immediate"] is True
