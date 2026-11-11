"""Suppression du compte, côté fournisseurs (audit de sécurité, S-03).

1. AVANT toute suppression : l'abonnement est résilié chez le fournisseur de paiement (`get_billing_provider()`),
   immédiatement (`at_period_end=False`), sans remboursement automatique (décision de facturation : rapport
   CORRECTIFS-SECURITE). Tous les abonnements encore vivants du client sont résiliés, pas seulement celui que
   l'organisation connaît (deux paiements lancés en même temps peuvent en avoir créé deux, S-13). Un échec lève
   `ResiliationImpossible` : la route répond 502 et rien n'est supprimé.
2. APRÈS la suppression des données : l'utilisateur est supprimé chez Clerk (API Backend). Un échec est journalisé
   (sans adresse ni identifiant Clerk) et la suppression reste acquise : à sa prochaine connexion, Clerk reconnaîtrait
   encore la personne et `/api/auth/sync` lui recréerait une organisation VIDE (aucune donnée ancienne), avec l'essai
   gratuit si son SIRET n'a jamais servi.
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_STATUTS_FINIS = {"canceled", "incomplete_expired"}


class ResiliationImpossible(Exception):
    pass


def resilier_abonnements(org) -> int:
    """Résilie tous les abonnements vivants de l'organisation ; rend leur nombre. Lève ResiliationImpossible."""
    sub_id = getattr(org, "stripe_subscription_id", None)
    client_id = getattr(org, "stripe_customer_id", None)
    if not sub_id and not client_id:
        return 0
    from services.billing.factory import get_billing_provider
    try:
        fournisseur = get_billing_provider()
        a_resilier = {sub_id} if sub_id else set()
        if client_id:
            for sub in fournisseur.list_subscriptions(client_id) or []:
                if sub.get("id") and sub.get("status") not in _STATUTS_FINIS:
                    a_resilier.add(sub["id"])
        for ident in sorted(a_resilier):
            fournisseur.cancel_subscription(ident, at_period_end=False)
        return len(a_resilier)
    except Exception as exc:
        logger.error("Suppression du compte : résiliation impossible (org=%s, %s)", org.id, type(exc).__name__)
        raise ResiliationImpossible() from exc


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
