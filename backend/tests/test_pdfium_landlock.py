"""L'enfant PDFium sous seccomp + Landlock : il lit des fichiers hostiles, mais ne lit ni `.env`, ni un dossier
hors de la liste blanche, n'écrit nulle part et ne se connecte à aucun socket (base, Redis).

Limite documentée (services/pdfium_processus.py) : les dossiers de pièces autorisés couvrent toutes les
organisations, l'enfant étant partagé. Sautés sans Landlock dans le noyau."""
from __future__ import annotations

import socket
from pathlib import Path

import pytest

from services import extraction_processus as ep
from services import landlock
from services import pdfium_processus as pp
from tests import pdfium_taches as t
from tests.pdf_fabrique import ecrire_pdf

needs_landlock = pytest.mark.skipif(landlock.abi_version() < 1, reason="Landlock absent de ce noyau")
TESTS = str(Path(__file__).resolve().parent)


@pytest.fixture
def decor(tmp_path, monkeypatch):
    for nom in ("SYNORIX_PDFIUM_PROCESSUS", "SYNORIX_PDFIUM_AS_MO"):
        monkeypatch.delenv(nom, raising=False)
    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / ".env").write_text("CLE=valeur-factice\n")
    (tmp_path / "pieces").mkdir()
    (tmp_path / "autre").mkdir()
    (tmp_path / "autre" / "projet.pdf").write_bytes(b"%PDF-1.4 hors liste blanche")
    monkeypatch.setenv("SYNORIX_PDFIUM_LECTURE_DIRS", f"{tmp_path / 'pieces'}:{TESTS}")   # TESTS : les tâches de test
    pp.arreter()
    yield tmp_path
    pp.arreter()


