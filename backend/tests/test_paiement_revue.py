"""Relecture du serveur (12/11) — failles du paiement et de la suppression programmée (D23), corrigées ici.

Scénarios de `outils-revue/test_revue_stripe.py`, remis à l'endroit : chaque test dit ce qui doit se passer.
Faux fournisseur de paiement qui garde l'état des abonnements, faux Clerk : aucun appel réel à Stripe ni à Clerk.
"""
import json
from datetime import datetime

import pytest

from models.organization import Organization
from models.project import Project
from models.user import User

FIN = int(datetime(2030, 3, 14, 10, 0).timestamp())
PRODUITS = {"essentiel": "prod_essentiel_invente", "pro": "prod_pro_invente", "business": "prod_business_invente"}


def _abonnement(id_="sub_invente", offre="pro", status="active", **autres):
    sub = {"id": id_, "status": status, "current_period_end": FIN, "customer": "cus_invente",
           "cancel_at_period_end": False, "items": {"data": [{"price": {"product": PRODUITS[offre]}}]}}
    sub.update(autres)
    return sub


class FauxFournisseur:
    """Garde l'état : `cancel_subscription(at_period_end=True)` met l'arrêt à l'échéance, `resume_subscription` l'ôte."""

    def __init__(self, abonnements=(), session=None, panne=False):
        self.abonnements = [dict(a) for a in abonnements]
        self.session = session
        self.panne = panne
        self.resilies, self.repris = [], []
        # Sessions de paiement (REVUE-2 P1-3) : ouvertes par client, expirées sur demande.
        self.sessions_ouvertes: list[dict] = []
        self.expirees: list[str] = []
        self.panne_expiration = False

    def _verifier(self):
        if self.panne:
            raise RuntimeError("fournisseur injoignable")

    def _sub(self, subscription_id):
        return next((a for a in self.abonnements if a["id"] == subscription_id), None)

    def list_subscriptions(self, customer_id):
        self._verifier()
        return [dict(a) for a in self.abonnements if a.get("customer", customer_id) == customer_id]

    def retrieve_subscription(self, subscription_id):
        self._verifier()
        sub = self._sub(subscription_id)
        if sub is None:
            from services.billing import BillingError
            raise BillingError("abonnement inconnu")
        return dict(sub)

    def retrieve_session(self, session_id):
        self._verifier()
        return self.session

    def cancel_subscription(self, subscription_id, at_period_end=True):
        self._verifier()
        self.resilies.append((subscription_id, at_period_end))
        sub = self._sub(subscription_id)
        if sub is not None:
            if at_period_end:
                sub["cancel_at_period_end"] = True
            else:
                sub["status"] = "canceled"

    def resume_subscription(self, subscription_id):
        self._verifier()
        self.repris.append(subscription_id)
        sub = self._sub(subscription_id)
        if sub is not None:
            sub["cancel_at_period_end"] = False

    def get_customer(self, customer_id):
        self._verifier()
        return {"id": customer_id}

    def get_default_price_for_product(self, product_id):
        return f"price_{product_id}"

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, metadata=None,
                                client_reference_id=None):
        self._verifier()
        sid = f"cs_invente_{len(self.sessions_ouvertes) + len(self.expirees) + 1}"
        self.sessions_ouvertes.append({"id": sid, "customer": customer_id, "price": price_id})
        return f"https://paiement.invalid/{sid}"

    def expire_open_checkout_sessions(self, customer_id):
        self._verifier()
        if self.panne_expiration:
            raise RuntimeError("fournisseur injoignable")
        a_expirer = [s for s in self.sessions_ouvertes if s["customer"] == customer_id]
        self.sessions_ouvertes = [s for s in self.sessions_ouvertes if s["customer"] != customer_id]
        self.expirees += [s["id"] for s in a_expirer]
        return len(a_expirer)

    def verify_webhook(self, payload, signature):
        return json.loads(payload)


class FauxClerk:
    def __init__(self):
        self.appels = []

    def delete(self, url, headers=None, timeout=None):
        self.appels.append(url)
        return type("R", (), {"status_code": 200})()


