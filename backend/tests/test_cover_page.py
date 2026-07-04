"""
Tests C8b — page de garde personnalisée du DOCX.

  • Logo org + nom du marché + lot + MOA + date + coordonnées entreprise.
  • Sans logo → page de garde texte propre (jamais de placeholder cassé).
  • Upload du logo → stocké au coffre-fort catégorie references_moyens
    + organizations.logo_url.
"""
import io
import zipfile

import pytest

from models.document import Document as VaultDocument


# PNG 1×1 valide (minimal)
PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

CONTENT = {"preambule": "P.", "partie_a": {}, "partie_b": {}, "partie_c": {}}

COVER_KW = dict(
    lot_name="Lot 2 — Ravalement de façades",
    maitre_ouvrage="Commune de Gueux",
    org_address="12 rue des Maçons, 14000 Caen",
    org_siret="38044894400237",
)


def _docx_text(docx_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        return z.read("word/document.xml").decode("utf-8")


def _media_count(docx_bytes: bytes) -> int:
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        return len([n for n in z.namelist() if n.startswith("word/media/")])


def test_cover_with_logo_and_details():
    from services.docx_exporter import build_memoire_docx

    out = build_memoire_docx(
        CONTENT, "Groupe scolaire Gueux", "BATI FACADE SARL",
        logo_image=PNG_1PX, **COVER_KW,
    )
    xml = _docx_text(out)
    assert "Groupe scolaire Gueux".upper() in xml.upper()
    assert "Lot 2" in xml
    assert "Commune de Gueux" in xml
    assert "12 rue des Maçons" in xml
    assert "380 448 944 00237" in xml or "38044894400237" in xml
    # Le logo est bien embarqué
    base = build_memoire_docx(CONTENT, "Groupe scolaire Gueux", "BATI FACADE SARL", **COVER_KW)
    assert _media_count(out) == _media_count(base) + 1


def test_cover_without_logo_is_clean_text(client):
    from services.docx_exporter import build_memoire_docx

    out = build_memoire_docx(
        CONTENT, "Groupe scolaire Gueux", "BATI FACADE SARL",
        logo_image=None, **COVER_KW,
    )
    assert out[:2] == b"PK"
    xml = _docx_text(out)
    assert "BATI FACADE SARL" in xml
    assert "Commune de Gueux" in xml


def test_cover_backward_compatible_minimal_call():
    """Les appels existants (sans nouveaux kwargs) restent valides."""
    from services.docx_exporter import build_memoire_docx

    out = build_memoire_docx(CONTENT, "Projet X", "Entreprise Y")
    assert out[:2] == b"PK"


# ─── Upload du logo ──────────────────────────────────────────────────────────

@pytest.fixture
def patched_storage(tmp_path, monkeypatch):
    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def test_upload_logo_stores_in_vault_references_moyens(
    client, db_session, test_org, patched_storage,
):
    resp = client.post(
        "/api/organizations/me/logo",
        files={"file": ("logo_bati_facade.png", PNG_1PX, "image/png")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["logo_url"]

    db_session.refresh(test_org)
    assert test_org.logo_url == body["logo_url"]

    doc = db_session.query(VaultDocument).filter(
        VaultDocument.organization_id == test_org.id,
    ).one()
    assert doc.category == "references_moyens"
    assert doc.file_name == "logo_bati_facade.png"


def test_upload_logo_rejects_non_image(client, db_session, test_org, patched_storage):
    resp = client.post(
        "/api/organizations/me/logo",
        files={"file": ("virus.exe", b"MZ\x00\x00", "application/octet-stream")},
    )
    assert resp.status_code == 400
    db_session.refresh(test_org)
    assert test_org.logo_url is None
