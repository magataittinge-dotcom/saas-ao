"""Revue de sécurité (10/11/2026) — `docx_numerote` ne fait jamais attendre un téléchargement de Word.

Le sommaire numéroté passe par LibreOffice et son verrou global : verrou essayé SANS attendre, conversion bornée
dans le temps ; LibreOffice occupé, absent, trop lent ou en échec → le Word non numéroté, tel quel. Les routes
Word et PDF du mémoire ont une limite de débit. Données inventées."""
import io
import time

import pytest

from services import libreoffice_isole, pdf_export
from services.docx_exporter import build_memoire_docx
from services.rate_limit import limiter

CONTENU = {"preambule": "Engagement fictif.", "partie_a": {"historique": "Texte fictif."},
           "partie_b": {}, "partie_c": {"methodologie": "Méthode fictive."}}


def _docx() -> bytes:
    return build_memoire_docx(CONTENU, "Chantier fictif", "ENTREPRISE TEST")


def test_verrou_pris_rend_le_word_tel_quel_sans_attendre(monkeypatch):
    monkeypatch.setattr(pdf_export, "soffice_available", lambda: True)
    octets = _docx()
    assert libreoffice_isole._VERROU_THREAD.acquire(timeout=5)     # une autre conversion tient la place
    try:
        debut = time.monotonic()
        assert pdf_export.docx_numerote(octets) == octets
        assert time.monotonic() - debut < 2.0
    finally:
        libreoffice_isole._VERROU_THREAD.release()


def test_libreoffice_absent_rend_le_word_tel_quel(monkeypatch):
    monkeypatch.setattr(pdf_export, "soffice_available", lambda: False)
    octets = _docx()
    assert pdf_export.docx_numerote(octets) == octets


def test_delai_depasse_rend_le_word_tel_quel_et_la_conversion_est_bornee(monkeypatch):
    vus = {}

    def lent(entree, extension=".docx", destination=None, *, delai=None, attente=None):
        vus.update(delai=delai, attente=attente)
        raise libreoffice_isole._erreur("delai")

    monkeypatch.setattr(pdf_export, "soffice_available", lambda: True)
    monkeypatch.setattr(pdf_export, "convertir_en_pdf", lent)
    octets = _docx()
    assert pdf_export.docx_numerote(octets) == octets
    assert vus["attente"] == 0
    assert vus["delai"] is not None and vus["delai"] <= 20


def test_echec_inattendu_rend_le_word_tel_quel(monkeypatch):
    def casse(*a, **k):
        raise RuntimeError("panne fictive")

    monkeypatch.setattr(pdf_export, "soffice_available", lambda: True)
    monkeypatch.setattr(pdf_export, "convertir_en_pdf", casse)
    octets = _docx()
    assert pdf_export.docx_numerote(octets) == octets


@pytest.fixture
def limite_active():
    prev = limiter.enabled
    limiter.enabled = True
    try:
        limiter.reset()
    except Exception:
        pass
    yield
    limiter.enabled = prev
    try:
        limiter.reset()
    except Exception:
        pass


@pytest.mark.parametrize("chemin", ["memoire/export-docx", "memoire/export-pdf"])
def test_word_et_pdf_du_memoire_ont_une_limite_de_debit(client, limite_active, chemin):
    codes = [client.get(f"/api/projects/projet-inexistant/{chemin}").status_code for _ in range(25)]
    assert 429 in codes, codes