@pytest.fixture
def poser(monkeypatch):
    import httpx

    import routers.stripe_billing as sb
    from services.billing import factory

    monkeypatch.setattr(sb, "PRODUCTS", dict(PRODUITS))

    def _poser(fournisseur, clerk=None):
        clerk = clerk or FauxClerk()
        monkeypatch.setattr(factory, "get_billing_provider", lambda: fournisseur)
        monkeypatch.setattr(sb, "get_billing_provider", lambda: fournisseur)
        monkeypatch.setattr(sb.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test", raising=False)
        monkeypatch.setattr(httpx, "delete", clerk.delete)
        return clerk
    return _poser


@pytest.fixture
def abonne(db_session, test_org, test_user):
    org = db_session.get(Organization, test_org.id)
    org.plan, org.stripe_customer_id, org.stripe_subscription_id = "pro", "cus_invente", "sub_invente"
    org.subscription_started_at = datetime(2030, 1, 14, 10, 0)
    db_session.get(User, test_user.id).clerk_id = "user_clerk_invente"
    db_session.add(Project(id="p-revue", organization_id=test_org.id, name="AO"))
    db_session.commit()
    return org


def _org(db_session):
    db_session.expire_all()
    return db_session.get(Organization, "org-test-1")


def _webhook(client, type_, objet):
    return client.post("/api/stripe/webhook", json={"type": type_, "data": {"object": objet}},
                       headers={"stripe-signature": "t=1,v1=ok"})


def _session(offre="pro", sub="sub_invente", **autres):
    s = {"payment_status": "paid", "metadata": {"organization_id": "org-test-1", "plan": offre},
         "customer": "cus_invente", "subscription": sub}
    s.update(autres)
    return s


def _verifier_session(client):
    return client.get("/api/stripe/verify-session?session_id=cs_invente")


# ── P0-1 : verify-session ne rend une offre que pour un abonnement vivant, à l'offre de son prix ─────────────────

def test_p0_1_session_rejouee_apres_la_fin_de_l_abonnement_ne_rend_rien(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(status="canceled")], session=_session()))
    assert _webhook(client, "customer.subscription.deleted",
                    {"id": "sub_invente", "customer": "cus_invente"}).status_code == 200
    assert _org(db_session).plan == "free"
    r = _verifier_session(client)
    assert r.status_code == 200, r.text
    assert r.json() == {"plan": "free", "updated": False}
    org = _org(db_session)
    assert org.plan == "free"
    assert org.stripe_subscription_id is None and org.subscription_started_at is None


def test_p0_1_session_rejouee_apres_une_baisse_d_offre_garde_l_offre_payee(client, abonne, poser, db_session):
    # Passé de Business à Essentiel par le portail : même abonnement, prix Essentiel ; la session dit encore « business ».
    poser(FauxFournisseur([_abonnement(offre="essentiel")], session=_session(offre="business")))
    org = _org(db_session)
    org.plan = "essentiel"
    db_session.commit()
    r = _verifier_session(client)
    assert r.status_code == 200, r.text
    assert r.json()["plan"] == "essentiel"
    org = _org(db_session)
    assert org.plan == "essentiel"
    assert org.subscription_started_at == datetime(2030, 1, 14, 10, 0)     # pas de fenêtre de quotas neuve


def test_p0_1_l_offre_vient_du_prix_pas_des_metadonnees(client, test_org, poser, db_session):
    # Session neuve dont les métadonnées disent « business » sur un abonnement au prix Essentiel.
    poser(FauxFournisseur([_abonnement(offre="essentiel")], session=_session(offre="business")))
    r = _verifier_session(client)
    assert r.status_code == 200, r.text
    assert r.json() == {"plan": "essentiel", "updated": True}
    assert _org(db_session).plan == "essentiel"


def test_p0_1_abonnement_d_un_autre_client_refuse(client, test_org, poser, db_session):
    poser(FauxFournisseur([_abonnement(customer="cus_quelqu_un_d_autre")], session=_session()))
    r = _verifier_session(client)
    assert r.status_code == 200, r.text
    assert r.json() == {"plan": "free", "updated": False}
    assert _org(db_session).plan == "free"


def test_p0_1_un_autre_abonnement_deja_connu_n_est_pas_remplace(client, abonne, poser, db_session):
    # L'organisation paie déjà sub_invente ; une vieille session d'un autre abonnement (vivant) ne le remplace pas.
    f = FauxFournisseur([_abonnement(), _abonnement(id_="sub_autre", offre="business")],
                        session=_session(offre="business", sub="sub_autre"))
    poser(f)
    r = _verifier_session(client)
    assert r.json()["updated"] is False
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_invente"


