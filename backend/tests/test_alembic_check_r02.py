"""R-02 (audit données, solidité, coûts) — `alembic check` passe sur une base neuve née des migrations, et peut servir de
garde : les modèles déclarent les valeurs par défaut que les migrations posent en base (14 colonnes), et les index
Postgres posés en DDL par les migrations seulement (GIN sur expression, trigrammes) sont exclus de la comparaison
(`alembic/env.py`, `_RAW_INDEXES`).

1. Toujours : chaque valeur par défaut posée par une migration est déclarée dans le modèle, à l'identique.
2. Postgres (si `SYNORIX_TEST_PG_VIDE_URL` désigne une base VIDE et jetable) : `upgrade head`, `alembic check` code 0,
   puis `downgrade base` (R-01) : la base redevient vide."""
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]

# (modèle, colonne, valeur posée par la migration) — 0028 (veille), 0032 (dépôts, couts_ia), 0034 (plan du mémoire).
DEFAUTS = [
    ("models.avis_veille:AvisVeille", "acheteur", ""),
    ("models.avis_veille:AvisVeille", "nature", "APPEL_OFFRE"),
    ("models.avis_veille:AvisVeille", "procedure", "autre"),
    ("models.preferences_veille:PreferencesVeille", "tri", "date_limite"),
    ("models.depot_entreprise:CoutIA", "jetons_entree", "0"),
    ("models.depot_entreprise:CoutIA", "jetons_sortie", "0"),
    ("models.depot_entreprise:CoutIA", "jetons_cache_lecture", "0"),
    ("models.depot_entreprise:CoutIA", "jetons_cache_ecriture", "0"),
    ("models.depot_entreprise:CoutIA", "cout_usd", "0"),
    ("models.depot_entreprise:CoutIA", "cout_eur", "0"),
    ("models.depot_entreprise:LectureDepot", "nb_propositions", "0"),
    ("models.depot_entreprise:LectureDepot", "plafond_atteint", "false"),
    ("models.plan_memoire:PlanMemoire", "lot", ""),
    ("models.plan_memoire:PlanMemoire", "version", "1"),
]


def _classe(chemin: str):
    import importlib
    module, nom = chemin.split(":")
    return getattr(importlib.import_module(module), nom)


@pytest.mark.parametrize("chemin,colonne,valeur", DEFAUTS)
def test_les_defauts_des_migrations_sont_dans_les_modeles(chemin, colonne, valeur):
    defaut = _classe(chemin).__table__.c[colonne].server_default
    assert defaut is not None, f"{chemin}.{colonne} : server_default absent du modèle"
    texte = getattr(defaut.arg, "text", defaut.arg)
    assert str(texte).lower() == valeur.lower()


def _alembic(url: str, *arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", "alembic", *arguments], cwd=BACKEND,
                          env=dict(os.environ, DATABASE_URL=url), capture_output=True, text=True, timeout=600)


def test_alembic_check_sur_une_base_neuve():
    url = os.environ.get("SYNORIX_TEST_PG_VIDE_URL")
    if not url:
        pytest.skip("SYNORIX_TEST_PG_VIDE_URL non posée (base Postgres vide et jetable)")
    try:
        monte = _alembic(url, "upgrade", "head")
        assert monte.returncode == 0, monte.stderr[-1500:]
        controle = _alembic(url, "check")
        assert controle.returncode == 0, controle.stdout[-1500:] + controle.stderr[-1500:]
    finally:
        descente = _alembic(url, "downgrade", "base")
    assert descente.returncode == 0, descente.stderr[-1500:]
