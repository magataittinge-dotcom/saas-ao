"""Extraction dans le processus pdfium (T9 ; nuit du 23/10 pour l'origine).

PDFium n'est pas thread-safe et un PDF piégé peut le faire monter de plusieurs Go : l'extraction
des pièces déposées passe PAR DÉFAUT dans le processus pdfium (services/pdfium_processus.py),
plafonné en mémoire et avec un délai. Elle doit rendre exactement le même texte que
l'extraction classique, toutes les pages (pour l'ancrage), faire remonter l'avancement page par
page, et refuser proprement une pièce piégée sans faire tomber l'API.
SYNORIX_EXTRACTION_PROCESSUS=0 revient aux threads.
"""
import os

import pytest

from services import extraction_processus as ep
from services import pdfium_processus as pp
from services.document_processor import DocumentProcessor
from tests.pdf_fabrique import ecrire_pdf, pdf_texte


def _pdf(chemin, nb=7):
    # une page vide en 3ᵉ position : les numéros de page doivent rester exacts
    ecrire_pdf(chemin, ["" if i == 2 else f"Page {i + 1} — prescriptions du lot 05, façade et ITE."
                        for i in range(nb)])


@pytest.fixture(autouse=True)
def _processus_propres(monkeypatch):
    """La suite tourne en threads (conftest) ; ici on active le processus, repartant à neuf."""
    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", "1")
    for nom in ("SYNORIX_PDFIUM_PROCESSUS", "SYNORIX_PDFIUM_AS_MO"):
        monkeypatch.delenv(nom, raising=False)
    pp.arreter()
    yield
    pp.arreter()


def test_le_processus_rend_le_meme_texte_et_toutes_les_pages(tmp_path):
    chemin = tmp_path / "cctp.pdf"
    _pdf(chemin)
    attendu = DocumentProcessor().extract_ex(chemin.read_bytes(), "cctp.pdf")
    avancements = []
    texte, pages, avert, toutes = ep.extraire_en_processus(
        str(chemin), "cctp.pdf", "doc-1", on_page=lambda fait, total: avancements.append((fait, total)))
    assert (texte, pages, avert) == attendu
    assert len(toutes) == 7 and toutes[2] == ""
    assert pp.executer(os.getpid, delai_s=60) != os.getpid()     # bien un autre processus
    assert avancements and avancements[-1] == (7, 7)             # avancement page par page


def test_le_travailleur_ouvre_la_piece_par_son_chemin(tmp_path, monkeypatch):
    """Plus de lecture du fichier entier en mémoire : un gros PDF est ouvert par PDFium."""
    import builtins
    from pathlib import Path
    from services import pdf_lecture
    chemin = tmp_path / "cctp.pdf"
    _pdf(chemin)
    monkeypatch.setattr(pdf_lecture, "SEUIL_LECTURE_EN_UNE_FOIS", 0)   # « gros » fichier
    vrai_open = builtins.open

    def ouvrir(fichier, *args, **kwargs):
        if isinstance(fichier, (str, os.PathLike)) and Path(fichier) == chemin:
            raise AssertionError("pièce lue par Python")
        return vrai_open(fichier, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", ouvrir)
    texte, pages, avert, toutes = ep.extraire_fichier(str(chemin), "cctp.pdf", "doc-1")
    assert pages == 7 and len(toutes) == 7 and toutes[2] == "" and avert is None
    assert "Page 1 — prescriptions" in texte


@pytest.mark.parametrize("valeur, attendu", [("0", False), ("1", True), ("4", True), ("n'importe quoi", True)])
def test_reglage_du_mode_processus(monkeypatch, valeur, attendu):
    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", valeur)
    assert ep.actif() is attendu


def test_actif_par_defaut(monkeypatch):
    monkeypatch.delenv("SYNORIX_EXTRACTION_PROCESSUS", raising=False)
    assert ep.actif() is True


def test_delai_proportionnel_a_la_taille_et_plafonne(tmp_path):
    petit = tmp_path / "a.pdf"
    petit.write_bytes(b"x" * 10)
    assert ep.delai_extraction_s(str(petit)) == pytest.approx(ep.DELAI_BASE_S, abs=0.01)
    assert ep.DELAI_BASE_S <= ep.delai_extraction_s(str(tmp_path / "absent.pdf")) <= ep.DELAI_MAX_S


def _pdf_octets(texte: str) -> bytes:
    return pdf_texte([texte])


def test_depot_zip_extrait_par_le_processus_par_defaut(client, db_session, test_org, monkeypatch, tmp_path):
    import io
    import threading
    import zipfile
    import routers.projects as projects_mod
    import services.file_storage as fs_mod
    import services.ai.excerpt_anchor as ea
    from models.project import Project, ProjectDocument

    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    # le processus principal ne doit RIEN extraire lui-même : tout passe par le processus pdfium
    def interdit(*a, **k):
        raise AssertionError("extraction faite dans le processus principal")
    monkeypatch.setattr(projects_mod.processor, "extract_ex", interdit)
    ea._PAGES_CACHE.clear()

    db_session.add(Project(id="proj-pool", organization_id=test_org.id, name="X"))
    db_session.commit()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("RC.pdf", _pdf_octets("Règlement de la consultation — article 1"))
        zf.writestr("CCTP lot 05.pdf", _pdf_octets("Isolation thermique par l'extérieur"))
    resp = client.post("/api/projects/proj-pool/documents",
                       files={"file": ("dce.zip", buf.getvalue(), "application/zip")})
    assert resp.status_code == 200, resp.text
    for t in threading.enumerate():
        if t.name.startswith("synorix-extract-"):
            t.join(timeout=120)
            assert not t.is_alive(), t.name

    db_session.expire_all()
    textes = {d.file_name: d.extracted_text for d in db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == "proj-pool").all()}
    assert "article 1" in textes["RC.pdf"]
    assert "extérieur" in textes["CCTP lot 05.pdf"]
    assert len(ea._PAGES_CACHE) == 2   # pages gardées pour l'ancrage, via le processus


