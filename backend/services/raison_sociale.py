"""Raison sociale d'une entreprise : UNE règle de lecture, un seul endroit.

Décision du 2/11 (défauts C8 et R20 de la recette) : « champ vide tant que le SIRET n'est pas validé ;
jamais le nom du compte ». À la création d'un compte, l'organisation ne reçoit plus le nom de l'utilisateur
comme raison sociale (chaîne vide, `organizations.name` reste non nul : aucune migration). Les comptes déjà
créés portent encore ce nom tiré du compte : la règle ci-dessous le masque à la lecture, sans rien écrire en
base.

La raison sociale est renvoyée telle quelle quand :
  • le SIRET est validé (Sirene a confirmé l'entreprise : le nom est celui du répertoire ou celui que
    l'utilisateur a choisi à l'inscription) ;
  • ou le nom n'est PAS celui d'un compte (saisie délibérée dans « Mon entreprise »).
Elle est vide quand le nom est vide, ou quand il est celui du compte (nom de l'utilisateur ou partie locale
de son e-mail) et que le SIRET n'est pas validé.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Optional

from sqlalchemy.orm import Session, object_session
from sqlalchemy.orm.exc import UnmappedInstanceError


def _forme(texte: Optional[str]) -> str:
    """Forme de comparaison : sans accents ni casse, lettres et chiffres seulement
    (« Maga Taittinge » et « maga.taittinge » se valent)."""
    sans_accents = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", sans_accents.lower())


def noms_du_compte(utilisateurs: Iterable) -> list[str]:
    """Les noms que la création d'un compte a pu recopier dans la raison sociale : le nom de chaque
    utilisateur de l'organisation et la partie locale de son e-mail."""
    noms: list[str] = []
    for u in utilisateurs:
        nom = (getattr(u, "name", None) or "").strip()
        if nom:
            noms.append(nom)
        email = (getattr(u, "email", None) or "").strip()
        if "@" in email:
            noms.append(email.split("@", 1)[0])
    return noms


def raison_sociale_effective(nom: Optional[str], siret_verifie: bool, noms_compte: Iterable[str]) -> str:
    """Règle pure (testée sans base) : la raison sociale à lire, ou « » si elle n'est pas connue."""
    nom = (nom or "").strip()
    if not nom:
        return ""
    if siret_verifie:
        return nom
    forme = _forme(nom)
    if forme and any(forme == _forme(n) for n in noms_compte):
        return ""
    return nom


def raison_sociale_de(org, db: Optional[Session] = None) -> str:
    """La raison sociale de `org` selon la règle. `db` : la session ; à défaut, celle de l'objet. Un objet
    détaché (job détaché dont la session est fermée) doit recevoir `db` ou avoir été lu avant la fermeture."""
    if org is None:
        return ""
    try:
        session = db or object_session(org)
    except UnmappedInstanceError:   # objet qui n'est pas une ligne de la base (SimpleNamespace d'un test, d'un aperçu)
        session = None
    comptes: list[str] = []
    if session is not None and not getattr(org, "siret_verified", False):
        from models.user import User
        comptes = noms_du_compte(session.query(User).filter(User.organization_id == org.id).all())
    return raison_sociale_effective(getattr(org, "name", None), bool(getattr(org, "siret_verified", False)), comptes)


def organisation_publique(org, db: Optional[Session] = None) -> dict:
    """L'organisation telle que l'API la renvoie : toutes ses colonnes, avec `name` passé par la règle."""
    donnees = {c.name: getattr(org, c.name) for c in org.__table__.columns}
    donnees["name"] = raison_sociale_de(org, db)
    return donnees


def nom_entreprise_effectif(org, db: Optional[Session]) -> str:
    """Le nom que les documents (page de garde, décompte « à compléter », nom du ZIP) impriment : le nom saisi dans le
    profil du mémoire (`MemoireConfig.nom_entreprise`, qui prime sur l'organisation comme à la génération et sur les
    fiches), sinon la raison sociale selon la règle. Vide si aucun des deux n'est connu."""
    if org is None:
        return ""
    if db is None:   # aperçu ou test sans session : la règle seule
        return raison_sociale_de(org)
    from models.memoire_config import MemoireConfig
    cfg = db.query(MemoireConfig).filter(MemoireConfig.organization_id == org.id).first()
    return ((cfg.nom_entreprise or "").strip() if cfg else "") or raison_sociale_de(org, db)
