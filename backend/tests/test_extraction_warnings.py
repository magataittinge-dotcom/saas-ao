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
    from tests.pdf_fabrique import pdf_texte
    return pdf_texte([""] * pages)


def _text_pdf_bytes() -> bytes:
    from tests.pdf_fabrique import pdf_texte
    return pdf_texte(["Règlement de consultation — article 1 : le candidat fournit un Kbis. " * 4])


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


# ─── PDF lus par PDFium (plan H, T6) : aucun échec silencieux ───────────────

_TROIS_PAGES = [
    "Article 1 — Objet : restructuration et extension d'un groupe scolaire.",
    "Article 2 — Délai d'exécution : douze mois à compter de l'ordre de service.",
    "Article 3 — Retenue de garantie : cinq pour cent du montant du marché.",
]


def test_pdf_tronque_non_lisible():
    """Plan H §6 n° 1 : PyMuPDF rendait 0 page, un texte vide et aucun avertissement."""
    from services.document_processor import DocumentProcessor
    octets = _text_pdf_bytes()
    text, pages, warning = DocumentProcessor().extract_ex(octets[: len(octets) // 2], "CCAP.pdf")
    assert (text, pages) == ("", None)
    assert "non lisible" in warning.lower()


def test_pdf_sans_page_non_lisible():
    import pypdf
    from services.document_processor import DocumentProcessor
    sortie = io.BytesIO()
    pypdf.PdfWriter().write(sortie)
    text, pages, warning = DocumentProcessor().extract_ex(sortie.getvalue(), "RC.pdf")
    assert (text, pages) == ("", None)
    assert "non lisible" in warning.lower()


def test_pdf_protege_par_mot_de_passe():
    import pypdf
    from services.document_processor import DocumentProcessor
    ecrivain = pypdf.PdfWriter(clone_from=io.BytesIO(_text_pdf_bytes()))
    ecrivain.encrypt(user_password="secret", owner_password="proprietaire", algorithm="AES-128")
    sortie = io.BytesIO()
    ecrivain.write(sortie)
    text, pages, warning = DocumentProcessor().extract_ex(sortie.getvalue(), "AE.pdf")
    assert (text, pages) == ("", None)
    assert warning.startswith("PDF protégé par un mot de passe")


def test_page_illisible_nommee_et_les_autres_extraites():
    from services.document_processor import DocumentProcessor
    from tests.pdf_fabrique import pdf_avec_page_illisible
    text, pages, warning = DocumentProcessor().extract_ex(
        pdf_avec_page_illisible(_TROIS_PAGES, 2), "CCTP.pdf")
    assert pages == 3
    assert "Article 1" in text and "Article 3" in text and "Article 2" not in text
    assert warning == "Page 2 illisible — le texte des autres pages est extrait"


def test_libelle_des_pages_illisibles():
    from services.document_processor import _warn_pages_illisibles
    suite = " — le texte des autres pages est extrait"
    assert _warn_pages_illisibles((3, 7, 12)) == "Pages 3, 7 et 12 illisibles" + suite
    assert _warn_pages_illisibles(tuple(range(1, 13))) == \
        "Pages 1, 2, 3, 4, 5, 6, 7, 8… illisibles (12 pages)" + suite


def test_gros_pdf_extrait_par_le_chemin_sans_etre_charge(tmp_path, monkeypatch):
    import builtins
    import os
    from pathlib import Path
    from services import pdf_lecture
    from services.document_processor import DocumentProcessor
    from tests.pdf_fabrique import pdf_texte
    chemin = tmp_path / "CCTP.pdf"
    chemin.write_bytes(pdf_texte(_TROIS_PAGES))
    attendu = DocumentProcessor().extract_ex(chemin.read_bytes(), "CCTP.pdf")
    assert DocumentProcessor().extract_ex(chemin, "CCTP.pdf") == attendu
    vrai_open = builtins.open

    def ouvrir(fichier, *args, **kwargs):
        if isinstance(fichier, (str, os.PathLike)) and Path(fichier) == chemin:
            raise AssertionError("pièce lue par Python")
        return vrai_open(fichier, *args, **kwargs)

    monkeypatch.setattr(pdf_lecture, "SEUIL_LECTURE_EN_UNE_FOIS", 0)   # « gros » fichier
    monkeypatch.setattr(builtins, "open", ouvrir)
    monkeypatch.setattr(Path, "read_bytes", lambda self: pytest.fail("pièce chargée en mémoire"))
    vues = []
    assert DocumentProcessor().extract_ex(
        chemin, "CCTP.pdf", on_page=lambda fait, total: vues.append((fait, total))) == attendu
    assert vues == [(1, 3), (2, 3), (3, 3)]


def test_xlsx_renomme_en_xls_lu_par_le_chemin(tmp_path):
    """Repli des .xls qui sont des .xlsx renommés : openpyxl refuse un NOM en .xls."""
    import openpyxl
    from services.document_processor import DocumentProcessor
    classeur = openpyxl.Workbook()
    classeur.active.append(["Lot 01", "Démolition Gros œuvre"])
    chemin = tmp_path / "DPGF.xls"
    classeur.save(chemin)
    text, _pages, warning = DocumentProcessor().extract_ex(chemin, "DPGF.xls")
    assert "Démolition Gros œuvre" in text and warning is None


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
            assert not t.is_alive(), f"thread d'extraction non terminé: {t.name}"

    db_session.expire_all()
    warned = db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == "proj-warn2",
        ProjectDocument.extraction_warning.isnot(None),
    ).all()
    assert [d.file_name for d in warned] == ["CCTP_scanne.pdf"]

    st = client.get("/api/projects/proj-warn2/extraction-status").json()
    assert [w["file_name"] for w in st["warnings"]] == ["CCTP_scanne.pdf"]
