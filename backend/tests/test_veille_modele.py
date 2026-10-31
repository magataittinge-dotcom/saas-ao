"""A2 — modèles de la veille et migration 0028."""
import importlib.util
from datetime import date
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy.exc import IntegrityError

BACKEND = Path(__file__).resolve().parent.parent


def _migration():
    spec = importlib.util.spec_from_file_location("m0028", BACKEND / "alembic/versions/0028_veille.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _executer(engine, fonction):
    with engine.begin() as connexion:
        with Operations.context(MigrationContext.configure(connexion)):
            fonction()


def _avis(**kw):
    from models.avis_veille import AvisVeille
    base = dict(id_boamp="26-000001", objet="Rénovation de toiture", acheteur="Commune d'Exemple",
                departements=["44"], date_parution=date(2026, 10, 30), date_limite=date(2026, 11, 23),
                url_avis="https://www.boamp.fr/pages/avis/?q=idweb:26-000001")
    base.update(kw)
    return AvisVeille(**base)


def test_0028_suit_0027_et_la_chaine_reste_lineaire():
    script = ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini")))
    assert script.get_revision("0028").down_revision == "0027"
    assert len(script.get_heads()) == 1


def test_la_table_des_avis_est_globale():
    from models.avis_veille import AvisVeille
    assert "organization_id" not in AvisVeille.__table__.c


def test_id_boamp_est_unique(db_session):
    db_session.add(_avis())
    db_session.commit()
    db_session.add(_avis())
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_un_avis_garde_ses_listes_json(db_session):
    db_session.add(_avis(id_boamp="26-000002", departements=["44", "2A"], metiers=["couverture"],
                         codes_cpv=["45261000"], descripteurs=[{"code": "74", "libelle": "Couverture"}]))
    db_session.commit()
    db_session.expire_all()
    from models.avis_veille import AvisVeille
    relu = db_session.query(AvisVeille).filter_by(id_boamp="26-000002").one()
    assert relu.departements == ["44", "2A"] and relu.metiers == ["couverture"]
    assert relu.created_at and relu.synchronise_at


def test_preferences_une_ligne_par_utilisateur(db_session, test_org):
    from models.preferences_veille import PreferencesVeille
    from models.user import User
    utilisateur = User(id="u-veille", email="veille@example.test", name="Test", organization_id=test_org.id)
    db_session.add(utilisateur)
    db_session.commit()
    db_session.add(PreferencesVeille(user_id="u-veille", organization_id=test_org.id, departements=["75"], filtres={}))
    db_session.commit()
    db_session.add(PreferencesVeille(user_id="u-veille", organization_id=test_org.id, departements=[], filtres={}))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_upgrade_cree_les_tables_les_index_et_reste_idempotent_sans_gin_en_sqlite():
    m = _migration()
    moteur = sa.create_engine("sqlite://")
    with moteur.begin() as c:
        c.execute(sa.text("CREATE TABLE users (id VARCHAR PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE organizations (id VARCHAR PRIMARY KEY)"))
    _executer(moteur, m.upgrade)
    _executer(moteur, m.upgrade)                       # second passage sans effet
    insp = sa.inspect(moteur)
    assert {"avis_veille", "preferences_veille"} <= set(insp.get_table_names())
    index = {i["name"]: i for i in insp.get_indexes("avis_veille")}
    assert index["ix_avis_veille_date_limite"]["column_names"] == ["date_limite"]
    assert index["ix_avis_veille_date_parution"]["column_names"] == ["date_parution"]
    assert index["ix_avis_veille_id_boamp"]["unique"]
    assert not any("gin" in nom for nom in index)       # GIN : PostgreSQL seulement
    _executer(moteur, m.downgrade)
    assert not {"avis_veille", "preferences_veille"} & set(sa.inspect(moteur).get_table_names())
