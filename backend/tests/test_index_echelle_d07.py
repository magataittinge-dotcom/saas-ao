"""D-07 et D-06 (audit données, solidité, coûts) — index de lecture à l'échelle (migration 0037).

D-07 : la liste des notifications d'une organisation (`routers/notifications.py`, 50 dernières) lit l'index composé
(organization_id, created_at) : mesuré sur la base jetable à 100 000 notifications, 200 organisations : 1,88 ms et
9 756 lignes jetées avant, 0,20 ms et 0 ligne jetée après. Ici : le modèle le déclare (bases créées par `create_all`)
et SQLite le choisit pour la même requête. D-06 : la migration pose les index trigrammes (PostgreSQL)."""
import importlib.util
from pathlib import Path

from sqlalchemy import text

from models.notification import Notification

RACINE = Path(__file__).resolve().parents[1]


def test_le_modele_declare_l_index_compose():
    index = {i.name: [c.name for c in i.columns] for i in Notification.__table__.indexes}
    assert index["ix_notifications_org_created"] == ["organization_id", "created_at"]


def test_la_liste_d_une_organisation_lit_l_index_compose(db_session):
    plan = db_session.execute(text(
        "EXPLAIN QUERY PLAN SELECT * FROM notifications WHERE organization_id = 'o1' "
        "ORDER BY created_at DESC LIMIT 50")).all()
    lignes = " ".join(str(ligne[-1]) for ligne in plan)
    assert "ix_notifications_org_created" in lignes, lignes
    assert "TEMP B-TREE" not in lignes.upper()                 # pas de tri : l'index rend l'ordre


def test_la_migration_0037_suit_0036_et_pose_les_index():
    chemin = RACINE / "alembic" / "versions" / "0037_index_echelle.py"
    spec = importlib.util.spec_from_file_location("m0037", chemin)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (module.revision, module.down_revision) == ("0037", "0036")
    source = chemin.read_text(encoding="utf-8")
    assert "ix_notifications_org_created" in source
    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in source
    assert "gin_trgm_ops" in source and "objet" in source and "acheteur" in source
