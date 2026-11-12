"""R-03 (audit données, solidité, coûts) — l'essai de restauration restaure vraiment et compare les lignes.

`deploy/sauvegarde/synorix-essai-restauration.sh` restaure le dump dans une base jetable, compte les lignes de chaque
table restaurée, les compare à celles du dump (blocs COPY), puis supprime la base. Ici, `psql` et `pg_restore` sont
simulés (aucune base) : code 0 quand tout concorde, 1 et la table en écart quand une ligne manque, 2 si la base
d'essai désignée est celle de production. Joué pour de vrai en local sur une copie de la base jetable (26 tables,
8 702 lignes, rapport SOLIDITE)."""
import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "sauvegarde" / "synorix-essai-restauration.sh"

FAUX_PG_RESTORE = r"""#!/usr/bin/env bash
# Faux pg_restore : « --data-only -f - » rend les blocs COPY du dump ; sinon (restauration) ne fait rien.
if [ "$1" = "--data-only" ]; then
  printf 'SET x = 1;\nCOPY public.organizations (id, name) FROM stdin;\no1\tA\no2\tB\n\\.\n'
  printf 'COPY public."references" (id) FROM stdin;\nr1\n\\.\nCOPY public.vide (id) FROM stdin;\n\\.\n'
fi
"""

FAUX_PSQL = r"""#!/usr/bin/env bash
# Faux psql : le nombre de lignes de chaque table restaurée, lu dans $COMPTES (« table nombre »).
sql="${@: -1}"
case "$sql" in
  *"count(*)"*) t=$(echo "$sql" | sed -E 's/.*public\."([^"]+)".*/\1/'); grep "^$t " "$COMPTES" | cut -d' ' -f2 ;;
esac
"""


def _lancer(tmp_path: Path, comptes: str, base_essai: str = "synorix_essai_test") -> subprocess.CompletedProcess:
    (tmp_path / "pg_restore").write_text(FAUX_PG_RESTORE)
    (tmp_path / "psql").write_text(FAUX_PSQL)
    for nom in ("pg_restore", "psql"):
        (tmp_path / nom).chmod(0o755)
    (tmp_path / "comptes").write_text(comptes)
    env = dict(os.environ, SYNORIX_PSQL=str(tmp_path / "psql"), SYNORIX_PG_RESTORE=str(tmp_path / "pg_restore"),
               SYNORIX_BASE_ESSAI=base_essai, COMPTES=str(tmp_path / "comptes"))
    return subprocess.run(["bash", str(SCRIPT), str(tmp_path / "faux.dump")], env=env, capture_output=True,
                          text=True, timeout=60)


def test_toutes_les_lignes_restaurees_code_0(tmp_path):
    fait = _lancer(tmp_path, "organizations 2\nreferences 1\nvide 0\n")
    assert fait.returncode == 0, fait.stdout + fait.stderr
    assert "3 tables, 3 lignes, toutes restaurées" in fait.stdout


def test_une_ligne_manquante_code_1_et_la_table(tmp_path):
    fait = _lancer(tmp_path, "organizations 1\nreferences 1\nvide 0\n")
    assert fait.returncode == 1
    assert "organizations 2" in fait.stdout and "organizations 1" in fait.stdout
    assert "EN ÉCHEC" in fait.stdout


def test_jamais_la_base_de_production(tmp_path):
    fait = _lancer(tmp_path, "organizations 2\n", base_essai="synorix")
    assert fait.returncode == 2
