"""A5 — comptes par département, filtres du contrat, cache 15 min."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql

from models.avis_veille import AvisVeille
from services.cache import org_cache
from services.veille import comptes as sc
from services.veille.comptes import Filtres

AUJOURDHUI = date(2026, 10, 31)


def avis(idweb, departements=("44",), jours=10, metiers=("couverture",), procedure="ouvert", objet="Travaux",
         acheteur="Commune d'Exemple", parution=date(2026, 10, 30), synchro=datetime(2026, 10, 31, 6, 0)):
    return AvisVeille(id_boamp=idweb, objet=objet, acheteur=acheteur, departements=list(departements),
                      date_parution=parution, date_limite=AUJOURDHUI + timedelta(days=jours), procedure=procedure,
                      metiers=list(metiers), url_avis=f"https://www.boamp.fr/pages/avis/?q=idweb:{idweb}",
                      synchronise_at=synchro)


@pytest.fixture(autouse=True)
def _propre(db_session):
    org_cache.invalidate("veille:")
    yield
    org_cache.invalidate("veille:")


def test_un_avis_multi_departements_compte_dans_chacun(db_session):
    db_session.add_all([avis("a1", ("44", "49")), avis("a2", ("44",)), avis("a3", ("2A",))])
    db_session.commit()
    reponse = sc.comptes(db_session, Filtres(), AUJOURDHUI)
    assert reponse["comptes"] == {"2A": 1, "44": 2, "49": 1}
    assert reponse["total"] == 3                         # 3 avis, même si 4 comptes de département
    assert reponse["source"] == "BOAMP – DILA, licence ouverte"
    assert reponse["actualise_le"] == "2026-10-31T06:00:00Z"


def test_seuls_les_departements_a_compte_positif_sont_listes_et_aucune_donnee_donne_null(db_session):
    reponse = sc.comptes(db_session, Filtres(), AUJOURDHUI)
    assert reponse == {"comptes": {}, "total": 0, "actualise_le": None, "source": "BOAMP – DILA, licence ouverte"}


def test_les_avis_clos_ne_comptent_pas(db_session):
    db_session.add_all([avis("o1", jours=0), avis("c1", jours=-1)])
    db_session.commit()
    assert sc.comptes(db_session, Filtres(), AUJOURDHUI)["total"] == 1


def test_filtres_metiers_delai_procedures_et_mots_cles(db_session):
    db_session.add_all([
        avis("f1", ("75",), jours=5, metiers=("plomberie",), procedure="adaptee", objet="Réfection plomberie école", acheteur="Ville de Paris"),
        avis("f2", ("75",), jours=20, metiers=("couverture", "etancheite"), procedure="ouvert", objet="Toiture gymnase"),
        avis("f3", ("69",), jours=40, metiers=("vrd",), procedure="restreint", objet="Voirie quartier"),
    ])
    db_session.commit()
    total = lambda **kw: sc.comptes(db_session, Filtres(**kw), AUJOURDHUI)["total"]
    assert total() == 3
    assert total(metiers=("plomberie",)) == 1
    assert total(metiers=("etancheite", "vrd")) == 2          # au moins un des métiers
    assert total(delai_jours=7) == 1 and total(delai_jours=15) == 1 and total(delai_jours=30) == 2
    assert total(procedures=("adaptee", "restreint")) == 2
    assert total(q="PLOMBERIE") == 1                            # insensible à la casse
    assert total(q="paris") == 1                                # cherche aussi chez l'acheteur
    assert total(q="toiture gymnase") == 1                      # tous les mots
    assert total(q="toiture voirie") == 0
    assert total(metiers=("plomberie",), q="école", delai_jours=7, procedures=("adaptee",)) == 1


def test_recherche_texte_est_parametree_sans_injection_ni_jokers(db_session):
    db_session.add_all([avis("q1", objet="Remise à 100% des locaux"), avis("q2", objet="Travaux divers")])
    db_session.commit()
    total = lambda q: sc.comptes(db_session, Filtres(q=q), AUJOURDHUI)["total"]
    assert total("100%") == 1
    assert total("%") == 1                                       # le % est cherché tel quel
    assert total("_") == 0                                       # ni joker « un caractère »
    assert total("'; DROP TABLE avis_veille; --") == 0
    assert db_session.query(AvisVeille).count() == 2


def test_cache_15_minutes_par_jeu_de_filtres(db_session):
    db_session.add(avis("k1"))
    db_session.commit()
    premiere = sc.comptes(db_session, Filtres(), AUJOURDHUI)
    db_session.add(avis("k2", synchro=datetime(2026, 10, 31, 6, 0)))      # même horodatage de synchro
    db_session.commit()
    assert sc.comptes(db_session, Filtres(), AUJOURDHUI) == premiere       # servi par le cache
    assert sc.comptes(db_session, Filtres(metiers=("couverture",)), AUJOURDHUI)["total"] == 2   # autre clé
    assert org_cache.stats()["alive"] >= 2


def test_le_cache_est_invalide_par_la_synchronisation(db_session):
    db_session.add(avis("s1"))
    db_session.commit()
    assert sc.comptes(db_session, Filtres(), AUJOURDHUI)["total"] == 1
    db_session.add(avis("s2", synchro=datetime(2026, 10, 31, 6, 0)))
    db_session.commit()
    assert sc.invalider_cache() >= 1
    assert sc.comptes(db_session, Filtres(), AUJOURDHUI)["total"] == 2


def test_un_passage_fait_dans_un_autre_processus_rend_le_cache_perime(db_session):
    db_session.add(avis("p1"))
    db_session.commit()
    assert sc.comptes(db_session, Filtres(), AUJOURDHUI)["total"] == 1
    db_session.add(avis("p2", synchro=datetime(2026, 10, 31, 12, 0)))      # synchro plus récente, cache non invalidé
    db_session.commit()
    assert sc.comptes(db_session, Filtres(), AUJOURDHUI)["total"] == 2


def test_empreinte_stable_quel_que_soit_l_ordre():
    assert Filtres(metiers=("vrd", "cvc")).empreinte() == Filtres(metiers=("cvc", "vrd")).empreinte()
    assert Filtres(q="Toiture").empreinte() == Filtres(q="toiture ").empreinte()
    assert Filtres(delai_jours=7).empreinte() != Filtres(delai_jours=15).empreinte()


def test_postgres_utilise_l_operateur_jsonb_et_son_index_gin():
    faux_db = SimpleNamespace(get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))
    sql = str(sc.contient_un_de(faux_db, AvisVeille.departements, ("44", "49")).compile(dialect=postgresql.dialect()))
    assert "?|" in sql or "has_any" in sql.lower() or "jsonb" in sql.lower()
    assert "CAST(avis_veille.departements AS JSONB)" in sql
