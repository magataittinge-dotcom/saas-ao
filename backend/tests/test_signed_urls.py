"""
Tests URLs signées à durée limitée (C22) — coffre-fort & documents projet.

Contrat :
  • GET /api/files/sign?path=...  (Bearer + ownership) → mint une URL signée
    /api/files/view/{path}?org=<org_id>&exp=<unix>&sig=<hmac>  (TTL 15 min).
  • GET /api/files/view/... exige une signature valide :
      - sans signature → 403
      - signature expirée → 403
      - signature altérée (sig, path ou org) → 403
      - signature valide mais l'org signée ne possède pas le fichier → 403/404
  • La défense path-traversal reste active même avec signature valide.
"""
import time
from urllib.parse import parse_qs, urlparse

import pytest

from models.project import Project


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _plant_file(uploads_root, rel_path: str, content: bytes = b"%PDF-1.4 contenu") -> None:
    full = uploads_root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(content)


def _make_project(db_session, org_id: str, pid: str) -> Project:
    p = Project(id=pid, organization_id=org_id, name=f"Projet {pid}")
    db_session.add(p)
    db_session.commit()
    return p


@pytest.fixture
def patched_uploads(tmp_path, monkeypatch):
    from routers import file_serve as fs
    monkeypatch.setattr(fs, "UPLOADS_ROOT", tmp_path)
    return tmp_path


# ─── Primitives de signature (unit) ──────────────────────────────────────────

def test_sign_then_verify_roundtrip():
    from services.file_storage import sign_file_path, verify_file_signature

    url = sign_file_path("projects/p1/dce/doc.pdf", org_id="org-test-1")
    qs = parse_qs(urlparse(url).query)
    assert qs["org"] == ["org-test-1"]
    assert verify_file_signature(
        "projects/p1/dce/doc.pdf", "org-test-1", qs["exp"][0], qs["sig"][0],
    )


def test_verify_rejects_expired_signature():
    from services.file_storage import sign_file_path, verify_file_signature

    url = sign_file_path("projects/p1/dce/doc.pdf", org_id="org-test-1", expires_in=-10)
    qs = parse_qs(urlparse(url).query)
    assert not verify_file_signature(
        "projects/p1/dce/doc.pdf", "org-test-1", qs["exp"][0], qs["sig"][0],
    )


def test_verify_rejects_tampered_inputs():
    from services.file_storage import sign_file_path, verify_file_signature

    url = sign_file_path("projects/p1/dce/doc.pdf", org_id="org-test-1")
    qs = parse_qs(urlparse(url).query)
    exp, sig = qs["exp"][0], qs["sig"][0]

    # sig altérée
    assert not verify_file_signature("projects/p1/dce/doc.pdf", "org-test-1", exp, sig[:-4] + "0000")
    # path substitué (signature d'un autre fichier)
    assert not verify_file_signature("projects/p1/dce/autre.pdf", "org-test-1", exp, sig)
    # org substituée
    assert not verify_file_signature("projects/p1/dce/doc.pdf", "org-evil", exp, sig)
    # exp falsifié (repoussé sans re-signer)
    assert not verify_file_signature("projects/p1/dce/doc.pdf", "org-test-1", str(int(exp) + 9999), sig)
    # exp non numérique
    assert not verify_file_signature("projects/p1/dce/doc.pdf", "org-test-1", "abc", sig)


# ─── Mint : GET /api/files/sign ──────────────────────────────────────────────

