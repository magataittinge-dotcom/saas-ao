"""Extraction dans des processus séparés (nuit du 23/10).

PyMuPDF garde le GIL : en threads, 8 threads = 2 threads, et l'extraction de fond
affamait le reste du processus. Le pool de processus doit rendre exactement le
même texte que l'extraction classique, toutes les pages (pour l'ancrage), et faire
remonter l'avancement page par page.
"""
import os
import queue

import pytest

from services import extraction_processus as ep
from services.document_processor import DocumentProcessor
from tests.pdf_fabrique import ecrire_pdf, pdf_texte


def _pdf(chemin, nb=7):
    # une page vide en 3ᵉ position : les numéros de page doivent rester exacts
    ecrire_pdf(chemin, ["" if i == 2 else f"Page {i + 1} — prescriptions du lot 05, façade et ITE."
                        for i in range(nb)])


def test_le_pool_rend_le_meme_texte_et_toutes_les_pages(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", "2")
    chemin = tmp_path / "cctp.pdf"
    _pdf(chemin)
    attendu = DocumentProcessor().extract_ex(chemin.read_bytes(), "cctp.pdf")
    pool, file = ep.creer_pool()
    assert pool is not None, "le pool de processus doit démarrer ici"
    try:
        texte, pages, avert, toutes = pool.submit(ep.extraire_fichier, str(chemin), "cctp.pdf", "doc-1").result(timeout=120)
        pid_travail = pool.submit(os.getpid).result(timeout=60)
    finally:
        pool.shutdown(wait=True)
    assert (texte, pages, avert) == attendu
    assert len(toutes) == 7 and toutes[2] == ""
    assert pid_travail != os.getpid()          # bien un autre processus
    avancements = []
    while True:
        try:
            avancements.append(file.get(timeout=1))
        except queue.Empty:
            break
    assert avancements and avancements[-1] == ("doc-1", "cctp.pdf", 7, 7)


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


@pytest.mark.parametrize("valeur, attendu", [("0", 0), ("4", 4), ("n'importe quoi", 0)])
def test_reglage_du_nombre_de_processus(monkeypatch, valeur, attendu):
    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", valeur)
    assert ep.nombre_de_processus() == attendu


def test_desactive_par_defaut_reste_en_threads(monkeypatch):
    monkeypatch.delenv("SYNORIX_EXTRACTION_PROCESSUS", raising=False)
    assert ep.creer_pool() == (None, None)


def _pdf_octets(texte: str) -> bytes:
    return pdf_texte([texte])


def test_depot_zip_extrait_par_le_pool_quand_il_est_active(client, db_session, test_org, monkeypatch, tmp_path):
    import io
    import threading
    import zipfile
    import routers.projects as projects_mod
    import services.file_storage as fs_mod
    import services.ai.excerpt_anchor as ea
    from models.project import Project, ProjectDocument

    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", "2")
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    # le processus principal ne doit RIEN extraire lui-même : tout passe par le pool
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
    assert len(ea._PAGES_CACHE) == 2   # pages gardées pour l'ancrage, via le pool
