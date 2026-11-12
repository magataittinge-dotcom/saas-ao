"""D-08 et D-06 (audit données, solidité, coûts) — la veille à 100 000 avis.

D-08 : sur PostgreSQL, les comptes par département sont agrégés en SQL (`json_array_elements_text` + `group by`) : une
ligne par département remonte, au lieu de toutes les lignes ouvertes (69 103 sur 100 000) comptées en Python. Mêmes
comptes : la synchronisation écrit chaque liste de départements sans doublon (`boamp_sync.py`, ensemble trié), donc
`count(*)` par département = « un avis multi-départements compte une fois dans chacun ».
D-06 : la recherche texte garde `ilike '%mot%'` : la migration 0037 pose les index trigrammes qui la servent.

Le test Postgres tourne si `SYNORIX_TEST_PG_URL` désigne une base jetable (transaction annulée : rien n'y reste)."""
import os
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from models.avis_veille import AvisVeille
from services.veille import comptes as sc
from services.veille.comptes import Filtres

AUJOURDHUI = date(2026, 10, 31)


def _faux_pg(db_session):
    return SimpleNamespace(query=db_session.query,
                           get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))


def test_postgres_agrege_les_comptes_en_sql(db_session):
    requete = sc.requete_comptes_sql(_faux_pg(db_session), Filtres(q="toiture", metiers=("couverture",)), AUJOURDHUI)
    sql = str(requete.compile(dialect=postgresql.dialect()))
    assert "json_array_elements_text(avis_veille.departements)" in sql
    assert "GROUP BY" in sql and "count(*)" in sql
    assert "ILIKE" in sql.upper() and "?|" in sql                     # mêmes filtres que la liste


def _avis(idweb, departements, jours=10, objet="Travaux de couverture", acheteur="Commune d'Exemple"):
    return AvisVeille(id_boamp=idweb, objet=objet, acheteur=acheteur, departements=sorted(set(departements)),
                      date_parution=AUJOURDHUI, date_limite=AUJOURDHUI + timedelta(days=jours), procedure="ouvert",
                      metiers=["couverture"], url_avis=f"https://example.invalid/{idweb}",
                      synchronise_at=datetime(2026, 10, 31, 6, 0))


@pytest.fixture
def pg():
    url = os.environ.get("SYNORIX_TEST_PG_URL")
    if not url:
        pytest.skip("SYNORIX_TEST_PG_URL non posée (base Postgres jetable)")
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        transaction = connexion.begin()
        session = Session(bind=connexion, join_transaction_mode="create_savepoint")
        connexion.execute(text("DELETE FROM avis_veille"))                # dans la transaction annulée
        yield session
        session.close()
        transaction.rollback()
    moteur.dispose()


def test_postgres_memes_comptes_qu_en_python(pg):
    pg.add_all([_avis("p1", ("44", "49")), _avis("p2", ("44",)), _avis("p3", ("2A",), objet="Toiture du gymnase"),
                _avis("p4", ("49",), jours=-1), _avis("p5", ("44", "2A"), acheteur="Ville de Toiture")])
    pg.flush()
    for filtres in (Filtres(), Filtres(q="toiture"), Filtres(delai_jours=7), Filtres(metiers=("couverture",))):
        assert sc.calculer_comptes(pg, filtres, AUJOURDHUI) == sc._comptes_python(pg, filtres, AUJOURDHUI)
    assert sc.calculer_comptes(pg, Filtres(), AUJOURDHUI) == {"2A": 2, "44": 3, "49": 1}
