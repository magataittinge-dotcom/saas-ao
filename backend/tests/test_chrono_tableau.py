"""scripts/chrono_tableau.py : tableau par étape (nombre, médiane, p90, max) tiré d'un journal inventé."""
import importlib.util
import io
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "chrono_tableau.py"
_spec = importlib.util.spec_from_file_location("chrono_tableau", _SCRIPT)
tab = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tab)

JOURNAL = """\
INFO     synorix.chrono — chrono etape=analyse projet=p1 lot=lot1 duree_ms=100 statut=ok
INFO     synorix.chrono — chrono etape=analyse projet=p1 lot=lot1 duree_ms=300 statut=ok
INFO     synorix.chrono — chrono etape=analyse projet=p2 lot=lot2 duree_ms=200 statut=ok
chrono etape=analyse projet=p2 lot=lot2 duree_ms=999999 statut=erreur
chrono etape=depot projet=p1 lot=- duree_ms=1500 statut=ok
chrono etape=export projet=p1 lot=lot1 duree_ms=40 statut=erreur
bruit sans rapport : etape=analyse duree_ms=5
chrono etape=analyse projet=p1 lot=lot1 duree_ms=pas_un_nombre statut=ok
"""
for i in range(1, 11):    # 10 mesures : 10, 20, …, 100 ms
    JOURNAL += f"chrono etape=memoire projet=p1 lot=lot1 duree_ms={i * 10} statut=ok\n"


def _sortie(argv, texte=JOURNAL):
    out = io.StringIO()
    assert tab.main(argv, entree=io.StringIO(texte), sortie=out) == 0
    return out.getvalue()


def _rangees(sortie):
    lignes = sortie.strip().splitlines()
    return {l.split()[0]: l.split()[1:] for l in lignes[2:]}


def test_tableau_par_etape_dans_l_ordre_du_parcours():
    sortie = _sortie([])
    assert sortie.splitlines()[0].split() == ["etape", "nombre", "mediane_ms", "p90_ms", "max_ms", "erreurs"]
    r = _rangees(sortie)
    assert list(r) == ["depot", "analyse", "memoire", "export"]
    assert r["analyse"] == ["3", "200", "300", "300", "1"]      # l'erreur est comptée à part, hors durées
    assert r["depot"] == ["1", "1500", "1500", "1500", "0"]
    assert r["memoire"] == ["10", "55", "90", "100", "0"]       # médiane (50+60)/2 ; p90 = 9e valeur
    assert r["export"] == ["0", "-", "-", "-", "1"]


def test_filtre_par_projet():
    r = _rangees(_sortie(["--projet", "p2"]))
    assert r["analyse"][0] == "1" and "depot" not in r


def test_journal_sans_ligne_chrono():
    assert "Aucune ligne" in _sortie([], "rien d'utile\n")


def test_lecture_d_un_fichier(tmp_path, capsys):
    f = tmp_path / "journal.txt"
    f.write_text(JOURNAL, encoding="utf-8")
    assert tab.main([str(f)]) == 0
    assert "analyse" in capsys.readouterr().out


def test_p90_rang_le_plus_proche():
    assert tab.p90([5]) == 5
    assert tab.p90(list(range(1, 11))) == 9
    assert tab.p90(list(range(1, 101))) == 90
