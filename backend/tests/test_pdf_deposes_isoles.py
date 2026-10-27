"""Bloc 6, point 7 — les PDF DÉPOSÉS lus hors du processus plafonné (détection des lots, ancrage des
sources, import d'un mémoire) passent par le processus pdfium (services/pdfium_processus.py) : plafond de
mémoire, délai, et jamais de relecture dans l'API d'un fichier qui vient de faire tomber le processus."""
from __future__ import annotations

import httpx
import pytest
from httpx import ASGITransport

from services import extraction_processus as ep
from services import pdfium_processus as pp
from tests.pdf_fabrique import ecrire_pdf, pdf_texte
from tests.test_pdf_bombe_pypdf import _pdf_bombe


@pytest.fixture(autouse=True)
def _processus(monkeypatch):
    """La suite tourne en direct (conftest) ; ici le processus est actif, un enfant neuf par test."""
    monkeypatch.setenv("SYNORIX_EXTRACTION_PROCESSUS", "1")
    for nom in ("SYNORIX_PDFIUM_PROCESSUS", "SYNORIX_PDFIUM_AS_MO"):
        monkeypatch.delenv(nom, raising=False)
    pp.arreter()
    yield
    pp.arreter()


@pytest.fixture
def appels(monkeypatch):
    """Les travaux envoyés au processus pdfium (nom de la fonction exécutée)."""
    vus = []
    reel = pp.executer

    def espion(fonction, *args, **kw):
        vus.append(fonction.__name__)
        return reel(fonction, *args, **kw)

    monkeypatch.setattr(pp, "executer", espion)
    return vus


def test_les_lots_lisent_le_pdf_dans_le_processus(tmp_path, appels, monkeypatch):
    import pypdf
    from services import lot_detector
    pdf = ecrire_pdf(tmp_path / "rc.pdf", ["LOT 01 GROS OEUVRE", "", "LOT 02 COUVERTURE"])
    monkeypatch.setattr(pypdf, "PdfReader", lambda *a, **k: pytest.fail("pypdf appelé dans l'API"))

    texte = lot_detector._extract_pdf_text_limited(pdf, max_pages=3)

    assert texte == "LOT 01 GROS OEUVRE\n\nLOT 02 COUVERTURE\n" or "LOT 02 COUVERTURE" in texte
    assert appels == ["lire_pages_pdf"]


def test_une_bombe_pdf_donne_un_texte_vide_sans_relecture_dans_l_api(tmp_path, appels, monkeypatch):
    """Avant : PDFium puis pypdf lisaient la bombe DANS l'API (jusqu'à +75 Mo pour pypdf, davantage
    pour PDFium). Maintenant le travail échoue dans le processus ; l'API répond « texte vide »."""
    import pypdf
    from services import lot_detector, pdf_lecture
    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "300")
    bombe = tmp_path / "bombe.pdf"
    _pdf_bombe(bombe)
    monkeypatch.setattr(pypdf, "PdfReader", lambda *a, **k: pytest.fail("repli pypdf dans l'API"))
    monkeypatch.setattr(pdf_lecture, "lire_pages", lambda *a, **k: pytest.fail("PDFium dans l'API"))

    assert lot_detector._extract_pdf_text_limited(bombe, max_pages=10) == ""
    assert appels == ["lire_pages_pdf"]


def test_l_ancrage_relit_le_pdf_dans_le_processus(tmp_path, appels, monkeypatch):
    from services.ai import excerpt_anchor
    from services import pdf_lecture
    pdf = ecrire_pdf(tmp_path / "ccap.pdf", ["Article premier : les paiements se font à 30 jours."])
    monkeypatch.setattr(pdf_lecture, "lire_pages", lambda *a, **k: pytest.fail("PDFium dans l'API"))
    excerpt_anchor._PAGES_CACHE.clear()

    pages = excerpt_anchor._pages_normalisees(str(pdf))

    assert pages and "paiements" in pages[0]
    assert appels == ["lire_pages_pdf"]


def test_ancrage_d_une_bombe_pas_de_page_pas_de_relecture_dans_l_api(tmp_path, appels, monkeypatch):
    from services.ai import excerpt_anchor
    from services import pdf_lecture
    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "300")
    bombe = tmp_path / "bombe.pdf"
    _pdf_bombe(bombe)
    monkeypatch.setattr(pdf_lecture, "lire_pages", lambda *a, **k: pytest.fail("PDFium dans l'API"))
    excerpt_anchor._PAGES_CACHE.clear()

    assert excerpt_anchor._pages_normalisees(str(bombe)) == []
    assert appels == ["lire_pages_pdf"]


def test_le_repli_pypdf_est_dans_la_fonction_du_processus(tmp_path, monkeypatch):
    """PDFium ne lit pas le fichier : pypdf lit les premières pages, dans ``lire_pages_pdf`` (donc dans le
    processus plafonné). Pour toutes les pages (ancrage), pas de repli : l'erreur remonte."""
    from services import pdf_lecture
    pdf = ecrire_pdf(tmp_path / "x.pdf", ["LOT 01 GROS OEUVRE"])

    def illisible(*a, **k):
        raise pdf_lecture.PdfIllisible(pdf_lecture.ERREUR_FORMAT)

    monkeypatch.setattr(pdf_lecture, "lire_pages", illisible)
    assert "LOT 01" in "".join(ep.lire_pages_pdf(str(pdf), 3))
    with pytest.raises(pdf_lecture.PdfIllisible):
        ep.lire_pages_pdf(str(pdf), None)


def _client_import(db_session, test_org, test_user):
    from database import get_db
    from main import app
    from routers.auth import get_auth_user
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_auth_user] = lambda: test_user
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


@pytest.mark.asyncio
async def test_import_d_un_pdf_passe_par_le_processus(db_session, test_org, test_user, appels, monkeypatch):
    from routers import memoire_config as mc
    contenu = pdf_texte(["Notre entreprise fictive intervient sur des chantiers de ravalement depuis vingt ans. " * 3])

    async def faux_extract(self, texte):
        return {"champ": "v"}

    monkeypatch.setattr(mc.MemoireImporter, "extract", faux_extract)
    async with _client_import(db_session, test_org, test_user) as c:
        r = await c.post("/api/memoire-config/import", files={"file": ("memoire.pdf", contenu, "application/pdf")})
    assert r.status_code == 200, r.text
    assert appels == ["extraire_fichier"]


@pytest.mark.asyncio
async def test_import_d_une_bombe_pdf_refus_en_clair(db_session, test_org, test_user, tmp_path, monkeypatch):
    monkeypatch.setenv("SYNORIX_PDFIUM_AS_MO", "300")
    bombe = tmp_path / "bombe.pdf"
    _pdf_bombe(bombe)
    async with _client_import(db_session, test_org, test_user) as c:
        r = await c.post("/api/memoire-config/import",
                         files={"file": ("memoire.pdf", bombe.read_bytes(), "application/pdf")})
    assert r.status_code == 422
    detail = r.json()["detail"].lower()
    assert "n'a pas pu être lu" in detail and "manquant" not in detail
