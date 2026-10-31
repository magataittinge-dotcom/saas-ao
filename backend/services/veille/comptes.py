"""Comptes par département et filtres de la veille (cache 15 min, invalidé à la synchronisation).

Les filtres du contrat (`metiers`, `delai_jours`, `procedures`, `q`) s'appliquent de la même façon aux
comptes et à la liste : `requete_avis` est l'unique point où ils sont écrits. Toujours : seulement les
avis ouverts (`date_limite >= aujourd'hui`).
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import String, cast, false, func, or_
from sqlalchemy.orm import Query, Session

from models.avis_veille import AvisVeille
from services.cache import org_cache

PREFIXE_CACHE = "veille:"
TTL_CACHE_S = 900                      # 15 minutes
SOURCE = "BOAMP – DILA, licence ouverte"
DELAIS = (7, 15, 30)
MAX_MOTS = 8


@dataclass(frozen=True)
class Filtres:
    metiers: tuple[str, ...] = ()
    delai_jours: int | None = None
    procedures: tuple[str, ...] = ()
    q: str = ""

    def empreinte(self) -> str:
        brut = json.dumps([sorted(self.metiers), self.delai_jours, sorted(self.procedures), self.q.strip().lower()],
                          ensure_ascii=False)
        return hashlib.sha1(brut.encode("utf-8")).hexdigest()[:20]


def invalider_cache() -> int:
    """Vide les comptes en cache (appelé à chaque synchronisation)."""
    return org_cache.invalidate(PREFIXE_CACHE)


def _echapper_like(mot: str) -> str:
    return mot.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def contient_un_de(db: Session, colonne, valeurs: tuple[str, ...]):
    """Colonne JSON (liste de chaînes) contenant AU MOINS UNE des valeurs.

    PostgreSQL : opérateur jsonb `?|` (utilise l'index GIN de la migration 0028). Autres bases
    (SQLite des tests) : recherche de la valeur entre guillemets dans le texte JSON."""
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB, array
        return cast(colonne, JSONB).has_any(array(list(valeurs)))
    return or_(*[cast(colonne, String).like(f'%"{_echapper_like(v)}"%', escape="\\") for v in valeurs])


def requete_avis(db: Session, filtres: Filtres, departements: tuple[str, ...] | None = None,
                 aujourdhui: date | None = None) -> Query:
    aujourdhui = aujourdhui or date.today()
    requete = db.query(AvisVeille).filter(AvisVeille.date_limite >= aujourdhui)
    if filtres.delai_jours:
        requete = requete.filter(AvisVeille.date_limite <= aujourdhui + timedelta(days=filtres.delai_jours))
    if filtres.metiers:
        requete = requete.filter(contient_un_de(db, AvisVeille.metiers, filtres.metiers))
    if filtres.procedures:
        requete = requete.filter(AvisVeille.procedure.in_(filtres.procedures))
    if departements is not None:
        if not departements:
            return requete.filter(false())
        requete = requete.filter(contient_un_de(db, AvisVeille.departements, departements))
    for mot in filtres.q.split()[:MAX_MOTS]:
        motif = f"%{_echapper_like(mot)}%"
        requete = requete.filter(or_(AvisVeille.objet.ilike(motif, escape="\\"),
                                     AvisVeille.acheteur.ilike(motif, escape="\\")))
    return requete


def derniere_synchronisation(db: Session) -> datetime | None:
    return db.query(func.max(AvisVeille.synchronise_at)).scalar()


def iso_utc(valeur: datetime | None) -> str | None:
    return valeur.replace(microsecond=0).isoformat() + "Z" if valeur else None


def calculer_comptes(db: Session, filtres: Filtres, aujourdhui: date | None = None) -> dict[str, int]:
    """Un avis multi-départements compte dans chacun de ses départements."""
    compte: Counter = Counter()
    for (departements,) in requete_avis(db, filtres, None, aujourdhui).with_entities(AvisVeille.departements):
        compte.update(set(departements or []))
    return {code: n for code, n in sorted(compte.items()) if n > 0}


def comptes(db: Session, filtres: Filtres, aujourdhui: date | None = None) -> dict:
    """Réponse de `GET /comptes`, mise en cache 15 min par jeu de filtres.

    La clé contient l'horodatage de la dernière synchronisation : un passage fait dans un autre
    processus (worker Celery) rend donc le cache périmé sans invalidation explicite."""
    aujourdhui = aujourdhui or date.today()
    actualise = derniere_synchronisation(db)
    cle = f"{PREFIXE_CACHE}comptes:{filtres.empreinte()}:{iso_utc(actualise)}:{aujourdhui.isoformat()}"
    en_cache = org_cache.get(cle)
    if en_cache is not None:
        return en_cache
    par_departement = calculer_comptes(db, filtres, aujourdhui)
    reponse = {
        "comptes": par_departement,
        "total": requete_avis(db, filtres, None, aujourdhui).count(),
        "actualise_le": iso_utc(actualise),
        "source": SOURCE,
    }
    org_cache.set(cle, reponse, ttl=TTL_CACHE_S)
    return reponse
