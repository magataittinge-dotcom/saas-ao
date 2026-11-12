"""Webhook Stripe (suite de la relecture du 12/11, PAIEMENT-2) — un événement ne promeut ni ne rétrograde un client que
pour son abonnement vivant, relu chez le fournisseur ; l'offre se lit dans le PRIX de l'abonnement, jamais dans les
métadonnées d'une session ni dans le contenu d'un événement (Stripe réessaie pendant trois jours, sans ordre garanti).

Même faux fournisseur que `test_paiement_revue.py` (il garde l'état des abonnements) : aucun appel réel à Stripe.
"""
from datetime import datetime

import pytest

from models.organization import Organization
from tests.test_paiement_revue import (  # noqa: F401  (fixtures `abonne`, `poser`)
    FauxFournisseur, _abonnement, _org, _session, _webhook, abonne, poser,
)

ANCRE = datetime(2030, 1, 14, 10, 0)


def _checkout(offre="pro", sub="sub_invente", **autres):
    return dict(_session(offre=offre, sub=sub, **autres), id="cs_invente")


def _client_sans_abonnement(db_session):
    """Organisation revenue à l'offre gratuite (abonnement terminé) : son client de facturation reste connu."""
    org = _org(db_session)
    org.plan, org.stripe_customer_id, org.stripe_subscription_id, org.subscription_started_at = (
        "free", "cus_invente", None, None)
    db_session.commit()
    return org


# ── Constat 1 : `checkout.session.completed` n'ouvre une offre que pour un abonnement vivant, à l'offre de son prix ─

def test_c1_session_rejouee_apres_la_fin_de_l_abonnement_ne_rouvre_rien(client, test_org, poser, db_session):
    # Réessai tardif de Stripe (jusqu'à trois jours) : l'abonnement de la session est déjà terminé.
    _client_sans_abonnement(db_session)
    poser(FauxFournisseur([_abonnement(status="canceled")]))
    assert _webhook(client, "checkout.session.completed", _checkout()).status_code == 200
    org = _org(db_session)
    assert org.plan == "free"
    assert org.stripe_subscription_id is None and org.subscription_started_at is None


def test_c1_session_rejouee_apres_une_baisse_d_offre_garde_l_offre_payee(client, abonne, poser, db_session):
    # Passé de Business à Essentiel par le portail : même abonnement, prix Essentiel ; la session dit encore « business ».
    org = _org(db_session)
    org.plan = "essentiel"
    db_session.commit()
    poser(FauxFournisseur([_abonnement(offre="essentiel")]))
    _webhook(client, "checkout.session.completed", _checkout(offre="business"))
    org = _org(db_session)
    assert org.plan == "essentiel"
    assert org.subscription_started_at == ANCRE                       # pas de fenêtre de quotas neuve


def test_c1_l_offre_vient_du_prix_pas_des_metadonnees(client, test_org, poser, db_session):
    poser(FauxFournisseur([_abonnement(offre="essentiel")]))
    _webhook(client, "checkout.session.completed", _checkout(offre="business"))
    org = _org(db_session)
    assert org.plan == "essentiel" and org.stripe_subscription_id == "sub_invente"


def test_c1_abonnement_d_un_autre_client_n_ouvre_rien(client, test_org, poser, db_session):
    _client_sans_abonnement(db_session)
    poser(FauxFournisseur([_abonnement(customer="cus_quelqu_un_d_autre")]))
    _webhook(client, "checkout.session.completed", _checkout(customer="cus_quelqu_un_d_autre"))
    org = _org(db_session)
    assert org.plan == "free" and org.stripe_customer_id == "cus_invente" and org.stripe_subscription_id is None


def test_c1_session_deja_appliquee_n_ecrit_rien(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement()]))
    for _ in range(2):                                                # réessais de Stripe
        assert _webhook(client, "checkout.session.completed", _checkout()).status_code == 200
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at == ANCRE


def test_c1_un_autre_abonnement_vivant_deja_connu_n_est_pas_remplace(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(), _abonnement(id_="sub_autre", offre="business")]))
    _webhook(client, "checkout.session.completed", _checkout(offre="business", sub="sub_autre"))
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at == ANCRE


@pytest.mark.parametrize("statut", ["past_due", "incomplete", "unpaid", "canceled", "incomplete_expired"])
def test_c1_abonnement_non_vivant_n_ouvre_rien(client, test_org, poser, db_session, statut):
    poser(FauxFournisseur([_abonnement(status=statut)]))
    _webhook(client, "checkout.session.completed", _checkout())
    assert _org(db_session).plan == "free"


def test_c1_fournisseur_en_panne_stripe_reessaiera(client, test_org, poser, db_session):
    # Rien n'est écrit, et la réponse n'est pas 2xx : Stripe réessaie (le client qui vient de payer aura son offre).
    poser(FauxFournisseur([_abonnement()], panne=True))
    assert _webhook(client, "checkout.session.completed", _checkout()).status_code == 503
    assert _org(db_session).plan == "free"