def test_sign_endpoint_returns_working_url(client, db_session, test_org, patched_uploads):
    _make_project(db_session, test_org.id, "proj-s1")
    _plant_file(patched_uploads, "projects/proj-s1/dce/doc.pdf", b"%PDF-1.4 mon CCTP")

    resp = client.get("/api/files/sign", params={"path": "/uploads/projects/proj-s1/dce/doc.pdf"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["url"].startswith("/api/files/view/")
    assert body["expires_in"] > 0

    # L'URL mintée sert le fichier telle quelle.
    resp2 = client.get(body["url"])
    assert resp2.status_code == 200, resp2.text
    assert b"mon CCTP" in resp2.content


def test_sign_endpoint_refuses_cross_org_path(client, db_session, test_org, patched_uploads):
    """Un utilisateur ne peut pas minter une URL pour le fichier d'une autre org."""
    from models.organization import Organization
    other = Organization(id="org-other", name="Autre BTP")
    db_session.add(other)
    db_session.commit()
    _make_project(db_session, "org-other", "proj-other")
    _plant_file(patched_uploads, "projects/proj-other/dce/secret.pdf")

    resp = client.get("/api/files/sign", params={"path": "/uploads/projects/proj-other/dce/secret.pdf"})
    assert resp.status_code in (403, 404)


# ─── Serve : GET /api/files/view exige la signature ──────────────────────────

def test_view_without_signature_403(client, db_session, test_org, patched_uploads):
    _make_project(db_session, test_org.id, "proj-s2")
    _plant_file(patched_uploads, "projects/proj-s2/dce/doc.pdf")

    resp = client.get("/api/files/view/projects/proj-s2/dce/doc.pdf")
    assert resp.status_code == 403


def test_view_with_expired_signature_403(client, db_session, test_org, patched_uploads):
    from services.file_storage import sign_file_path
    _make_project(db_session, test_org.id, "proj-s3")
    _plant_file(patched_uploads, "projects/proj-s3/dce/doc.pdf")

    url = sign_file_path("projects/proj-s3/dce/doc.pdf", org_id=test_org.id, expires_in=-10)
    resp = client.get(url)
    assert resp.status_code == 403


def test_view_with_tampered_signature_403(client, db_session, test_org, patched_uploads):
    from services.file_storage import sign_file_path
    _make_project(db_session, test_org.id, "proj-s4")
    _plant_file(patched_uploads, "projects/proj-s4/dce/doc.pdf")

    url = sign_file_path("projects/proj-s4/dce/doc.pdf", org_id=test_org.id)
    resp = client.get(url[:-4] + "0000")  # corrompt la fin de la sig
    assert resp.status_code == 403


def test_view_signature_of_other_file_403(client, db_session, test_org, patched_uploads):
    """Une signature valide pour doc_a.pdf ne donne pas accès à doc_b.pdf."""
    from services.file_storage import sign_file_path
    _make_project(db_session, test_org.id, "proj-s5")
    _plant_file(patched_uploads, "projects/proj-s5/dce/doc_a.pdf")
    _plant_file(patched_uploads, "projects/proj-s5/dce/doc_b.pdf", b"%PDF-1.4 secret B")

    url = sign_file_path("projects/proj-s5/dce/doc_a.pdf", org_id=test_org.id)
    swapped = url.replace("doc_a.pdf", "doc_b.pdf")
    resp = client.get(swapped)
    assert resp.status_code == 403
    assert b"secret B" not in resp.content


def test_view_cross_org_signature_403(client, db_session, test_org, patched_uploads):
    """Signature valide émise pour l'org B sur un fichier appartenant à l'org A
    (l'attaquant signe avec sa propre org) → refus : ownership vérifié en plus."""
    from models.organization import Organization
    from services.file_storage import sign_file_path

    org_b = Organization(id="org-B-sig", name="Attaquant SARL")
    db_session.add(org_b)
    db_session.commit()
    _make_project(db_session, test_org.id, "proj-s6")  # fichier de l'org A (test_org)
    _plant_file(patched_uploads, "projects/proj-s6/dce/doc.pdf", b"%PDF-1.4 secret A")

    url = sign_file_path("projects/proj-s6/dce/doc.pdf", org_id="org-B-sig")
    resp = client.get(url)
    assert resp.status_code in (403, 404)
    assert b"secret A" not in resp.content


def test_view_traversal_blocked_even_with_valid_signature(
    client, db_session, test_org, patched_uploads,
):
    from services.file_storage import sign_file_path
    _make_project(db_session, test_org.id, "proj-s7")

    evil = "projects/proj-s7/../../../etc/passwd"
    url = sign_file_path(evil, org_id=test_org.id)
    resp = client.get(url)
    assert resp.status_code in (403, 404)


def test_signed_url_ttl_is_about_15_minutes():
    from services.file_storage import SIGNED_URL_TTL, sign_file_path

    assert SIGNED_URL_TTL == 15 * 60
    url = sign_file_path("projects/p1/doc.pdf", org_id="org-test-1")
    exp = int(parse_qs(urlparse(url).query)["exp"][0])
    assert abs(exp - (time.time() + SIGNED_URL_TTL)) < 30
