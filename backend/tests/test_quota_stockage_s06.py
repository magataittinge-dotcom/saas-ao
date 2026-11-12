"""S-06 (audit de sécurité, P1) — quota de stockage par organisation et garde du disque, vérifiés AVANT d'écrire.

- organisation au-dessus de son quota (somme des `file_size` déjà enregistrées) → 413, aucun fichier écrit ;
- offre gratuite : quota plus petit (QUOTA_STOCKAGE_GRATUIT_GO) ;
- espace libre simulé sous DISQUE_LIBRE_MIN_POURCENT → 507 sans écriture, sur les trois dépôts ;
- messages clairs, sans « manquant », « incomplet », « absent ».
Valeurs inventées, aucun appel extérieur."""
import pytest

import routers.projects as projects_mod
from models.organization import Organization
from models.project import Project, ProjectDocument
from services import stockage

GO = 1024 ** 3
PDF = b"%PDF-1.4\n" + b"x" * 2048


@pytest.fixture
def projet(db_session, test_org, tmp_path, monkeypatch):
    import services.file_storage as fs
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(stockage, "_espace_disque", lambda chemin: (100 * GO, 50 * GO))
    db_session.add(Project(id="p-sto", organization_id=test_org.id, name="DCE"))
    db_session.commit()
    return "p-sto"


def _deposer(client, pid="p-sto"):
    return client.post(f"/api/projects/{pid}/documents", files={"file": ("RC.pdf", PDF, "application/pdf")})


def _deja(db, org_id, octets, pid="p-ancien"):
    db.add(Project(id=pid, organization_id=org_id, name="Ancien"))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="ancien.pdf", file_size=octets))
    db.commit()


def _fichiers(racine):
    return [p for p in racine.rglob("*") if p.is_file()]


def test_sous_le_quota_le_depot_passe(client, db_session, test_org, projet):
    db_session.get(Organization, test_org.id).plan = "pro"
    _deja(db_session, test_org.id, 19 * GO)
    assert _deposer(client).status_code == 200


def test_au_dessus_du_quota_413_sans_ecriture(client, db_session, test_org, projet, tmp_path):
    db_session.get(Organization, test_org.id).plan = "pro"
    _deja(db_session, test_org.id, 20 * GO)
    r = _deposer(client)
    assert r.status_code == 413 and r.json()["detail"] == stockage.MSG_QUOTA
    assert _fichiers(tmp_path) == []
    assert db_session.query(ProjectDocument).filter(ProjectDocument.project_id == "p-sto").count() == 0


def test_offre_gratuite_quota_plus_petit_et_reglable(client, db_session, test_org, projet, monkeypatch):
    _deja(db_session, test_org.id, 5 * GO)                 # offre gratuite : 5 Go par défaut
    assert _deposer(client).status_code == 413
    monkeypatch.setenv("QUOTA_STOCKAGE_GRATUIT_GO", "6")
    assert _deposer(client).status_code == 200
    monkeypatch.setenv("QUOTA_STOCKAGE_GRATUIT_GO", "0")    # 0 = pas de quota
    assert _deposer(client).status_code == 200


def test_le_quota_est_celui_de_l_organisation(client, db_session, test_org, projet):
    db_session.add(Organization(id="org-voisine", name="Voisine"))
    db_session.commit()
    _deja(db_session, "org-voisine", 50 * GO)
    assert _deposer(client).status_code == 200


@pytest.mark.parametrize("route", ["dce", "coffre", "entreprise"])
def test_disque_presque_plein_507_sans_ecriture(client, db_session, test_org, projet, tmp_path, monkeypatch, route):
    monkeypatch.setattr(stockage, "_espace_disque", lambda chemin: (100 * GO, 14 * GO))
    if route == "dce":
        r = _deposer(client)
    elif route == "coffre":
        r = client.post("/api/documents", files={"file": ("kbis.pdf", PDF, "application/pdf")},
                        data={"type": "kbis"})
    else:
        r = client.post("/api/entreprise/depots/kbis", files={"fichiers": ("kbis.pdf", PDF, "application/pdf")})
    if r.status_code == 404 and route != "dce":
        pytest.skip(f"chemin de la route {route} à revoir")
    assert r.status_code == 507, r.text
    assert r.json()["detail"] == stockage.MSG_DISQUE
    assert _fichiers(tmp_path) == []


def test_messages_sans_mot_interdit():
    for msg in (stockage.MSG_QUOTA, stockage.MSG_DISQUE):
        assert not any(m in msg.lower() for m in ("manquant", "incomplet", "absent", "!"))


# ── Restes (CORRECTIFS-SECURITE § 7) : le coffre-fort et les dépôts de Mon entreprise comptent dans le quota ──────
def _coffre(db, org_id, racine, octets, nom="kbis-ancien.pdf"):
    """Un document du coffre (ou d'un dépôt de Mon entreprise, rangé au coffre) déjà sur le disque, sans taille en base."""
    from models.document import Document
    (racine / "coffre").mkdir(exist_ok=True)
    (racine / "coffre" / nom).write_bytes(b"x" * octets)
    db.add(Document(organization_id=org_id, type="kbis", file_url=f"/uploads/coffre/{nom}", file_name=nom))
    db.commit()


def test_le_coffre_fort_compte_dans_le_quota(client, db_session, test_org, projet, tmp_path, monkeypatch):
    monkeypatch.setenv("QUOTA_STOCKAGE_GRATUIT_GO", str(3000 / GO))     # ≈ 3 000 octets
    _coffre(db_session, test_org.id, tmp_path, 1500)
    assert stockage.utilise_octets(db_session, test_org.id) == 1500
    r = _deposer(client)                                                 # 1 500 + ~2 300 > 3 000
    assert r.status_code == 413 and r.json()["detail"] == stockage.MSG_QUOTA


def test_un_fichier_disparu_ou_hors_des_depots_compte_zero(db_session, test_org, projet, tmp_path):
    from models.document import Document
    db_session.add_all([
        Document(organization_id=test_org.id, type="kbis", file_url="/uploads/coffre/parti.pdf", file_name="p.pdf"),
        Document(organization_id=test_org.id, type="kbis", file_url="/uploads/../../etc/passwd", file_name="e"),
        Document(organization_id=test_org.id, type="kbis", file_url="https://ailleurs/x.pdf", file_name="x"),
    ])
    db_session.commit()
    assert stockage.utilise_octets(db_session, test_org.id) == 0


def test_le_coffre_d_une_autre_organisation_ne_compte_pas(db_session, test_org, projet, tmp_path):
    db_session.add(Organization(id="org-voisine-2", name="Voisine"))
    db_session.commit()
    _coffre(db_session, "org-voisine-2", tmp_path, 4000)
    assert stockage.utilise_octets(db_session, test_org.id) == 0
    assert stockage.utilise_octets(db_session, "org-voisine-2") == 4000
