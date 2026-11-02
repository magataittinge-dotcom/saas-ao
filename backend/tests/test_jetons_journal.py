"""Coût réel d'une recette : une ligne « jetons » par appel au modèle, additionnée par scripts/couts_journal.py."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

from services.jetons import ligne_jetons

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "couts_journal.py"
_spec = importlib.util.spec_from_file_location("couts_journal", _SCRIPT)
couts_journal = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(couts_journal)


def test_ligne_jetons_objet_et_dict():
    u = SimpleNamespace(input_tokens=10, output_tokens=20, cache_read_input_tokens=30, cache_creation_input_tokens=40)
    assert ligne_jetons("passe 2 [lot 05]", "claude-sonnet-4-6", u) == (
        "jetons etape=passe_2_lot_05 modele=claude-sonnet-4-6 entree=10 cache_lecture=30 cache_ecriture=40 sortie=20"
    )
    assert ligne_jetons("x", "m", {"input_tokens": 1}).endswith("entree=1 cache_lecture=0 cache_ecriture=0 sortie=0")
    assert ligne_jetons("", "", None) == (
        "jetons etape=appel modele=inconnu entree=0 cache_lecture=0 cache_ecriture=0 sortie=0"
    )


def test_le_cout_du_memoire_du_26_10_est_retrouve():
    # Mesure du 26/10 (ETAT.md) : mémoire Sonnet 5.5 de Gueux = 0,974 $.
    assert couts_journal.cout_usd("claude-sonnet-5-5", 1187, 388383, 129461, 56983) == pytest.approx(0.974, abs=0.001)
    assert couts_journal.cout_usd("modele-sans-tarif", 1, 1, 1, 1) is None


def test_journal_additionne_par_modele(tmp_path, capsys):
    j = tmp_path / "api.log"
    j.write_text(
        "INFO bruit\n"
        + "[x] " + ligne_jetons("a", "claude-sonnet-4-6", {"input_tokens": 1_000_000}) + "\n"
        + ligne_jetons("b", "claude-sonnet-4-6", {"output_tokens": 1_000_000}) + "\n"
        + ligne_jetons("c", "claude-sonnet-5-5", {"cache_read_input_tokens": 1_000_000}) + "\n",
        encoding="utf-8",
    )
    assert couts_journal.main([str(j), "--taux", "1"]) == 0
    sortie = capsys.readouterr().out
    assert "claude-sonnet-4-6 : 2 appels" in sortie and "18.000 $" in sortie
    assert "TOTAL : 18.200 $ = 18.200 €" in sortie
    assert couts_journal.main([str(j), "--depuis-ligne", "4", "--taux", "1"]) == 0
    assert "TOTAL : 0.200 $" in capsys.readouterr().out


def test_les_trois_appels_du_parcours_ecrivent_la_ligne():
    import inspect

    from services.ai import dce_analyzer, lot_fallback, memoire_generator

    for module in (dce_analyzer, lot_fallback, memoire_generator):
        assert "ligne_jetons(" in inspect.getsource(module), module.__name__
