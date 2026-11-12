"""Suppression du compte, côté fournisseurs (audit de sécurité S-03 ; décision D23 du 12/11).

1. Sans abonnement payant vivant (offre gratuite, essai, abonnement déjà terminé) : la suppression est IMMÉDIATE. Avant
   toute suppression, les abonnements encore ouverts mais non payants (paiement initial inachevé…) sont résiliés tout de
   suite chez le fournisseur (`get_billing_provider()`). Tous les abonnements du client, pas seulement celui que
   l'organisation connaît (deux paiements lancés en même temps peuvent en avoir créé deux, S-13).
2. Avec un abonnement payant vivant (`STATUTS_PAYANTS_VIVANTS`) : D23, « l'accès reste ouvert jusqu'à la fin de la
   période payée, puis résiliation, sans remboursement du mois entamé » (CGV 7.1, 7.2). La suppression est PROGRAMMÉE :
   chaque abonnement vivant est mis en arrêt à l'échéance (`at_period_end=True`), la date de fin de la période payée est
   posée sur `organizations.suppression_prevue_le` (migration 0035), rien n'est effacé et l'accès reste ouvert.
   - Au webhook `customer.subscription.deleted` (routers/stripe_billing.py) : si, et seulement si, l'organisation porte
     une demande et qu'aucun abonnement payant vivant ne reste chez le fournisseur, `executer_suppression`. Sans demande
     (impayé, résiliation depuis le portail), rien n'est supprimé : retour à l'offre gratuite.
   - Filet : `executer_suppressions_echues` (tâche quotidienne `tasks.suppression_comptes`) exécute une demande dont la
     date est passée si le webhook n'est jamais arrivé, après la même vérification chez le fournisseur.
   - Annulation tant que la date n'est pas passée : `reprendre_abonnements` (`cancel_at_period_end=False`).
   - Reprise depuis le portail du fournisseur (webhook `customer.subscription.updated` avec `cancel_at_period_end`
     faux) : la demande est retirée, sinon un arrêt d'abonnement des mois plus tard supprimerait le compte.
   Un échec du fournisseur lève `ResiliationImpossible` : la route répond 502 et rien ne change.
3. APRÈS la suppression des données : l'utilisateur est supprimé chez Clerk (API Backend). Un échec est journalisé
   (sans adresse ni identifiant Clerk) et la suppression reste acquise : à sa prochaine connexion, Clerk reconnaîtrait
   encore la personne et `/api/auth/sync` lui recréerait une organisation VIDE (aucune donnée ancienne), avec l'essai
   gratuit si son SIRET n'a jamais servi.

À vérifier à la main le jour J, en mode test de Stripe : (a) « Supprimer mon compte » avec un abonnement Pro de test →
l'abonnement porte « annulation le <date> » dans le tableau de bord, le compte reste ouvert ; (b) « Annuler la
suppression » → l'abonnement renouvelle de nouveau ; (c) avancer l'horloge de test (Test clocks) au-delà de l'échéance →
`customer.subscription.deleted` reçu, organisation, fichiers et utilisateur Clerk supprimés ; (d) même avance sans
demande → retour à l'offre gratuite, rien supprimé ; (e) portail Stripe réglé sur « annulation en fin de période ».
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

_STATUTS_FINIS = {"canceled", "incomplete_expired"}
# Abonnement payé et en cours (`past_due` : la période en cours reste due, l'accès aussi).
STATUTS_PAYANTS_VIVANTS = {"active", "trialing", "past_due"}
# Fin de période illisible chez le fournisseur : on programme au plus loin d'une période mensuelle (le webhook, lui,
# arrive à la vraie échéance ; le filet ne supprime jamais tant qu'un abonnement payant vit encore).
_REPLI_FIN_DE_PERIODE = timedelta(days=31)


class ResiliationImpossible(Exception):
    pass


def _fournisseur():
    from services.billing.factory import get_billing_provider
    return get_billing_provider()


def _abonnements_ouverts(fournisseur, org) -> list[dict]:
    """Abonnements non terminés du client chez le fournisseur (+ celui que l'organisation connaît)."""
    sub_id = getattr(org, "stripe_subscription_id", None)
    client_id = getattr(org, "stripe_customer_id", None)
    ouverts: dict[str, dict] = {}
    if client_id:
        for sub in fournisseur.list_subscriptions(client_id) or []:
            if sub.get("id") and sub.get("status") not in _STATUTS_FINIS:
                ouverts[sub["id"]] = sub
    elif sub_id:
        ouverts[sub_id] = {"id": sub_id, "status": "active"}        # sans client connu : on le tient pour vivant
    return [ouverts[k] for k in sorted(ouverts)]


def _fin_de_periode(sub: dict) -> datetime | None:
    """`current_period_end` (secondes) de l'abonnement, ou de ses lignes (API Stripe récente) ; UTC naïf."""
    valeurs = [sub.get("current_period_end")]
    lignes = (sub.get("items") or {}).get("data") if isinstance(sub.get("items"), dict) else None
    valeurs += [ligne.get("current_period_end") for ligne in (lignes or []) if isinstance(ligne, dict)]
    secondes = [v for v in valeurs if isinstance(v, (int, float)) and v > 0]
    if not secondes:
        return None
    return datetime.fromtimestamp(max(secondes), tz=timezone.utc).replace(tzinfo=None)


def _fin_des_payants(payants: list[dict]) -> datetime:
    fins = [f for f in (_fin_de_periode(s) for s in payants) if f is not None]
    return max(fins) if fins else datetime.utcnow() + _REPLI_FIN_DE_PERIODE


def apercu_fin_de_periode(org) -> datetime | None:
    """Ce que « Supprimer mon compte » ferait, sans rien changer : la date de fin de la période payée s'il existe un
    abonnement payant vivant, sinon None (suppression immédiate). Lève ResiliationImpossible."""
    if not getattr(org, "stripe_subscription_id", None) and not getattr(org, "stripe_customer_id", None):
        return None
    try:
        payants = [s for s in _abonnements_ouverts(_fournisseur(), org) if s.get("status") in STATUTS_PAYANTS_VIVANTS]
    except Exception as exc:
        logger.error("Suppression du compte : abonnement illisible (org=%s, %s)", org.id, type(exc).__name__)
        raise ResiliationImpossible() from exc
    return _fin_des_payants(payants) if payants else None


def programmer_ou_resilier(org) -> datetime | None:
    """Avec un abonnement payant vivant : met chaque abonnement ouvert en arrêt à l'échéance et rend la date de fin de
    la période payée (la plus tardive) ; sinon résilie tout de suite les abonnements ouverts et rend None (suppression
    immédiate). Ne touche pas à la base. Lève ResiliationImpossible."""
    if not getattr(org, "stripe_subscription_id", None) and not getattr(org, "stripe_customer_id", None):
        return None
    try:
        fournisseur = _fournisseur()
        ouverts = _abonnements_ouverts(fournisseur, org)
        payants = [s for s in ouverts if s.get("status") in STATUTS_PAYANTS_VIVANTS]
        if not payants:
            for sub in ouverts:
                fournisseur.cancel_subscription(sub["id"], at_period_end=False)
            return None
        for sub in ouverts:
            fournisseur.cancel_subscription(sub["id"], at_period_end=True)
        return _fin_des_payants(payants)
    except Exception as exc:
        logger.error("Suppression du compte : abonnement non résilié (org=%s, %s)", org.id, type(exc).__name__)
        raise ResiliationImpossible() from exc


def reprendre_abonnements(org) -> int:
    """Annulation de la demande : remet en renouvellement chaque abonnement ouvert. Lève ResiliationImpossible."""
    try:
        fournisseur = _fournisseur()
        ouverts = _abonnements_ouverts(fournisseur, org)
        for sub in ouverts:
            fournisseur.resume_subscription(sub["id"])
        return len(ouverts)
    except Exception as exc:
        logger.error("Suppression du compte : abonnement non repris (org=%s, %s)", org.id, type(exc).__name__)
        raise ResiliationImpossible() from exc


def abonnement_payant_vivant(org) -> bool:
    """Un abonnement payant vit-il encore chez le fournisseur ? Lève en cas de panne (l'appelant n'efface rien)."""
    if not getattr(org, "stripe_customer_id", None):
        return False
    return any(s.get("status") in STATUTS_PAYANTS_VIVANTS for s in _abonnements_ouverts(_fournisseur(), org))


def executer_suppression(db, org_id: str, racine=None) -> dict:
    """Supprime l'organisation (une transaction), puis ses fichiers, puis ses comptes Clerk. Lève si la base refuse
    (après rollback : rien n'est effacé). Rend le bilan de `suppression_compte.supprimer_organisation`."""
    from models.user import User
    from services import suppression_compte
    if racine is None:
        from services.file_storage import UPLOADS_ROOT as racine

    clerk_ids = [c for (c,) in db.query(User.clerk_id).filter(User.organization_id == org_id).all() if c]
    try:
        bilan = suppression_compte.supprimer_organisation(db, org_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    # Purge des fichiers disque (après le commit) : plus aucune donnée personnelle résiduelle sur le serveur.
    suppression_compte.purger_fichiers(racine, org_id, bilan["project_ids"], bilan["fichiers"])
    # Puis les comptes Clerk : un échec est journalisé, la suppression des données reste acquise.
    supprimer_utilisateurs_clerk(clerk_ids)
    logger.info("RGPD: compte supprimé — org=%s, projets=%d, tables=%d",
                org_id, len(bilan["project_ids"]), len(bilan["tables"]))
    return bilan


def supprimer_si_demande(db, org) -> bool:
    """Fin d'abonnement (webhook ou filet) : supprime l'organisation si elle porte une demande et qu'aucun abonnement
    payant ne vit encore chez le fournisseur. Panne du fournisseur : rien n'est effacé (le filet réessaiera)."""
    if org is None or org.suppression_prevue_le is None:
        return False
    try:
        if abonnement_payant_vivant(org):
            return False
    except Exception as exc:
        logger.warning("Suppression programmée reportée (org=%s) : fournisseur injoignable (%s)",
                       org.id, type(exc).__name__)
        return False
    executer_suppression(db, org.id)
    return True


def executer_suppressions_echues(db, maintenant: datetime | None = None) -> int:
    """Filet quotidien : exécute les demandes dont la date est passée ; rend le nombre de comptes supprimés."""
    from models.organization import Organization

    maintenant = maintenant or datetime.utcnow()
    echues = [oid for (oid,) in db.query(Organization.id).filter(
        Organization.suppression_prevue_le.isnot(None), Organization.suppression_prevue_le <= maintenant).all()]
    faites = 0
    for org_id in echues:
        org = db.get(Organization, org_id)
        try:
            faites += supprimer_si_demande(db, org)
        except Exception:
            logger.exception("Suppression programmée impossible (org=%s) ; nouvel essai demain", org_id)
    return faites


def supprimer_utilisateurs_clerk(clerk_ids: list[str]) -> int:
    """Supprime les utilisateurs chez Clerk ; rend le nombre de suppressions refusées (journalisées, jamais levées)."""
    from config import get_settings
    cle = get_settings().CLERK_SECRET_KEY
    echecs = 0
    for clerk_id in clerk_ids:
        if not clerk_id:
            continue
        try:
            r = httpx.delete(f"https://api.clerk.com/v1/users/{clerk_id}",
                             headers={"Authorization": f"Bearer {cle}"}, timeout=10.0)
            if r.status_code not in (200, 404):      # 404 : déjà supprimé chez Clerk
                raise RuntimeError(f"statut {r.status_code}")
        except Exception as exc:
            echecs += 1
            logger.error("Suppression du compte : utilisateur Clerk non supprimé (%s) ; il retrouvera une "
                         "organisation vide à sa prochaine connexion", type(exc).__name__)
    return echecs
