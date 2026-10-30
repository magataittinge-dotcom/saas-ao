"""A3 (sujet A) — migration 0025 : colonne JSON `ancre` sur compliance_items."""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from alembic.config import Config

BACKEND = Path(__file__).resolve().parent.parent


def _migration():
    import importlib.util
    spec = importlib.util.spec_from_file_location("m0025", BACKEND / "alembic/versions/0025_ancre_exigence.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _colonnes(engine):
    return {c["name"] for c in sa.inspect(engine).get_columns("compliance_items")}


def _executer(engine, fonction):
    with engine.begin() as connexion:
        with Operations.context(MigrationContext.configure(connexion)):
            fonction()


def test_0025_suit_0024_et_c_est_la_head():
    script = ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini")))
    assert script.get_revision("0025").down_revision == "0024"
    assert "0025" in {r.revision for r in script.walk_revisions()}   # les suivantes la prolongent
    assert len(script.get_heads()) == 1


def test_modele_declare_la_colonne_json_nullable():
    from models.compliance_item import ComplianceItem
    colonne = ComplianceItem.__table__.c.ancre
    assert isinstance(colonne.type, sa.JSON) and colonne.nullable


def test_upgrade_ajoute_la_colonne_idempotent_et_downgrade_la_retire():
    m = _migration()
    moteur = sa.create_engine("sqlite://")
    with moteur.begin() as c:
        c.execute(sa.text("CREATE TABLE compliance_items (id VARCHAR PRIMARY KEY, source_excerpt TEXT)"))
        c.execute(sa.text("INSERT INTO compliance_items (id, source_excerpt) VALUES ('a', 'extrait')"))
    assert "ancre" not in _colonnes(moteur)

    _executer(moteur, m.upgrade)
    assert "ancre" in _colonnes(moteur)
    _executer(moteur, m.upgrade)                      # idempotent : second passage sans effet
    with moteur.begin() as c:
        assert c.execute(sa.text("SELECT ancre FROM compliance_items")).scalar() is None   # nullable
        c.execute(sa.text("UPDATE compliance_items SET ancre = :j"),
                  {"j": json.dumps({"version": 1, "niveau": "page"})})

    _executer(moteur, m.downgrade)
    assert "ancre" not in _colonnes(moteur)
    _executer(moteur, m.downgrade)                    # idempotent aussi
    with moteur.begin() as c:                         # les autres colonnes et données restent
        assert c.execute(sa.text("SELECT source_excerpt FROM compliance_items")).scalar() == "extrait"


def test_une_exigence_garde_son_ancre_json(db_session):
    from models.compliance_item import ComplianceItem
    from models.organization import Organization
    from models.project import Project
    db_session.add(Organization(id="o-anc", name="Org"))
    db_session.add(Project(id="p-anc", organization_id="o-anc", name="AO"))
    ancre = {"version": 1, "doc_id": "d", "page": 3, "rotation": 0, "rects": [[0.1, 0.2, 0.3, 0.25]],
             "niveau": "passage", "citation": {"avant": "", "passage": "x", "apres": ""}}
    db_session.add(ComplianceItem(id="c-anc", project_id="p-anc", exigence_text="t", ancre=ancre))
    db_session.commit()
    db_session.expire_all()
    assert db_session.get(ComplianceItem, "c-anc").ancre == ancre
