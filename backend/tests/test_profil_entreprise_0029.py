"""T4 (« Mon entreprise ») — migration 0029 et routes étendues : identité légale, listes typées du profil,
références, personnes clés, qualifications. Chaque route touchée a son test entre entreprises."""
from datetime import date
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient

from database import SessionLocal, get_db
from main import app
from models.document import Document
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.qualification import Qualification
from models.reference import Reference
from models.team_member import TeamMember
from models.user import User
from routers.auth import get_auth_user

BACKEND = Path(__file__).resolve().parent.parent


# ── migration ───────────────────────────────────────────────────────────────

def _module():
    import importlib.util
    spec = importlib.util.spec_from_file_location("m0029", BACKEND / "alembic/versions/0029_profil_entreprise.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _executer(moteur, fonction):
    with moteur.begin() as c:
        with Operations.context(MigrationContext.configure(c)):
            fonction()


def test_0029_suit_0028_une_seule_head():
    script = ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini")))
    assert script.get_revision("0029").down_revision == "0028"
    assert len(script.get_heads()) == 1


def test_modeles_declarent_les_19_colonnes_et_la_table_nullables():
    m = _module()
    assert len(m.COLONNES) == 19
    tables = {"organizations": Organization, "memoire_configs": MemoireConfig, "references": Reference, "team_members": TeamMember}
    for table, nom, _t in m.COLONNES:
        col = tables[table].__table__.c[nom]
        assert col.nullable, f"{table}.{nom} doit être nullable"
    assert all(c.nullable for c in Qualification.__table__.c if c.name not in {"id", "organization_id", "famille", "intitule"})


def test_upgrade_additif_idempotent_et_downgrade_ne_retire_que_le_neuf():
    m = _module()
    moteur = sa.create_engine("sqlite://")
    with moteur.begin() as c:
        c.execute(sa.text("CREATE TABLE organizations (id VARCHAR PRIMARY KEY, name VARCHAR)"))
        c.execute(sa.text("CREATE TABLE documents (id VARCHAR PRIMARY KEY)"))
        c.execute(sa.text("CREATE TABLE memoire_configs (id VARCHAR PRIMARY KEY, historique VARCHAR)"))
        c.execute(sa.text('CREATE TABLE "references" (id VARCHAR PRIMARY KEY, intitule VARCHAR)'))
        c.execute(sa.text("CREATE TABLE team_members (id VARCHAR PRIMARY KEY, name VARCHAR)"))
        c.execute(sa.text("INSERT INTO organizations (id, name) VALUES ('o', 'Entreprise inventée')"))
        c.execute(sa.text("INSERT INTO memoire_configs (id, historique) VALUES ('c', 'texte existant')"))
    _executer(moteur, m.upgrade)
    _executer(moteur, m.upgrade)  # idempotent
    insp = sa.inspect(moteur)
    for table, nom, _t in m.COLONNES:
        assert nom in {c["name"] for c in insp.get_columns(table)}, (table, nom)
    assert "qualifications" in insp.get_table_names()
    assert {c["name"] for c in insp.get_columns("qualifications")} == {
        "id", "organization_id", "famille", "intitule", "organisme", "numero", "perimetre",
        "date_obtention", "date_fin", "document_id", "created_at", "deleted_at"}
    with moteur.begin() as c:  # les données existantes restent
        assert c.execute(sa.text("SELECT name FROM organizations")).scalar() == "Entreprise inventée"
        assert c.execute(sa.text("SELECT forme_juridique FROM organizations")).scalar() is None
    _executer(moteur, m.downgrade)
    _executer(moteur, m.downgrade)
    insp = sa.inspect(moteur)
    assert "qualifications" not in insp.get_table_names()
    assert {c["name"] for c in insp.get_columns("organizations")} == {"id", "name"}
    with moteur.begin() as c:
        assert c.execute(sa.text("SELECT historique FROM memoire_configs")).scalar() == "texte existant"


# ── fixtures : deux entreprises ─────────────────────────────────────────────

@pytest.fixture
def deux(db_session):
    a, b = Organization(id="org-A", name="A — Façade Pro"), Organization(id="org-B", name="B — Maçonnerie SARL")
    db_session.add_all([a, b])
    db_session.commit()
    ua = User(id="user-A", email="a@a.fr", name="Alice", organization_id="org-A")
    ub = User(id="user-B", email="b@b.fr", name="Bob", organization_id="org-B")
    db_session.add_all([ua, ub])
    db_session.commit()
    return ua, ub


def _client(user):
    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = lambda: user
    return TestClient(app)


@pytest.fixture(autouse=True)
def _propre():
    yield
    app.dependency_overrides.clear()


# ── organisation ────────────────────────────────────────────────────────────

def test_organisation_identite_legale_ecrite_et_lue(deux):
    c = _client(deux[0])
    r = c.patch("/api/organizations/me", json={
        "forme_juridique": "SARL", "capital_social": 10000, "greffe_rcs": "Caen",
        "email_contact": "contact@exemple.fr", "telephone": "02 31 00 00 00"})
    assert r.status_code == 200, r.text
    corps = c.get("/api/organizations/me").json()
    assert (corps["forme_juridique"], corps["capital_social"], corps["greffe_rcs"]) == ("SARL", 10000, "Caen")
    assert corps["email_contact"] == "contact@exemple.fr" and corps["telephone"] == "02 31 00 00 00"


@pytest.mark.parametrize("corps", [
    {"email_contact": "pas-un-mail"}, {"telephone": "abc"}, {"telephone": "1" * 31},
    {"capital_social": -1}, {"capital_social": 10_000_000_001}, {"forme_juridique": "x" * 81}, {"greffe_rcs": "x" * 81},
])
def test_organisation_bornes_refusees(deux, corps):
    assert _client(deux[0]).patch("/api/organizations/me", json=corps).status_code == 422


def test_organisation_capital_social_effacable_par_null_et_champ_omis_intact(deux):
    c = _client(deux[0])
    c.patch("/api/organizations/me", json={"capital_social": 40000, "greffe_rcs": "Reims"})
    assert c.patch("/api/organizations/me", json={"capital_social": None}).status_code == 200
    corps = c.get("/api/organizations/me").json()
    assert corps["capital_social"] is None and corps["greffe_rcs"] == "Reims", "null efface ; un champ non envoyé reste"


def test_organisation_champ_vide_accepte_pour_effacer(deux):
    c = _client(deux[0])
    c.patch("/api/organizations/me", json={"email_contact": "x@exemple.fr", "telephone": "0231000000"})
    assert c.patch("/api/organizations/me", json={"email_contact": "", "telephone": ""}).status_code == 200
    assert c.get("/api/organizations/me").json()["email_contact"] == ""


def test_cross_org_identite_legale_isolee(deux):
    ua, ub = deux
    _client(ua).patch("/api/organizations/me", json={"forme_juridique": "SAS", "email_contact": "a@exemple.fr"})
    b = _client(ub).get("/api/organizations/me").json()
    assert b["forme_juridique"] is None and b["email_contact"] is None
    _client(ub).patch("/api/organizations/me", json={"forme_juridique": "EURL"})
    assert _client(ua).get("/api/organizations/me").json()["forme_juridique"] == "SAS"


# ── profil : listes typées ──────────────────────────────────────────────────

PROFIL_OK = {
    "metiers": ["facade_ite", "peinture"], "departements_intervention": ["14", "50", "2A"],
    "effectifs_par_categorie": [{"categorie": "encadrement", "specialite": None, "effectif": 2},
                                {"categorie": "ouvrier", "specialite": "maçons", "effectif": 6}],
    "habilitations": [{"type": "sst", "libelle": None, "nombre": 3, "valide_jusqu": "2027-06-30"},
                      {"type": "autre", "libelle": "Nacelle", "nombre": 2, "valide_jusqu": None}],
    "materiel_liste": [{"quantite": 4, "designation": "Échafaudage de façade", "unite": None, "famille": "Accès"}],
    "vehicules_liste": [{"quantite": 3, "designation": "Fourgon", "unite": None, "famille": None}],
    "sous_traitance_partenaires": "Partenaires inventés", "sous_traitance_part_pct": 15, "sav_garantie": "Texte inventé",
    "chiffre_affaires": [{"annee": "2025", "montant": "1 100 000 €", "montant_domaine": "400 000 €",
                          "exercice_debut": "2025-01-01", "exercice_fin": "2025-12-31", "effectif_moyen": 9},
                         {"annee": "", "montant": ""}],
}


def test_profil_listes_typees_ecrites_et_relues(deux):
    c = _client(deux[0])
    r = c.put("/api/memoire-config", json=PROFIL_OK)
    assert r.status_code == 200, r.text
    lu = c.get("/api/memoire-config").json()
    for cle in ("metiers", "departements_intervention", "effectifs_par_categorie", "habilitations",
                "materiel_liste", "vehicules_liste", "sous_traitance_part_pct"):
        assert lu[cle] == PROFIL_OK[cle], cle
    assert lu["chiffre_affaires"][0]["effectif_moyen"] == 9
    assert lu["chiffre_affaires"][1] == {"annee": "", "montant": ""}, "les lignes d'avant gardent leurs deux clés seules"


def test_profil_ancien_corps_inchange(deux):
    """Un corps à l'ancienne (deux clés par ligne de chiffre d'affaires) est accepté et ne gagne aucune clé."""
    c = _client(deux[0])
    r = c.put("/api/memoire-config", json={"chiffre_affaires": [{"annee": "2024", "montant": "980 000 €"}], "activites": "Ravalement"})
    assert r.status_code == 200
    assert r.json()["chiffre_affaires"] == [{"annee": "2024", "montant": "980 000 €"}]


@pytest.mark.parametrize("corps", [
    {"metiers": ["inconnu"]}, {"metiers": ["peinture", "peinture"]},
    {"departements_intervention": ["99"]}, {"departements_intervention": ["14"] * 102},
    {"effectifs_par_categorie": [{"categorie": "ouvrier", "specialite": "maçons", "effectif": 1}, {"categorie": "ouvrier", "specialite": "Maçons", "effectif": 2}]},
    {"effectifs_par_categorie": [{"categorie": "chef", "effectif": 1}]},
    {"effectifs_par_categorie": [{"categorie": "ouvrier", "effectif": 1000}]},
    {"effectifs_par_categorie": [{"categorie": "ouvrier", "specialite": f"s{i}", "effectif": 1} for i in range(41)]},
    {"habilitations": [{"type": "autre", "nombre": 1}]},
    {"habilitations": [{"type": "sst", "nombre": 1}, {"type": "sst", "nombre": 2}]},
    {"habilitations": [{"type": "sst", "nombre": 1, "valide_jusqu": "30/06/2027"}]},
    {"materiel_liste": [{"quantite": 0, "designation": "x"}]},
    {"materiel_liste": [{"quantite": 1, "designation": ""}]},
    {"materiel_liste": [{"quantite": 1, "designation": "x" * 121}]},
    {"materiel_liste": [{"quantite": 1, "designation": f"m{i}"} for i in range(61)]},
    {"vehicules_liste": [{"quantite": 1, "designation": f"v{i}"} for i in range(21)]},
    {"sous_traitance_part_pct": 101}, {"sous_traitance_part_pct": -1},
    {"sous_traitance_partenaires": "x" * 2001}, {"sav_garantie": "x" * 3001},
    {"chiffre_affaires": [{"annee": "2024", "montant": "1"}] * 6},
    {"chiffre_affaires": [{"annee": "24", "montant": "1"}]},
    {"chiffre_affaires": [{"annee": "2024", "montant": "x" * 41}]},
    {"chiffre_affaires": [{"annee": "2024", "montant": "1", "effectif_moyen": 1000}]},
    {"chiffre_affaires": [{"annee": "2024", "montant": "1", "exercice_debut": "hier"}]},
])
def test_profil_bornes_refusees(deux, corps):
    assert _client(deux[0]).put("/api/memoire-config", json=corps).status_code == 422


def test_cross_org_profil_isole(deux):
    ua, ub = deux
    _client(ua).put("/api/memoire-config", json=PROFIL_OK)
    lu_b = _client(ub).get("/api/memoire-config").json()
    assert lu_b["metiers"] is None and lu_b["materiel_liste"] is None and lu_b["habilitations"] is None
    _client(ub).put("/api/memoire-config", json={"sous_traitance_part_pct": 40})
    assert _client(ua).get("/api/memoire-config").json()["sous_traitance_part_pct"] == 15


# ── références ──────────────────────────────────────────────────────────────

def test_reference_nouveaux_champs_et_bornes(deux):
    c = _client(deux[0])
    r = c.post("/api/references", json={"intitule": "École (exemple)", "description": "Ravalement de façades",
                                        "client_type": "public", "client_adresse": "1 place de l'Exemple", "mode_intervention": "direct"})
    assert r.status_code == 200, r.text
    ref = r.json()
    assert (ref["description"], ref["client_type"], ref["mode_intervention"]) == ("Ravalement de façades", "public", "direct")
    assert c.patch(f"/api/references/{ref['id']}", json={"mode_intervention": "cotraitance"}).json()["mode_intervention"] == "cotraitance"
    for mauvais in ({"client_type": "etat"}, {"mode_intervention": "seul"}, {"description": "x" * 1501}, {"client_adresse": "x" * 501}):
        assert c.patch(f"/api/references/{ref['id']}", json=mauvais).status_code == 422, mauvais


def test_reference_particulier_nom_complet_faux_par_defaut_puis_coche(deux):
    c = _client(deux[0])
    ref = c.post("/api/references", json={"intitule": "Extension (exemple)", "maitre_ouvrage": "Mme Dubois", "client_type": "particulier"}).json()
    assert ref["client_nom_complet"] is False
    assert c.patch(f"/api/references/{ref['id']}", json={"client_nom_complet": True}).json()["client_nom_complet"] is True
    assert c.get("/api/references").json()[0]["client_nom_complet"] is True
    assert c.patch(f"/api/references/{ref['id']}", json={"client_nom_complet": "oui"}).status_code == 422


def test_cross_org_reference_nouveaux_champs(deux):
    ua, ub = deux
    ref = _client(ua).post("/api/references", json={"intitule": "R", "client_type": "particulier"}).json()
    assert _client(ub).patch(f"/api/references/{ref['id']}", json={"client_type": "public"}).status_code == 404
    assert _client(ub).get("/api/references").json() == []
    assert _client(ua).get("/api/references").json()[0]["client_type"] == "particulier"


# ── personnes clés ──────────────────────────────────────────────────────────

def test_equipe_experience_resume_et_modification(deux):
    c = _client(deux[0])
    m = c.post("/api/users/team", json={"name": "Alex Exemple", "role": "Conducteur de travaux", "experience_resume": "12 ans de façades"}).json()
    assert m["experience_resume"] == "12 ans de façades"
    r = c.patch(f"/api/users/team/{m['id']}", json={"specialite": "Façades", "experience_years": 12, "name": None})
    assert r.status_code == 200 and r.json()["specialite"] == "Façades" and r.json()["name"] == "Alex Exemple"
    assert c.patch(f"/api/users/team/{m['id']}", json={"experience_resume": "x" * 1001}).status_code == 422


def test_cross_org_equipe_modification(deux):
    ua, ub = deux
    m = _client(ua).post("/api/users/team", json={"name": "Alex", "role": "Chef"}).json()
    assert _client(ub).patch(f"/api/users/team/{m['id']}", json={"role": "Autre"}).status_code == 404
    assert _client(ua).get("/api/users/team").json()[0]["role"] == "Chef"


# ── qualifications ──────────────────────────────────────────────────────────

def _doc(db, org, id_="doc-1", supprime=False):
    d = Document(id=id_, organization_id=org, type="qualibat", category="qualifications", file_url="x", file_name="q.pdf",
                 status="valid", deleted_at=date.today() and None)
    if supprime:
        from datetime import datetime
        d.deleted_at = datetime.utcnow()
    db.add(d)
    db.commit()
    return d


def test_qualifications_crud(deux, db_session):
    c = _client(deux[0])
    d = _doc(db_session, "org-A")
    r = c.post("/api/qualifications", json={"famille": "qualification", "intitule": "Qualibat 7112", "organisme": "Qualibat",
                                            "numero": "12345", "perimetre": "7112", "date_obtention": "2024-01-10",
                                            "date_fin": "2027-01-09", "document_id": d.id})
    assert r.status_code == 201, r.text
    q = r.json()
    assert q["organization_id"] == "org-A" and q["document_id"] == d.id
    assert [x["id"] for x in c.get("/api/qualifications").json()] == [q["id"]]
    assert c.patch(f"/api/qualifications/{q['id']}", json={"numero": "99999"}).json()["numero"] == "99999"
    assert c.delete(f"/api/qualifications/{q['id']}").status_code == 204
    assert c.get("/api/qualifications").json() == []
    assert db_session.get(Qualification, q["id"]).deleted_at is not None, "suppression douce"


@pytest.mark.parametrize("corps", [
    {"famille": "autre", "intitule": "x"}, {"famille": "rge", "intitule": ""}, {"famille": "rge", "intitule": "x" * 201},
    {"famille": "assurance", "intitule": "Décennale", "organisme": "x" * 121},
    {"famille": "assurance", "intitule": "Décennale", "numero": "x" * 81},
    {"famille": "assurance", "intitule": "Décennale", "perimetre": "x" * 501},
    {"famille": "assurance", "intitule": "Décennale", "date_obtention": "2026-05-01", "date_fin": "2026-01-01"},
    {"famille": "assurance", "intitule": "Décennale", "organization_id": "org-B"},
])
def test_qualifications_bornes_refusees(deux, corps):
    assert _client(deux[0]).post("/api/qualifications", json=corps).status_code == 422


def test_qualifications_dates_a_la_modification(deux):
    c = _client(deux[0])
    q = c.post("/api/qualifications", json={"famille": "assurance", "intitule": "RC", "date_obtention": "2026-01-01", "date_fin": "2027-01-01"}).json()
    assert c.patch(f"/api/qualifications/{q['id']}", json={"date_fin": "2025-01-01"}).status_code == 422


def test_cross_org_qualifications_lecture_modification_suppression(deux):
    ua, ub = deux
    q = _client(ua).post("/api/qualifications", json={"famille": "rge", "intitule": "Qualit'EnR"}).json()
    cb = _client(ub)
    assert cb.get("/api/qualifications").json() == []
    assert cb.patch(f"/api/qualifications/{q['id']}", json={"intitule": "piraté"}).status_code == 404
    assert cb.delete(f"/api/qualifications/{q['id']}").status_code == 404
    assert _client(ua).get("/api/qualifications").json()[0]["intitule"] == "Qualit'EnR"


def test_cross_org_justificatif_d_une_autre_entreprise_refuse(deux, db_session):
    ua, ub = deux
    doc_b = _doc(db_session, "org-B", "doc-B")
    ca = _client(ua)
    r = ca.post("/api/qualifications", json={"famille": "rge", "intitule": "X", "document_id": doc_b.id})
    assert r.status_code == 422
    r_inconnu = ca.post("/api/qualifications", json={"famille": "rge", "intitule": "X", "document_id": "n-existe-pas"})
    assert r_inconnu.status_code == 422 and r_inconnu.json() == r.json(), "même réponse : l'existence d'une pièce d'autrui n'est pas révélée"
    q = ca.post("/api/qualifications", json={"famille": "rge", "intitule": "X"}).json()
    assert ca.patch(f"/api/qualifications/{q['id']}", json={"document_id": doc_b.id}).status_code == 422
    assert ca.get("/api/qualifications").json()[0]["document_id"] is None


def test_justificatif_supprime_refuse(deux, db_session):
    d = _doc(db_session, "org-A", "doc-sup", supprime=True)
    assert _client(deux[0]).post("/api/qualifications", json={"famille": "rge", "intitule": "X", "document_id": d.id}).status_code == 422


def test_suppression_du_compte_retire_les_qualifications(deux, db_session):
    ua, _ub = deux
    d = _doc(db_session, "org-A")
    _client(ua).post("/api/qualifications", json={"famille": "rge", "intitule": "X", "document_id": d.id})
    assert _client(ua).delete("/api/users/me").status_code == 200
    db_session.expire_all()
    assert db_session.query(Qualification).filter_by(organization_id="org-A").count() == 0