def test_depot_avec_extraction_en_threads_si_reglage_a_zero(client, db_session, test_org, monkeypatch, tmp_path):
    import io, threading, zipfile
    import routers.projects as projects_mod
    import services.file_storage as fs_mod
    from models.project import Project, ProjectDocument

    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", "0")
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    db_session.add(Project(id="proj-thr", organization_id=test_org.id, name="X"))
    db_session.commit()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("RC.pdf", _pdf_octets("Règlement de la consultation — article 7"))
    resp = client.post("/api/projects/proj-thr/documents",
                       files={"file": ("dce.zip", buf.getvalue(), "application/zip")})
    assert resp.status_code == 200, resp.text
    for th in threading.enumerate():
        if th.name.startswith("synorix-extract-"):
            th.join(timeout=120)
    db_session.expire_all()
    doc = db_session.query(ProjectDocument).filter(ProjectDocument.project_id == "proj-thr").one()
    assert "article 7" in doc.extracted_text
    assert pp.etat()["enfants"] == []          # aucun processus pdfium n'a été lancé


def test_piece_piegee_refusee_proprement_et_nommee(client, db_session, test_org, monkeypatch, tmp_path):
    """PDF de ~300 Ko dont le flux se décompresse en 300 Mo : au-delà du plafond (200 Mo ici),
    la pièce devient non lisible avec un avertissement qui la nomme, les autres pièces et
    l'API continuent."""
    import io, threading, zipfile
    import routers.projects as projects_mod
    import services.file_storage as fs_mod
    from models.project import Project, ProjectDocument
    from tests.pdf_fabrique import pdf_piege

    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "200")
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    db_session.add(Project(id="proj-piege", organization_id=test_org.id, name="X"))
    db_session.commit()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("CCTP lot 01 piege.pdf", pdf_piege(300))
        zf.writestr("RC.pdf", _pdf_octets("Règlement de la consultation — article 3"))
    resp = client.post("/api/projects/proj-piege/documents",
                       files={"file": ("dce.zip", buf.getvalue(), "application/zip")})
    assert resp.status_code == 200, resp.text
    for th in threading.enumerate():
        if th.name.startswith("synorix-extract-"):
            th.join(timeout=180)
            assert not th.is_alive(), th.name
    db_session.expire_all()
    docs = {d.file_name: d for d in db_session.query(ProjectDocument).filter(
        ProjectDocument.project_id == "proj-piege").all()}
    piege = docs["CCTP lot 01 piege.pdf"]
    assert not piege.extracted_text
    assert "CCTP lot 01 piege.pdf" in (piege.extraction_warning or "")
    assert "article 3" in docs["RC.pdf"].extracted_text


def test_une_bombe_pdf_arretee_par_le_plafond_ressort_memoire(tmp_path, monkeypatch):
    """PDF de 400 Ko dont le flux se décompresse en 400 Mo, plafond de 300 Mo : « memoire »
    (avant : « plantage », l'enfant meurt par SIGABRT sans MemoryError)."""
    from tests.test_pdf_bombe_pypdf import _pdf_bombe
    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "300")
    bombe = tmp_path / "bombe.pdf"
    _pdf_bombe(bombe)
    with pytest.raises(pp.TravailPdfiumEchoue) as e:
        ep.extraire_en_processus(str(bombe), "bombe.pdf", "d")
    assert e.value.raison == "memoire", e.value