def test_c1_organisation_inconnue_rien(client, test_org, poser, db_session):
    poser(FauxFournisseur([_abonnement()]))
    corps = _checkout()
    corps["metadata"] = {"organization_id": "org-qui-n-existe-pas", "plan": "pro"}
    corps["client_reference_id"] = "org-qui-n-existe-pas"
    assert _webhook(client, "checkout.session.completed", corps).status_code == 200
    assert _org(db_session).plan == "free"


@pytest.mark.parametrize("statut", ["active", "trialing"])
def test_c1_parcours_honnete_payer_et_avoir_son_offre_par_le_webhook(client, test_org, poser, db_session, statut):
    poser(FauxFournisseur([_abonnement(status=statut)]))
    assert _webhook(client, "checkout.session.completed", _checkout()).status_code == 200
    org = _org(db_session)
    assert org.plan == "pro"
    assert org.stripe_customer_id == "cus_invente" and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at is not None
    assert client.get("/api/billing/quota").json()["plan"] == "pro"


def test_c1_reabonnement_apres_une_resiliation(client, test_org, poser, db_session):
    # Ancien abonnement terminé (offre gratuite), le client repaie : le nouvel abonnement vivant est appliqué.
    _client_sans_abonnement(db_session)
    poser(FauxFournisseur([_abonnement(status="canceled"), _abonnement(id_="sub_neuf", offre="business")]))
    _webhook(client, "checkout.session.completed", _checkout(offre="business", sub="sub_neuf"))
    org = _org(db_session)
    assert org.plan == "business" and org.stripe_subscription_id == "sub_neuf"
    assert org.subscription_started_at is not None


def test_c1_abonnement_connu_mais_termine_le_nouvel_abonnement_vivant_est_applique(client, abonne, poser, db_session):
    # L'événement de fin de l'ancien abonnement s'est perdu : l'organisation le connaît encore, il est terminé.
    org = _org(db_session)
    org.plan = "free"
    db_session.commit()
    poser(FauxFournisseur([_abonnement(status="canceled"), _abonnement(id_="sub_neuf")]))
    _webhook(client, "checkout.session.completed", _checkout(sub="sub_neuf"))
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_neuf"


# ── Constat 2 : `customer.subscription.updated` n'agit que sur l'abonnement de l'organisation, relu chez le fournisseur ─

def _maj(id_="sub_invente", offre="pro", status="active", **autres):
    """Contenu d'un événement « updated » : ce qu'il dit, pas forcément ce qui est vrai chez le fournisseur."""
    return _abonnement(id_=id_, offre=offre, status=status, **autres)


def test_c2_evenement_ancien_ne_fait_pas_reculer_l_offre(client, abonne, poser, db_session):
    # Passé de Pro à Business par le portail ; un événement plus ancien (encore « pro ») arrive après.
    org = _org(db_session)
    org.plan = "business"
    db_session.commit()
    poser(FauxFournisseur([_abonnement(offre="business")]))
    assert _webhook(client, "customer.subscription.updated", _maj(offre="pro")).status_code == 200
    org = _org(db_session)
    assert org.plan == "business" and org.subscription_started_at == ANCRE


def test_c2_l_offre_vient_du_prix_relu(client, abonne, poser, db_session):
    # L'événement dit encore « business » ; chez le fournisseur, l'abonnement est déjà repassé à Essentiel.
    poser(FauxFournisseur([_abonnement(offre="essentiel")]))
    _webhook(client, "customer.subscription.updated", _maj(offre="business"))
    assert _org(db_session).plan == "essentiel"


def test_c2_evenement_d_un_doublon_ne_remplace_pas_l_abonnement(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(), _abonnement(id_="sub_doublon", offre="business")]))
    _webhook(client, "customer.subscription.updated", _maj(id_="sub_doublon", offre="business"))
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at == ANCRE


def test_c2_sans_abonnement_connu_un_abonnement_non_vivant_n_ouvre_rien(client, test_org, poser, db_session):
    # L'événement dit « active » ; relu, l'abonnement n'a jamais été payé.
    _client_sans_abonnement(db_session)
    poser(FauxFournisseur([_abonnement(status="incomplete_expired")]))
    _webhook(client, "customer.subscription.updated", _maj())
    org = _org(db_session)
    assert org.plan == "free" and org.stripe_subscription_id is None


def test_c2_sans_abonnement_connu_adopte_l_abonnement_vivant_de_son_client(client, test_org, poser, db_session):
    # L'événement du paiement s'est perdu et le client n'est pas revenu sur la page : l'abonnement vit, il est payé.
    _client_sans_abonnement(db_session)
    poser(FauxFournisseur([_abonnement()]))
    _webhook(client, "customer.subscription.updated", _maj())
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at is not None