@pytest.mark.parametrize("statut", ["active", "trialing"])
def test_p0_1_parcours_honnete_payer_revenir_voir_son_offre(client, test_org, poser, db_session, statut):
    poser(FauxFournisseur([_abonnement(status=statut)], session=_session()))
    r = _verifier_session(client)
    assert r.status_code == 200, r.text
    assert r.json() == {"plan": "pro", "updated": True}
    org = _org(db_session)
    assert org.plan == "pro"
    assert org.stripe_customer_id == "cus_invente" and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at is not None
    # Les unités de l'offre se lisent tout de suite.
    quota = client.get("/api/billing/quota").json()
    assert quota["plan"] == "pro"


def test_p0_1_session_deja_appliquee_par_le_webhook_n_applique_rien_une_seconde_fois(
        client, test_org, poser, db_session):
    f = FauxFournisseur([_abonnement()], session=_session())
    poser(f)
    assert _webhook(client, "checkout.session.completed", dict(_session(), id="cs_invente")).status_code == 200
    ancre = _org(db_session).subscription_started_at
    assert ancre is not None
    for _ in range(2):                                         # le retour du paiement, puis un rechargement
        r = _verifier_session(client)
        assert r.json() == {"plan": "pro", "updated": True}    # l'écran confirme l'offre
    org = _org(db_session)
    assert org.plan == "pro" and org.subscription_started_at == ancre


@pytest.mark.parametrize("statut", ["past_due", "incomplete", "unpaid", "canceled"])
def test_p0_1_abonnement_non_vivant_ne_rend_rien(client, test_org, poser, db_session, statut):
    poser(FauxFournisseur([_abonnement(status=statut)], session=_session()))
    r = _verifier_session(client)
    assert r.json() == {"plan": "free", "updated": False}
    assert _org(db_session).plan == "free"


def test_p0_1_fournisseur_en_panne_ne_rend_rien(client, test_org, poser, db_session):
    f = FauxFournisseur([_abonnement()], session=_session())
    poser(f)

    def _panne(_id):
        raise __import__("services.billing", fromlist=["BillingError"]).BillingError("panne")
    f.retrieve_subscription = _panne
    r = _verifier_session(client)
    assert r.json() == {"plan": "free", "updated": False}
    assert _org(db_session).plan == "free"


# ── P1-1 : la fin d'un AUTRE abonnement ne remet pas un client payant en offre gratuite ──────────────────────────

def test_p1_1_fin_d_un_ancien_abonnement_ne_retrograde_pas(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(), _abonnement(id_="sub_ancien", status="canceled")]))
    assert _webhook(client, "customer.subscription.deleted",
                    {"id": "sub_ancien", "customer": "cus_invente"}).status_code == 200
    org = _org(db_session)
    assert org.plan == "pro" and org.stripe_subscription_id == "sub_invente"
    assert org.subscription_started_at == datetime(2030, 1, 14, 10, 0)


def test_p1_1_fin_d_un_ancien_abonnement_avec_demande_ne_coupe_pas_l_acces(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    clerk = poser(f)
    assert client.delete("/api/users/me").json()["deleted"] is False
    f.abonnements.append(_abonnement(id_="sub_ancien", status="canceled"))
    _webhook(client, "customer.subscription.deleted", {"id": "sub_ancien", "customer": "cus_invente"})
    org = _org(db_session)
    assert org is not None and org.suppression_prevue_le is not None
    assert org.plan == "pro"                                    # accès ouvert jusqu'à la fin de la période payée
    assert clerk.appels == []


def test_p1_1_fin_d_un_autre_abonnement_sans_aucun_payant_vivant_retrograde(client, abonne, poser, db_session):
    # L'abonnement connu est mort aussi (son propre événement s'est perdu) : plus rien de payé, offre gratuite.
    poser(FauxFournisseur([_abonnement(status="canceled"), _abonnement(id_="sub_ancien", status="canceled")]))
    _webhook(client, "customer.subscription.deleted", {"id": "sub_ancien", "customer": "cus_invente"})
    org = _org(db_session)
    assert org.plan == "free" and org.stripe_subscription_id is None


def test_p1_1_fin_d_un_autre_abonnement_fournisseur_en_panne_rien_ne_change(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement()], panne=True))
    assert _webhook(client, "customer.subscription.deleted",
                    {"id": "sub_ancien", "customer": "cus_invente"}).status_code == 200
    assert _org(db_session).plan == "pro"


