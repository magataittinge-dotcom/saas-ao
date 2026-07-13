"""T4 — R14 : migrations unifiées sur alembic (source unique du schéma).

Avant : le schéma naissait de `Base.metadata.create_all()` + du DDL runtime
`_ensure_schema_columns()` dans main.py ; alembic (baseline 0001 vide) était
incapable de bâtir une base vierge. Après : la baseline 0001 crée le schéma
COMPLET, main.py ne fait plus que vérifier la head au boot (fail fast).

Preuves « base vierge → upgrade head vert » + « autogenerate vide » + « dev
intacte » sont faites en réel sur Postgres (hors CI). Ici on verrouille les
invariants qui les garantissent, de façon portable.
"""
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent


def _alembic_script():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    return ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini")))


def test_import_models_registers_memoire_configs():
    """R14 — `import models` (ce qu'utilise alembic env.py) doit enregistrer
    TOUS les modèles avec Base.metadata, memoire_configs compris. Avant le fix,
    MemoireConfig n'était importé que par les routers → alembic croyait devoir
    SUPPRIMER la table. Testé en sous-processus pour isoler de l'app (main)."""
    code = (
        "import models; from database import Base; "
        "import sys; sys.exit(0 if 'memoire_configs' in Base.metadata.tables else 1)"
    )
    r = subprocess.run([sys.executable, "-c", code], cwd=str(BACKEND))
    assert r.returncode == 0, "`import models` seul n'enregistre pas memoire_configs"


def test_baseline_is_root_and_single_head():
    """La baseline 0001 est la racine (down_revision=None) et la chaîne reste
    linéaire (une seule head)."""
    script = _alembic_script()
    assert script.get_revision("0001").down_revision is None
    assert len(script.get_heads()) == 1, "plusieurs heads alembic — chaîne cassée"


def test_baseline_covers_every_orm_table():
    """La baseline crée CHAQUE table ORM (hors rag_chunks, DDL brut pgvector de
    0003). C'est ce test qui aurait attrapé l'oubli de memoire_configs."""
    import models  # noqa: F401 — enregistre les modèles
    from database import Base

    src = (BACKEND / "alembic/versions/0001_baseline.py").read_text(encoding="utf-8")
    raw_tables = {"rag_chunks"}
    for table in Base.metadata.tables:
        if table in raw_tables:
            continue
        assert f"create_table('{table}'" in src, (
            f"table ORM '{table}' absente de la baseline 0001 — schéma incomplet"
        )


def test_assert_migrations_current_fail_fast():
    """main._assert_migrations_current lève si la base n'est pas à la head, et
    passe silencieusement quand elle l'est (protection boot prod)."""
    import main
    from database import engine
    from sqlalchemy import text

    head = _alembic_script().get_current_head()

    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS alembic_version"))
        c.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        c.execute(text("INSERT INTO alembic_version (version_num) VALUES ('0001')"))

    with pytest.raises(RuntimeError, match="non à jour"):
        main._assert_migrations_current()

    with engine.begin() as c:
        c.execute(text("UPDATE alembic_version SET version_num = :h"), {"h": head})
    main._assert_migrations_current()  # à head → ne lève pas

    with engine.begin() as c:
        c.execute(text("DROP TABLE alembic_version"))