def test_c2_abonnement_relu_d_un_autre_client_n_ouvre_rien(client, test_org, poser, db_session):
    _client_sans_abonnement(db_session)
    poser(FauxFournisseur([_abonnement(customer="cus_quelqu_un_d_autre")]))
    _webhook(client, "customer.subscription.updated", _maj())
    assert _org(db_session).plan == "free"


def test_c2_fournisseur_en_panne_rien_ne_change(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement()], panne=True))
    assert _webhook(client, "customer.subscription.updated", _maj(offre="business")).status_code == 200
    org = _org(db_session)
    assert org.plan == "pro" and org.subscription_started_at == ANCRE


def test_c2_impaye_rien_ne_change(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(status="past_due")]))
    _webhook(client, "customer.subscription.updated", _maj(status="past_due"))
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_invente"


@pytest.mark.parametrize("depart,arrivee", [("pro", "business"), ("business", "essentiel"), ("essentiel", "pro")])
def test_c2_parcours_honnete_changer_d_offre_par_le_portail(client, abonne, poser, db_session, depart, arrivee):
    org = _org(db_session)
    org.plan = depart
    db_session.commit()
    poser(FauxFournisseur([_abonnement(offre=arrivee)]))
    _webhook(client, "customer.subscription.updated", _maj(offre=arrivee))
    org = _org(db_session)
    assert org.plan == arrivee and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at != ANCRE                       # nouvelle offre : nouvelle fenêtre de quotas
    assert client.get("/api/billing/quota").json()["plan"] == arrivee


def test_c2_parcours_honnete_meme_offre_garde_l_ancre(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement()]))
    _webhook(client, "customer.subscription.updated", _maj())
    org = _org(db_session)
    assert org.plan == "pro" and org.subscription_started_at == ANCRE


def test_c2_parcours_honnete_resilier_dans_le_portail_garde_l_acces_jusqu_a_l_echeance(
        client, abonne, poser, db_session):
    # Arrêt à l'échéance : l'abonnement vit jusqu'à la fin de la période payée, l'offre reste.
    poser(FauxFournisseur([_abonnement(cancel_at_period_end=True)]))
    _webhook(client, "customer.subscription.updated", _maj(cancel_at_period_end=True))
    assert _org(db_session).plan == "pro"


# ── Constat 3 : la fin de l'abonnement connu ne rétrograde pas un client dont un autre abonnement payé vit encore ────

def test_c3_fin_de_l_abonnement_connu_un_doublon_vivant_garde_l_offre(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(status="canceled"), _abonnement(id_="sub_doublon")]))
    assert _webhook(client, "customer.subscription.deleted",
                    {"id": "sub_invente", "customer": "cus_invente"}).status_code == 200
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_doublon"
    assert org.subscription_started_at == ANCRE                       # même offre : la fenêtre de quotas ne bouge pas


def test_c3_le_doublon_vivant_donne_son_offre(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(status="canceled"), _abonnement(id_="sub_doublon", offre="business")]))
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    org = _org(db_session)
    assert org.plan == "business" and org.stripe_subscription_id == "sub_doublon"
    assert org.subscription_started_at != ANCRE


def test_c3_avec_demande_de_suppression_l_acces_reste_jusqu_a_la_fin_du_doublon(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement(), _abonnement(id_="sub_doublon")])
    clerk = poser(f)
    assert client.delete("/api/users/me").json()["deleted"] is False
    f.abonnements[0]["status"] = "canceled"                           # le premier finit, le doublon court encore
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    org = _org(db_session)
    assert org is not None and org.suppression_prevue_le is not None
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_doublon"
    assert clerk.appels == []
    f.abonnements[1]["status"] = "canceled"                           # le doublon finit : la demande s'exécute
    _webhook(client, "customer.subscription.deleted", {"id": "sub_doublon", "customer": "cus_invente"})
    assert _org(db_session) is None
    assert clerk.appels == ["https://api.clerk.com/v1/users/user_clerk_invente"]


@pytest.mark.parametrize("statut", ["incomplete", "incomplete_expired", "canceled"])
def test_c3_un_autre_abonnement_jamais_paye_ne_garde_rien(client, abonne, poser, db_session, statut):
    poser(FauxFournisseur([_abonnement(status="canceled"), _abonnement(id_="sub_doublon", status=statut)]))
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    org = _org(db_session)
    assert org.plan == "free" and org.stripe_subscription_id is None and org.subscription_started_at is None


def test_c3_parcours_honnete_resilier_puis_echeance_offre_gratuite(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(status="canceled")]))
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    org = _org(db_session)
    assert org.plan == "free" and org.stripe_subscription_id is None and org.subscription_started_at is None
    assert client.get("/api/billing/quota").json()["plan"] == "free"