@needs_landlock
def test_temoin_sans_protection_l_enfant_lit_env_et_se_connecte(decor, monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_LANDLOCK", "aucun")
    srv_chemin = str(decor / "base.sock")
    srv = socket.socket(socket.AF_UNIX)
    srv.bind(srv_chemin)
    srv.listen(1)
    try:
        assert pp.executer(t.lire_fichier, str(decor / "backend" / ".env"), delai_s=60) == "LU"
        assert pp.executer(t.ecrire_fichier, str(decor / "autre" / "nouveau"), delai_s=60) == "ECRIT"
        assert pp.executer(t.connecter_unix, srv_chemin, delai_s=60) == "connecte"
    finally:
        srv.close()


@needs_landlock
def test_l_enfant_ne_lit_que_les_pieces_et_n_ecrit_nulle_part(decor, monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_LANDLOCK", "auto")
    piece = decor / "pieces" / "cctp.pdf"
    ecrire_pdf(piece, ["Prescriptions du lot 05, façade et ITE."])
    assert pp.executer(t.lire_fichier, str(piece), delai_s=60) == "LU"
    assert pp.executer(t.lire_fichier, str(decor / "backend" / ".env"), delai_s=60) == "refuse"
    assert pp.executer(t.lire_fichier, str(decor / "autre" / "projet.pdf"), delai_s=60) == "refuse"
    assert pp.executer(t.ecrire_fichier, str(decor / "pieces" / "nouveau"), delai_s=60) == "refuse"
    assert pp.executer(t.ecrire_fichier, str(decor / "autre" / "nouveau"), delai_s=60) == "refuse"
    assert not (decor / "pieces" / "nouveau").exists()


@needs_landlock
def test_l_enfant_ne_se_connecte_a_aucun_socket_unix(decor, monkeypatch):
    """Landlock ne filtre pas connect() sur un socket Unix à chemin (avant l'ABI 9) : c'est le seccomp qui le fait."""
    monkeypatch.setenv("SYNORIX_PDFIUM_LANDLOCK", "auto")
    srv_chemin = str(decor / "base.sock")
    srv = socket.socket(socket.AF_UNIX)
    srv.bind(srv_chemin)
    srv.listen(1)
    srv.setblocking(False)
    try:
        assert pp.executer(t.connecter_unix, srv_chemin, delai_s=60) == "bloque PermissionError"
        with pytest.raises(BlockingIOError):
            srv.accept()
    finally:
        srv.close()


@needs_landlock
def test_l_extraction_reste_identique_sous_protection(decor, monkeypatch):
    piece = decor / "pieces" / "ccap.pdf"
    ecrire_pdf(piece, ["Article 1 — paiement à 30 jours.", "", "Article 2 — retenue de garantie de 5 %."])
    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", "1")
    resultats = {}
    for mode in ("aucun", "auto"):
        monkeypatch.setenv("SYNORIX_PDFIUM_LANDLOCK", mode)
        pp.arreter()
        texte, pages, avert, pages_toutes = ep.extraire_en_processus(str(piece), "ccap.pdf", "d")
        resultats[mode] = (texte, pages, avert, pages_toutes)
    assert resultats["aucun"] == resultats["auto"]
    assert "paiement" in resultats["auto"][0]


@needs_landlock
def test_une_piece_hors_liste_blanche_n_est_pas_lue(decor, monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_LANDLOCK", "auto")
    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", "1")
    ecrire_pdf(decor / "autre" / "dehors.pdf", ["Texte d'un dossier non autorisé."])
    texte, pages, avertissement, _ = ep.extraire_en_processus(
        str(decor / "autre" / "dehors.pdf"), "dehors.pdf", "d")
    assert "dossier non autorisé" not in texte           # la pièce n'a pas été lue (texte vide + avertissement)
    assert avertissement


@needs_landlock
def test_le_niveau_de_l_enfant_est_journalise(decor, monkeypatch, caplog):
    monkeypatch.setenv("SYNORIX_PDFIUM_LANDLOCK", "auto")
    with caplog.at_level("INFO", logger="services.pdfium_processus"):
        pp.executer(t.pid, delai_s=60)
    journal = " ".join(r.getMessage() for r in caplog.records)
    assert "seccomp+landlock" in journal and str(decor) not in journal


@needs_landlock
def test_rendu_ancres_pdf_et_ancres_tableur_fonctionnent_sous_protection(decor, monkeypatch):
    """Les trois autres travaux de l'enfant (aperçu WebP par Pillow, ancres PDF, ancres de tableur par openpyxl)
    chargent leurs bibliothèques paresseusement APRÈS la restriction : ils doivent toujours aboutir, identiques."""
    import openpyxl
    from services import pdf_rendu, pdf_ancre, tableur_ancre

    pdf = decor / "pieces" / "ccap.pdf"
    ecrire_pdf(pdf, ["Article premier : les paiements se font à 30 jours."])
    xlsx = decor / "pieces" / "dpgf.xlsx"
    wb = openpyxl.Workbook()
    wb.active.append(["Poste", "Désignation", "Quantité"])
    wb.active.append(["1.1", "Ravalement de façade en enduit", 120])
    wb.save(xlsx)
    demandes_pdf = [{"id": "e1", "page": 1, "extrait": "les paiements se font à 30 jours"}]
    demandes_xlsx = [{"id": "e2", "extrait": "Ravalement de façade en enduit"}]

    sorties = {}
    for mode in ("aucun", "auto"):
        monkeypatch.setenv("SYNORIX_PDFIUM_LANDLOCK", mode)
        pp.arreter()
        webp = pdf_rendu.rendre_page_webp(str(pdf), 0, 400)
        ancres_pdf = pp.executer(pdf_ancre.calculer_ancres, str(pdf), "d1", demandes_pdf, delai_s=60)
        ancres_xlsx = pp.executer(tableur_ancre.calculer_ancres, str(xlsx), "d2", demandes_xlsx, delai_s=60)
        sorties[mode] = (webp[:4], len(webp) > 100, ancres_pdf, ancres_xlsx)
    assert sorties["auto"][0] == b"RIFF" and sorties["auto"][1]
    assert sorties["aucun"] == sorties["auto"]
    assert sorties["auto"][2]["e1"] is not None and sorties["auto"][3]["e2"] is not None