def test_p1_1_fin_de_l_abonnement_de_l_organisation_retrograde(client, abonne, poser, db_session):
    poser(FauxFournisseur([_abonnement(status="canceled")]))
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    org = _org(db_session)
    assert org.plan == "free" and org.stripe_subscription_id is None and org.subscription_started_at is None
    assert db_session.get(Project, "p-revue") is not None      # sans demande : rien n'est supprimé


def test_p1_1_fin_de_l_abonnement_de_l_organisation_avec_demande_supprime(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    clerk = poser(f)
    client.delete("/api/users/me")
    f.abonnements = [_abonnement(status="canceled")]
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    assert _org(db_session) is None
    assert clerk.appels == ["https://api.clerk.com/v1/users/user_clerk_invente"]


# ── P1-2 : un événement « updated » arrivé dans le désordre n'efface pas la demande de suppression ───────────────

def _repris(statut="active"):
    return {"id": "sub_invente", "customer": "cus_invente", "status": statut, "cancel_at_period_end": False}


def test_p1_2_evenement_ancien_livre_apres_la_demande_ne_l_efface_pas(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    clerk = poser(f)
    assert client.delete("/api/users/me").json()["deleted"] is False
    assert f.abonnements[0]["cancel_at_period_end"] is True           # chez le fournisseur : arrêt à l'échéance
    # Un événement émis AVANT la demande (réessai de Stripe après une coupure) arrive après elle.
    assert _webhook(client, "customer.subscription.updated", _repris()).status_code == 200
    assert _org(db_session).suppression_prevue_le is not None         # la demande tient : l'état relu le dit
    # À l'échéance, la suppression se fait.
    f.abonnements = [_abonnement(status="canceled")]
    _webhook(client, "customer.subscription.deleted", {"id": "sub_invente", "customer": "cus_invente"})
    assert _org(db_session) is None
    assert db_session.get(Project, "p-revue") is None
    assert clerk.appels == ["https://api.clerk.com/v1/users/user_clerk_invente"]


def test_p1_2_reprise_depuis_le_portail_retire_la_demande(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    poser(f)
    client.delete("/api/users/me")
    f.abonnements[0]["cancel_at_period_end"] = False                  # le client reprend dans le portail
    _webhook(client, "customer.subscription.updated", _repris())
    assert _org(db_session).suppression_prevue_le is None


def test_p1_2_reprise_pendant_un_impaye_retire_aussi_la_demande(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    poser(f)
    client.delete("/api/users/me")
    f.abonnements[0].update(status="past_due", cancel_at_period_end=False)
    _webhook(client, "customer.subscription.updated", _repris("past_due"))
    assert _org(db_session).suppression_prevue_le is None


def test_p1_2_fournisseur_injoignable_la_demande_reste(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    poser(f)
    client.delete("/api/users/me")
    f.abonnements[0]["cancel_at_period_end"] = False
    f.panne = True
    assert _webhook(client, "customer.subscription.updated", _repris()).status_code == 200
    assert _org(db_session).suppression_prevue_le is not None


# ── P1-3 : « Annuler la suppression » ne reprend que ce que la demande a elle-même arrêté, un seul abonnement ─────

def test_p1_3_annuler_ne_relance_ni_l_abonnement_deja_arrete_par_le_client_ni_deux(client, abonne, poser, db_session):
    deja_arrete = _abonnement(cancel_at_period_end=True)                 # arrêté par le client, AVANT la demande
    doublon = _abonnement(id_="sub_doublon")                             # S-13 : deux paiements simultanés
    f = FauxFournisseur([deja_arrete, doublon])
    poser(f)
    assert client.delete("/api/users/me").json()["deleted"] is False
    assert f.resilies == [("sub_doublon", True)]                         # la demande n'arrête que ce qui renouvelait
    r = client.post("/api/users/me/annuler-suppression")
    assert r.status_code == 200, r.text
    assert f.repris == ["sub_doublon"]                                   # jamais sub_invente, arrêté par le client
    assert r.json()["abonnement_repris"] is True


def test_p1_3_annuler_reprend_un_seul_abonnement_celui_de_l_organisation(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement(id_="sub_doublon"), _abonnement()])
    poser(f)
    client.delete("/api/users/me")
    assert sorted(f.resilies) == [("sub_doublon", True), ("sub_invente", True)]
    r = client.post("/api/users/me/annuler-suppression")
    assert f.repris == ["sub_invente"]                                   # un seul prélèvement repris
    corps = r.json()
    assert corps["suppression_prevue_le"] is None
    assert corps["abonnement_repris"] is True and corps["prochain_prelevement"].startswith("2030-03-14")


def test_p1_3_abonnement_arrete_par_le_client_seul_rien_n_est_repris(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement(cancel_at_period_end=True)])
    poser(f)
    assert client.delete("/api/users/me").json()["deleted"] is False
    assert f.resilies == []
    apercu = client.get("/api/users/me/suppression").json()
    assert apercu["abonnement_repris"] is False                          # l'écran ne promet pas de reprise
    r = client.post("/api/users/me/annuler-suppression")
    assert r.status_code == 200 and r.json()["abonnement_repris"] is False
    assert f.repris == []
    assert _org(db_session).suppression_prevue_le is None


def test_p1_3_l_apercu_dit_la_reprise_et_la_date_du_prochain_prelevement(client, abonne, poser, db_session):
    f = FauxFournisseur([_abonnement()])
    poser(f)
    assert client.get("/api/users/me/suppression").json()["abonnement_repris"] is False   # pas de demande
    client.delete("/api/users/me")
    apercu = client.get("/api/users/me/suppression").json()
    assert apercu["abonnement_repris"] is True
    assert apercu["prochain_prelevement"].startswith("2030-03-14")
    assert f.repris == []                                                # l'aperçu ne change rien


def test_p1_3_la_memoire_de_la_demande_est_celle_de_l_organisation(client, abonne, poser, db_session):
    from models.audit_log import AuditLog
    f = FauxFournisseur([_abonnement()])
    poser(f)
    client.delete("/api/users/me")
    lignes = db_session.query(AuditLog).filter(AuditLog.action == "compte.suppression_programmee").all()
    assert [(l.organization_id, l.extra["abonnements_arretes"]) for l in lignes] == [("org-test-1", ["sub_invente"])]
    # La ligne d'une autre organisation qui citerait le même abonnement n'est jamais lue.
    db_session.add(AuditLog(organization_id="org-autre", action="compte.suppression_programmee",
                            extra={"abonnements_arretes": ["sub_doublon"]}))
    db_session.commit()
    client.post("/api/users/me/annuler-suppression")
    assert f.repris == ["sub_invente"]


# ── P2-1 : le webhook ne gèle plus l'API (appels bloquants hors de la boucle d'événements) ───────────────────────

def test_p2_1_le_webhook_est_servi_dans_un_fil():
    import inspect

    import routers.stripe_billing as sb
    routes = [r for r in sb.router.routes if getattr(r, "path", "").endswith("/webhook")]
    assert len(routes) == 1
    assert not inspect.iscoroutinefunction(routes[0].endpoint)


@pytest.mark.asyncio
async def test_p2_1_un_webhook_lent_ne_bloque_pas_les_autres_requetes(client, abonne, poser):
    import asyncio
    import time

    import httpx

    from main import app

    class Lent(FauxFournisseur):
        def list_subscriptions(self, customer_id):
            time.sleep(1.5)                       # Stripe lent (délai par défaut de la bibliothèque : 80 s)
            return super().list_subscriptions(customer_id)

    poser(Lent([_abonnement(), _abonnement(id_="sub_ancien", status="canceled")]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        async def webhook():
            return await ac.post("/api/stripe/webhook", headers={"stripe-signature": "t=1,v1=ok"},
                                 json={"type": "customer.subscription.deleted",
                                       "data": {"object": {"id": "sub_ancien", "customer": "cus_invente"}}})

        async def sonde():
            await asyncio.sleep(0.3)
            debut = time.monotonic()
            r = await ac.get("/api/health")
            return r, time.monotonic() - debut

        r_webhook, (r_sonde, duree) = await asyncio.gather(webhook(), sonde())
    assert r_webhook.status_code == 200, r_webhook.text
    assert r_sonde.status_code == 200
    assert duree < 0.8, f"/api/health a attendu le webhook ({duree:.2f} s)"
