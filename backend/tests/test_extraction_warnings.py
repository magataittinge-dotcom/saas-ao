"""
Vieux formats + documents illisibles (audit risques #1-2 + écart #3) —
plus AUCUN échec d'extraction silencieux :

  • .xls ancien (BIFF) : lu via xlrd (openpyxl ne lit que le xlsx) ;
  • PDF sans couche texte (scanné) : warning explicite PAR FICHIER ;
  • fichier corrompu / format non pris en charge (.doc) : warning ;
  • le warning SURVIT à la phase différée (thread synorix-extract) et
    remonte à l'UI via extraction-status + GET documents.
"""
import io
import threading
import zipfile

import pytest

from models.project import Project, ProjectDocument


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.projects as projects_mod
    monkeypatch.setattr(projects_mod.limiter, "enabled", False, raising=False)


def _biff_xls_bytes() -> bytes:
    import xlwt
    wb = xlwt.Workbook()
    ws = wb.add_sheet("DPGF")
    ws.write(0, 0, "Lot 01")
    ws.write(0, 1, "Démolition Gros œuvre")
    ws.write(1, 0, "Prix unitaire HT")
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _scanned_pdf_bytes(pages: int = 2) -> bytes:
    """PDF sans couche texte (pages images/vides) — le cas « CCTP scanné »."""
    import fitz
    doc = fitz.open()
    for _ in range(pages):
        doc.new_page()
    return doc.tobytes()


def _text_pdf_bytes() -> bytes:
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "Règlement de consultation — article 1 : le candidat fournit un Kbis. " * 4,
    )
    return doc.tobytes()


# ─── Processeur : extract_ex → (texte, pages, warning) ───────────────────────

def test_xls_biff_extracted_via_xlrd():
    from services.document_processor import DocumentProcessor
    text, _pages, warning = DocumentProcessor().extract_ex(
        _biff_xls_bytes(), "EQ2402_DPGF lots archi-ind A.xls")
    assert "Démolition Gros œuvre" in text
    assert warning is None


def test_scanned_pdf_gets_explicit_warning():
    from services.document_processor import DocumentProcessor
    text, pages, warning = DocumentProcessor().extract_ex(
        _scanned_pdf_bytes(), "CCTP_scanne.pdf")
    assert pages == 2
    assert warning is not None
    assert "scanné" in warning
    assert "non extraites" in warning


def test_text_pdf_no_warning():
    from services.document_processor import DocumentProcessor
    text, pages, warning = DocumentProcessor().extract_ex(
        _text_pdf_bytes(), "RC.pdf")
    assert len(text) > 100
    assert warning is None


def test_corrupt_xlsx_gets_explicit_warning():
    from services.document_processor import DocumentProcessor
    text, _pages, warning = DocumentProcessor().extract_ex(
        b"ceci n'est pas un classeur", "dpgf.xlsx")
    assert text == ""
    assert warning is not None
    assert "non lisible" in warning.lower()


def test_doc_format_gets_explicit_warning():
    """.doc est accepté au ZIP mais jamais extrait — désormais signalé."""
    from services.document_processor import DocumentProcessor
    text, _pages, warning = DocumentProcessor().extract_ex(
        b"\xd0\xcf\x11\xe0old word", "CCAP.doc")
    assert text == ""
    assert warning is not None
    assert ".doc" in warning


def test_extract_legacy_contract_unchanged():
    """extract() garde son contrat (texte, pages) — rétro-compatibilité."""
    from services.document_processor import DocumentProcessor
    text, pages = DocumentProcessor().extract(_text_pdf_bytes(), "RC.pdf")
    assert len(text) > 100
    assert pages == 1


# ─── Intégration : le warning survit à la phase différée et remonte à l'UI ───

def test_single_upload_scanned_pdf_warning_surfaces(
    client, db_session, test_org, monkeypatch, tmp_path,
):
    import routers.projects as projects_mod
    import services.file_storage as fs_mod
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)

    db_session.add(Project(id="proj-warn1", organization_id=test_org.id, name="X"))
    db_session.commit()

    resp = client.post(
        "/api/projects/proj-warn1/documents",
        files={"file": ("CCTP_scanne.pdf", _scanned_pdf_bytes(), "application/pdf")},
    )
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    doc = db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == "proj-warn1").first()
    assert doc.extraction_warning is not None
    assert "scanné" in doc.extraction_warning

    st = client.get("/api/projects/proj-warn1/extraction-status").json()
    assert st["warnings"] == [
        {"file_name": "CCTP_scanne.pdf", "warning": doc.extraction_warning},
    ]
    docs = client.get("/api/projects/proj-warn1/documents").json()
    assert docs[0]["extraction_warning"] == doc.extraction_warning


def test_zip_deferred_extraction_warning_surfaces(
    client, db_session, test_org, monkeypatch, tmp_path,
):
    """Le cas EXACT de l'audit : un fichier illisible dans le ZIP n'était
    que loggé serveur pendant la phase différée — il remonte désormais."""
    import routers.projects as projects_mod
    import services.file_storage as fs_mod
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)

    db_session.add(Project(id="proj-warn2", organization_id=test_org.id, name="X"))
    db_session.commit()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("RC.pdf", _text_pdf_bytes())
        zf.writestr("CCTP_scanne.pdf", _scanned_pdf_bytes())
    resp = client.post(
        "/api/projects/proj-warn2/documents",
        files={"file": ("dce.zip", buf.getvalue(), "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    for t in threading.enumerate():
        if t.name.startswith("synorix-extract-"):
            t.join(timeout=30)

    db_session.expire_all()
    warned = db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == "proj-warn2",
        ProjectDocument.extraction_warning.isnot(None),
    ).all()
    assert [d.file_name for d in warned] == ["CCTP_scanne.pdf"]

    st = client.get("/api/projects/proj-warn2/extraction-status").json()
    assert [w["file_name"] for w in st["warnings"]] == ["CCTP_scanne.pdf"]
