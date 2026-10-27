"""Document entier de « Voir dans le DCE » (T-XACCEL) : plages HTTP en dev, X-Accel-Redirect en prod.

Réglage SYNORIX_X_ACCEL_PREFIX : vide (défaut, dev) → FastAPI sert le fichier avec ses plages
HTTP (206) ; renseigné → réponse vide + X-Accel-Redirect, nginx envoie le fichier (plages
natives). Dans les deux cas, la signature et l'appartenance à l'organisation sont vérifiées
AVANT : un refus ne porte jamais d'en-tête X-Accel-Redirect.
"""
import pytest

from models.project import Project
from services.file_storage import sign_file_path

CONTENU = b"%PDF-1.4 " + bytes(range(256)) * 8


@pytest.fixture
def uploads(tmp_path, monkeypatch):
    from routers import file_serve as fs
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    monkeypatch.delenv("SYNORIX_X_ACCEL_PREFIX", raising=False)
    return tmp_path


def _planter(uploads, db_session, org_id, projet, nom="doc.pdf", contenu=CONTENU):
    db_session.add(Project(id=projet, organization_id=org_id, name=projet))
    db_session.commit()
    chemin = uploads / "projects" / projet / "dce" / nom
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_bytes(contenu)
    return f"projects/{projet}/dce/{nom}"


def test_dev_sans_prefixe_plages_http_206(client, db_session, test_org, uploads):
    rel = _planter(uploads, db_session, test_org.id, "proj-x1")
    url = sign_file_path(rel, org_id=test_org.id)
    plein = client.get(url)
    assert plein.status_code == 200 and plein.content == CONTENU
    assert plein.headers["accept-ranges"] == "bytes"
    assert plein.headers["content-disposition"].startswith("inline;")
    part = client.get(url, headers={"Range": "bytes=10-19"})
    assert part.status_code == 206
    assert part.content == CONTENU[10:20]
    assert part.headers["content-range"] == f"bytes 10-19/{len(CONTENU)}"
    fin = client.get(url, headers={"Range": "bytes=-16"})
    assert fin.status_code == 206 and fin.content == CONTENU[-16:]


def test_prod_avec_prefixe_reponse_vide_et_x_accel_redirect(client, db_session, test_org, uploads, monkeypatch):
    monkeypatch.setenv("SYNORIX_X_ACCEL_PREFIX", "/_fichiers_internes")
    rel = _planter(uploads, db_session, test_org.id, "proj-x2")
    resp = client.get(sign_file_path(rel, org_id=test_org.id))
    assert resp.status_code == 200
    assert resp.content == b""
    assert resp.headers["x-accel-redirect"] == "/_fichiers_internes/projects/proj-x2/dce/doc.pdf"
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.headers["content-disposition"].startswith("inline;")
    assert 'filename="doc.pdf"' in resp.headers["content-disposition"]


def test_prefixe_normalise_et_nom_avec_espaces_et_accents_encode(client, db_session, test_org, uploads, monkeypatch):
    monkeypatch.setenv("SYNORIX_X_ACCEL_PREFIX", "_fichiers_internes/")
    rel = _planter(uploads, db_session, test_org.id, "proj-x3", nom="CCTP lot 05 — façade.pdf")
    resp = client.get(sign_file_path(rel, org_id=test_org.id))
    assert resp.status_code == 200
    assert resp.headers["x-accel-redirect"] == (
        "/_fichiers_internes/projects/proj-x3/dce/CCTP%20lot%2005%20%E2%80%94%20fa%C3%A7ade.pdf")
    assert "filename*=UTF-8''CCTP%20lot%2005" in resp.headers["content-disposition"]


def test_x_accel_autre_organisation_refuse_sans_en_tete(client, db_session, test_org, uploads, monkeypatch):
    from models.organization import Organization
    monkeypatch.setenv("SYNORIX_X_ACCEL_PREFIX", "/_fichiers_internes")
    db_session.add(Organization(id="org-autre-xa", name="Autre BTP"))
    db_session.commit()
    rel = _planter(uploads, db_session, "org-autre-xa", "proj-x4")
    # signé par l'attaquant pour sa propre organisation, sur le fichier d'une autre
    resp = client.get(sign_file_path(rel, org_id=test_org.id))
    assert resp.status_code in (403, 404)
    assert "x-accel-redirect" not in resp.headers


def test_x_accel_traversee_de_chemin_refusee_sans_en_tete(client, db_session, test_org, uploads, monkeypatch):
    monkeypatch.setenv("SYNORIX_X_ACCEL_PREFIX", "/_fichiers_internes")
    _planter(uploads, db_session, test_org.id, "proj-x5")
    resp = client.get(sign_file_path("projects/proj-x5/../../../etc/passwd", org_id=test_org.id))
    assert resp.status_code in (403, 404)
    assert "x-accel-redirect" not in resp.headers


def test_x_accel_sans_signature_refuse(client, db_session, test_org, uploads, monkeypatch):
    monkeypatch.setenv("SYNORIX_X_ACCEL_PREFIX", "/_fichiers_internes")
    rel = _planter(uploads, db_session, test_org.id, "proj-x6")
    resp = client.get(f"/api/files/view/{rel}")
    assert resp.status_code == 403
    assert "x-accel-redirect" not in resp.headers


def test_x_accel_fichier_inexistant_404_sans_en_tete(client, db_session, test_org, uploads, monkeypatch):
    monkeypatch.setenv("SYNORIX_X_ACCEL_PREFIX", "/_fichiers_internes")
    rel = _planter(uploads, db_session, test_org.id, "proj-x7")
    (uploads / rel).unlink()
    resp = client.get(sign_file_path(rel, org_id=test_org.id))
    assert resp.status_code == 404
    assert "x-accel-redirect" not in resp.headers
