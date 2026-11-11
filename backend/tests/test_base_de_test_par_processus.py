"""Deux suites pytest lancées en même temps dans la même copie ne partagent plus la base SQLite de test : son nom
porte le numéro du processus (constat de la nuit : « no such table » quand l'une refaisait le schéma de l'autre)."""
import os


def test_la_base_de_test_est_propre_au_processus():
    from database import engine
    assert engine.url.database.endswith(f"synorix_test_suite_{os.getpid()}.db")
