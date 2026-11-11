"""S-02 (audit de sécurité, P1) — la suppression du compte (droit à l'oubli) passe pour un client réel.

Une organisation reçoit UNE LIGNE DANS CHAQUE TABLE QUI LUI EST LIÉE (déduites des modèles : colonne
`organization_id` ou clé étrangère vers une ligne de l'organisation), avec les clés étrangères CONTRÔLÉES
(SQLite `PRAGMA foreign_keys=ON` ; Postgres si `SYNORIX_TEST_PG_URL` désigne une base jetable). Puis
`DELETE /api/users/me` → 200, plus aucune ligne de l'organisation, celles d'une autre organisation intactes, et les
fichiers déposés effacés du disque après le commit. Valeurs inventées, aucun appel extérieur."""
import enum
import os
import uuid
from datetime import date, datetime

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app


def _valeur(colonne, n):
    t = colonne.type
    if getattr(t, "enums", None):
        return t.enums[0]
    try:
        py = t.python_type
    except NotImplementedError:
        return {}
    if issubclass(py, bool):
        return False
    if issubclass(py, int):
        return n
    if issubclass(py, float):
        return 0.0
    if issubclass(py, datetime):
        return datetime.utcnow()
    if issubclass(py, date):
        return date.today()
    if issubclass(py, (dict,)):
        return {}
    if issubclass(py, (list,)):
        return []
    if issubclass(py, enum.Enum):
        return list(py)[0]
    if issubclass(py, str):
        longueur = getattr(t, "length", None) or 30
        return f"v{n}{uuid.uuid4().hex}"[:max(1, min(longueur, 30))]
    return None


def _peupler(sess, org_id, user_id):
    """Une ligne dans chaque table liée à l'organisation ; rend {table: ligne}."""
    lignes = {"organizations": {"id": org_id}, "users": {"id": user_id}}
    liees = {"organizations", "users"}
    for n, table in enumerate(Base.metadata.sorted_tables):
        if table.name in lignes:
            continue
        fks = [fk for fk in table.foreign_keys if fk.column.table is not table]
        liee = "organization_id" in table.c or any(fk.column.table.name in liees for fk in fks)
        if not liee:
            continue
        if any(fk.column.table.name not in lignes for fk in fks if not fk.parent.nullable):
            pytest.fail(f"{table.name} : parent obligatoire non peuplé")
        ligne = {}
        for col in table.c:
            fk = next((f for f in col.foreign_keys if f.column.table is not table), None)
            if fk is not None and fk.column.table.name in lignes:
                ligne[col.name] = lignes[fk.column.table.name].get(fk.column.name)
            elif col.name == "organization_id":
                ligne[col.name] = org_id
            elif col.primary_key and col.autoincrement is True:
                continue
            elif col.default is not None or col.server_default is not None:
                continue
            elif col.nullable and not col.primary_key:
                continue
            else:
                ligne[col.name] = _valeur(col, n + 1)
        res = sess.execute(table.insert().values(**ligne))
        for col, val in zip(table.primary_key.columns, res.inserted_primary_key or []):
            ligne[col.name] = val
        # les valeurs posées par défaut (identifiants uuid) : relues
        pk = list(table.primary_key.columns)
        if pk and any(ligne.get(c.name) is None for c in pk):
            pytest.fail(f"{table.name} : clé primaire non relue")
        lignes[table.name] = ligne
        liees.add(table.name)
    sess.commit()
    return lignes


def _moteur_sqlite():
    from database import engine
    moteur = create_engine(engine.url)

    @event.listens_for(moteur, "connect")
    def _fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()
    return moteur


@pytest.fixture(params=["sqlite", "postgres"])
def moteur(request):
    if request.param == "sqlite":
        m = _moteur_sqlite()
        yield m
        m.dispose()
        return
    url = os.environ.get("SYNORIX_TEST_PG_URL")
    if not url:
        pytest.skip("SYNORIX_TEST_PG_URL non posée (base Postgres jetable)")
    import models  # noqa: F401
    m = create_engine(url)
    Base.metadata.drop_all(bind=m)
    Base.metadata.create_all(bind=m)
    yield m
    Base.metadata.drop_all(bind=m)
    m.dispose()


