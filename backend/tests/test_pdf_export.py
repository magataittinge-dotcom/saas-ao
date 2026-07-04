"""
Tests C13a — export PDF du mémoire (version dépôt).

Conversion DOCX → PDF via LibreOffice headless (soffice). Les tests de
conversion réelle sont sautés si soffice est absent de l'environnement
(garde d'environnement, pas un mock).
"""
import io
import shutil
import zipfile

import pytest

from models.memoire import MemoireTechnique
from models.project import Project

HAS_SOFFICE = bool(shutil.which("soffice") or shutil.which("libreoffice"))
needs_soffice = pytest.mark.skipif(not HAS_SOFFICE, reason="LibreOffice absent de l'environnement")

CONTENT = {
    "preambule": "Notre entreprise répond au marché de Gueux.",
    "partie_a": {"presentation": "BATI FACADE SARL, 20 ans d'expérience."},
    "partie_b": {},
    "partie_c": {"effectifs": "Six compagnons qualifiés.", "methodologie": "Méthode éprouvée."},
}

PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _full_docx() -> bytes:
    """Mémoire réel : page de garde complète + organigramme inséré."""
    from services.docx_exporter import build_memoire_docx
    from services.organigramme import generate_organigramme_svg, svg_to_png_bytes

    class _Cfg:
        gerant_nom = "Karim Omarov"
        gerant_titre = "Gérant"
        postes_cles = [
            {"poste": "Conducteur de travaux", "nom": "Ali Benali", "role": ""},
            {"poste": "Chef de chantier", "nom": "Marc Petit", "role": ""},
        ]

    organigramme = svg_to_png_bytes(generate_organigramme_svg(_Cfg()))
    return build_memoire_docx(
        CONTENT, "Groupe scolaire Gueux", "BATI FACADE SARL",
        organigramme_image=organigramme, logo_image=PNG_1PX,
        lot_name="Lot 2 — Ravalement de façades",
        maitre_ouvrage="Commune de Gueux",
        org_address="12 rue des Maçons, 14000 Caen", org_siret="38044894400237",
    )


# ─── Conversion ──────────────────────────────────────────────────────────────

@needs_soffice
def test_docx_to_pdf_preserves_cover_and_organigramme():
    import fitz
    from services.pdf_export import docx_to_pdf

    pdf = docx_to_pdf(_full_docx())
    assert pdf[:5] == b"%PDF-"

    doc = fitz.open(stream=pdf, filetype="pdf")
    try:
        assert doc.page_count >= 2
        # Page de garde préservée (titre projet + lot + MOA)
        page1 = doc[0].get_text()
        assert "GROUPE SCOLAIRE GUEUX" in page1.upper()
        assert "Lot 2" in page1
        assert "Commune de Gueux" in page1
        # Organigramme (image) préservé quelque part dans le document
        assert any(doc[i].get_images() for i in range(doc.page_count))
    finally:
        doc.close()


def test_soffice_absent_raises_clear_error(monkeypatch):
    import services.pdf_export as pdf_mod

    monkeypatch.setattr(pdf_mod, "_soffice_binary", lambda: None)
    with pytest.raises(pdf_mod.PdfConversionError) as exc:
        pdf_mod.docx_to_pdf(b"PK fake docx")
    assert "LibreOffice" in str(exc.value)


# ─── Endpoint export-pdf ─────────────────────────────────────────────────────

def _setup_memoire(db, org_id, pid="proj-pdf"):
    p = Project(id=pid, organization_id=org_id, name="Groupe scolaire Gueux",
                selected_lot_name="Lot 2 — Ravalement")
    db.add(p)
    db.add(MemoireTechnique(project_id=pid, content_json=dict(CONTENT)))
    db.commit()
    return p


@needs_soffice
def test_export_pdf_endpoint(client, db_session, test_org):
    _setup_memoire(db_session, test_org.id)

    resp = client.get("/api/projects/proj-pdf/memoire/export-pdf")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"


def test_export_pdf_503_when_soffice_missing(client, db_session, test_org, monkeypatch):
    import services.pdf_export as pdf_mod

    monkeypatch.setattr(pdf_mod, "_soffice_binary", lambda: None)
    _setup_memoire(db_session, test_org.id, pid="proj-pdf2")

    resp = client.get("/api/projects/proj-pdf2/memoire/export-pdf")
    assert resp.status_code == 503
    assert "PDF" in resp.json()["detail"]


# ─── ZIP : PDF version dépôt par défaut, fallback DOCX gracieux ──────────────

@needs_soffice
def test_zip_contains_memoire_pdf(client, db_session, test_org):
    _setup_memoire(db_session, test_org.id, pid="proj-pdf3")

    resp = client.get("/api/projects/proj-pdf3/export/zip")
    assert resp.status_code == 200, resp.text
    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        names = z.namelist()
        assert any(n.endswith("Memoire_technique.pdf") for n in names)
        # Le PDF remplace le DOCX comme version dépôt dans le ZIP
        assert not any(n.endswith("Memoire_technique.docx") for n in names)


def test_zip_falls_back_to_docx_when_conversion_fails(
    client, db_session, test_org, monkeypatch,
):
    import routers.export as export_mod
    from services.pdf_export import PdfConversionError

    def boom(_bytes):
        raise PdfConversionError("conversion indisponible")
    monkeypatch.setattr(export_mod, "docx_to_pdf", boom)

    _setup_memoire(db_session, test_org.id, pid="proj-pdf4")
    resp = client.get("/api/projects/proj-pdf4/export/zip")
    assert resp.status_code == 200, resp.text
    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        assert any(n.endswith("Memoire_technique.docx") for n in z.namelist())
