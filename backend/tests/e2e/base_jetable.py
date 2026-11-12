"""Préparations du second test de bout en bout (frontend/e2e/parcours-2.mjs) dans la BASE JETABLE, jamais ailleurs.

    cd backend && python -m tests.e2e.base_jetable organisation-de-test <email> <dossier de travail>
    cd backend && python -m tests.e2e.base_jetable restaurer <email> <dossier de travail>

`organisation-de-test` : crée (ou reprend) l'organisation « E2E2 Organisation de test » (offre Essentiel, aucun
abonnement chez le fournisseur de paiement, quota d'analyses du mois ÉPUISÉ : 5 lignes de consommation sur 5), puis y
rattache le compte du test le temps d'un parcours ; l'organisation d'origine est notée dans <dossier>/origine-org.txt.
`restaurer` : rend le compte à son organisation d'origine (lue dans ce fichier), puis efface le fichier. Sans fichier :
rien à faire. Rejouable : un passage interrompu est réparé au départ du suivant.

Garde-fou : refus si la base ne s'appelle pas synorix_fin_* (même règle que tests/e2e/api_simulee.py).
"""
from __future__ import annotations

import json
import re
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from tests.e2e.api_simulee import _lire_env

NOM_ORG = "E2E2 Organisation de test"
QUOTA_ESSENTIEL = 5


def _url() -> str:
    import os
    url = os.environ.get("DATABASE_URL") or _lire_env("DATABASE_URL")
    m = re.search(r"/([^/?]+)(\?.*)?$", url or "")
    if not m or not m.group(1).startswith("synorix_fin_"):
        sys.exit("refus : la base n'est pas une base jetable synorix_fin_*")
    return url


def _connexion():
    from sqlalchemy import create_engine
    return create_engine(_url()).begin()


def organisation_de_test(email: str, travail: Path) -> dict:
    from sqlalchemy import text
    fichier = travail / "origine-org.txt"
    with _connexion() as c:
        u = c.execute(text("select id, organization_id from users where email = :e"), {"e": email}).first()
        if u is None:
            sys.exit(f"compte introuvable dans la base jetable : {email}")
        org = c.execute(text("select id from organizations where name = :n"), {"n": NOM_ORG}).scalar()
        if org is None:
            org = str(uuid.uuid4())
            c.execute(text(
                "insert into organizations (id, name, plan, siret_verified, trial_granted, subscription_started_at, created_at) "
                "values (:id, :n, 'essentiel', false, true, :debut, :debut)"), {"id": org, "n": NOM_ORG, "debut": datetime.utcnow() - timedelta(days=1)})
        else:
            c.execute(text("update organizations set plan = 'essentiel', stripe_customer_id = null, stripe_subscription_id = null, "
                           "suppression_prevue_le = null, subscription_started_at = :debut where id = :id"),
                      {"id": org, "debut": datetime.utcnow() - timedelta(days=1)})
        # Le quota du mois épuisé : 5 analyses décomptées sur 5 (aucun mémoire).
        c.execute(text("delete from quota_consumptions where organization_id = :o"), {"o": org})
        for _ in range(QUOTA_ESSENTIEL):
            c.execute(text("insert into quota_consumptions (id, organization_id, kind, created_at) values (:id, :o, 'analysis', :t)"),
                      {"id": str(uuid.uuid4()), "o": org, "t": datetime.utcnow()})
        if u.organization_id != org:
            if not fichier.exists():
                fichier.write_text(u.organization_id or "", encoding="utf-8")
            c.execute(text("update users set organization_id = :o, role = 'admin' where id = :u"), {"o": org, "u": u.id})
    return {"organisation": org, "origine": fichier.read_text(encoding="utf-8").strip()}


def restaurer(email: str, travail: Path) -> dict:
    from sqlalchemy import text
    fichier = travail / "origine-org.txt"
    if not fichier.exists():
        return {"restaure": False}
    origine = fichier.read_text(encoding="utf-8").strip()
    with _connexion() as c:
        c.execute(text("update users set organization_id = :o where email = :e"), {"o": origine, "e": email})
    fichier.unlink()
    return {"restaure": True, "origine": origine}


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("organisation-de-test", "restaurer"):
        print(__doc__)
        sys.exit(2)
    action, email, travail = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    travail.mkdir(parents=True, exist_ok=True)
    print(json.dumps((organisation_de_test if action == "organisation-de-test" else restaurer)(email, travail)))