@pytest.fixture
def client_fk(moteur, test_user, tmp_path, monkeypatch):
    from fastapi import Request
    from fastapi.testclient import TestClient
    from routers.auth import get_auth_user
    import routers.users as ru

    Session = sessionmaker(bind=moteur)
    if moteur.dialect.name != "sqlite":
        s = Session()
        from models.organization import Organization
        from models.user import User
        s.add(Organization(id=test_user.organization_id, name="Org essai"))
        s.add(User(id=test_user.id, email="essai@example.invalid", name="Essai", organization_id=test_user.organization_id))
        s.commit()
        s.close()

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    def _auth(request: Request):
        request.state.rl_key = f"org:{test_user.organization_id}"
        return test_user
    monkeypatch.setattr(ru, "UPLOADS_ROOT", tmp_path)
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = _auth
    try:
        yield TestClient(app), Session, tmp_path
    finally:
        app.dependency_overrides.clear()


def test_suppression_du_compte_vide_chaque_table_liee(client_fk, test_user):
    client, Session, uploads = client_fk
    s = Session()
    lignes = _peupler(s, test_user.organization_id, test_user.id)
    # Une autre organisation, qui ne doit pas bouger.
    from models.organization import Organization
    from models.user import User
    s.add(Organization(id="org-voisine", name="Voisine"))
    s.add(User(id="user-voisin", email="voisin@example.invalid", name="Voisin", organization_id="org-voisine"))
    s.commit()
    tables = [t for t in Base.metadata.sorted_tables if t.name in lignes]
    assert {"couts_ia", "preferences_veille", "lectures_depot", "propositions_profil", "plans_memoire",
            "projects", "documents", "notifications", "quota_consumptions"} <= {t.name for t in tables}
    avant = {t.name: s.execute(select(func.count()).select_from(t)).scalar() for t in tables}
    assert all(avant.values()), avant
    s.close()

    projet = lignes["projects"]["id"]
    (uploads / "projects" / projet).mkdir(parents=True)
    (uploads / "projects" / projet / "dce.pdf").write_bytes(b"%PDF-1.4 invente")
    (uploads / "organizations" / test_user.organization_id).mkdir(parents=True)
    (uploads / "organizations" / test_user.organization_id / "kbis.pdf").write_bytes(b"%PDF-1.4 invente")
    (uploads / "organizations" / "org-voisine").mkdir(parents=True)
    (uploads / "organizations" / "org-voisine" / "garde.pdf").write_bytes(b"%PDF-1.4 invente")

    r = client.delete("/api/users/me")
    assert r.status_code == 200, r.text
    assert r.json() == {"deleted": True, "projects_deleted": 1}

    s = Session()
    restes = {t.name: s.execute(select(func.count()).select_from(t)).scalar() for t in tables}
    restes["organizations"] -= 1     # la voisine
    restes["users"] -= 1
    assert not any(restes.values()), {k: v for k, v in restes.items() if v}
    assert s.get(Organization, "org-voisine") is not None
    s.close()
    assert not (uploads / "projects" / projet).exists()
    assert not (uploads / "organizations" / test_user.organization_id).exists()
    assert (uploads / "organizations" / "org-voisine" / "garde.pdf").exists()


def test_un_echec_en_base_n_efface_aucun_fichier(client_fk, test_user, monkeypatch):
    client, Session, uploads = client_fk
    from services import suppression_compte
    dossier = uploads / "organizations" / test_user.organization_id
    dossier.mkdir(parents=True)
    (dossier / "kbis.pdf").write_bytes(b"%PDF-1.4 invente")

    def panne(db, org_id):
        raise RuntimeError("panne simulée")
    monkeypatch.setattr(suppression_compte, "supprimer_organisation", panne)
    r = client.delete("/api/users/me")
    assert r.status_code == 500 and "Rien n’a été effacé" in r.json()["detail"]
    assert (dossier / "kbis.pdf").exists()
