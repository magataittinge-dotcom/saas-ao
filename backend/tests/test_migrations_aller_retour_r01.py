"""R-01 (audit données, solidité, coûts) — `alembic downgrade base` échouait à la dernière marche : la descente de 0002
retire déjà les index `deleted_at` (references, documents, projects) et `ix_audit_logs_user_created`, puis 0001 les
retirait encore (`UndefinedObject` sur Postgres, `no such index` sur SQLite).

SQLite : aller-retour 0002 -> base -> 0002 sur une base neuve (0003 exige l'extension Postgres `vector`). L'aller-retour
complet sur Postgres (head -> base -> head) a été joué sur une copie de la base jetable (rapport SOLIDITE)."""
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _alembic(base: Path, *arguments: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{base}")
    return subprocess.run([sys.executable, "-m", "alembic", *arguments], cwd=BACKEND, env=env,
                          capture_output=True, text=True, timeout=300)


def test_descente_jusqu_a_la_base_puis_remontee(tmp_path):
    base = tmp_path / "aller_retour.db"
    for etape in (("upgrade", "0002"), ("downgrade", "base"), ("upgrade", "0002")):
        fait = _alembic(base, *etape)
        assert fait.returncode == 0, (etape, fait.stderr[-1500:])
