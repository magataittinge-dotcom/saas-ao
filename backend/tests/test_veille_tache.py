"""A4 — tâche Celery beat toutes les 6 h et commande manuelle de synchronisation."""
import importlib.util
import json
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent


def test_le_beat_planifie_la_veille_toutes_les_6_heures_sur_une_tache_enregistree():
    from tasks import celery_app
    entree = celery_app.conf.beat_schedule["veille-boamp-6h"]
    assert entree["schedule"] == 21600
    assert entree["task"] == "tasks.veille_boamp.synchroniser_veille"
    assert entree["task"] in celery_app.tasks


def test_la_tache_appelle_la_synchronisation_et_renvoie_les_comptes(monkeypatch):
    from services.veille import boamp_sync
    from tasks.veille_boamp import synchroniser_veille_tache

    appels = []

    def faux(db, **kw):
        appels.append(kw)
        return boamp_sync.Resultat(crees=2)

    monkeypatch.setattr(boamp_sync, "synchroniser", faux)
    resultat = synchroniser_veille_tache.apply()
    assert resultat.successful() and resultat.result["crees"] == 2 and appels == [{}]


def _script():
    spec = importlib.util.spec_from_file_location("synchroniser_veille", BACKEND / "scripts/synchroniser_veille.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_le_script_n_importe_jamais_main():
    source = (BACKEND / "scripts/synchroniser_veille.py").read_text(encoding="utf-8")
    assert not re.search(r"^\s*(from|import)\s+main\b", source, re.M)


def test_le_script_transmet_les_options_et_affiche_le_resultat(monkeypatch, capsys):
    from datetime import date
    from services.veille import boamp_sync
    module = _script()
    recu = {}

    def faux(db, **kw):
        recu.update(kw)
        return boamp_sync.Resultat(simulation=kw["simulation"], crees=5)

    monkeypatch.setattr(module, "synchroniser", faux)
    assert module.main(["--depuis", "2026-10-01", "--limite", "7", "--simulation"]) == 0
    assert recu == {"depuis": date(2026, 10, 1), "limite": 7, "simulation": True}
    assert json.loads(capsys.readouterr().out)["crees"] == 5


def test_le_script_refuse_une_date_mal_formee_et_signale_une_api_injoignable(monkeypatch, capsys):
    module = _script()
    with pytest.raises(SystemExit):
        module.main(["--depuis", "31/10/2026"])

    def casse(db, **kw):
        raise module.ErreurBoamp("API BOAMP injoignable")

    monkeypatch.setattr(module, "synchroniser", casse)
    assert module.main([]) == 1
    assert "injoignable" in capsys.readouterr().err
