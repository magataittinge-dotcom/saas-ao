"""S3.6 — migration PyPDF2 (EOL) → pypdf (maintenu).

PyPDF2 3.0.1 ne reçoit plus de correctifs de sécurité alors que l'app parse des
PDF issus de DCE potentiellement hostiles. On migre vers pypdf (API identique)
et on prouve que le chemin d'extraction de secours (quand le lecteur PDFium échoue)
fonctionne toujours — via pypdf, PyPDF2 étant désinstallé.
"""
import re
from pathlib import Path

import pytest


def test_codebase_no_longer_imports_pypdf2():
    """Aucun `import PyPDF2` ne doit subsister (dépendance EOL)."""
    root = Path(__file__).parent.parent
    offenders = []
    for sub in ("services", "routers"):
        for p in (root / sub).rglob("*.py"):
            txt = p.read_text(encoding="utf-8")
            if re.search(r"\bimport PyPDF2\b|\bfrom PyPDF2\b", txt):
                offenders.append(str(p.relative_to(root)))
    assert offenders == [], f"PyPDF2 encore importé : {offenders}"


def test_pdf_fallback_extracts_text_via_pypdf(tmp_path, monkeypatch):
    """Le fallback d'extraction (lecteur PDFium en échec) lit le PDF via pypdf."""
    import pypdf
    from services import lot_detector, pdf_lecture
    from tests.pdf_fabrique import ecrire_pdf

    # PDF texte minimal (fabrique de tests, sans PyMuPDF).
    pdf = ecrire_pdf(tmp_path / "lot.pdf", ["LOT 01 GROS OEUVRE"])

    # Force l'échec du lecteur PDFium → le fallback pypdf prend le relais.
    def _boom(*a, **k):
        raise pdf_lecture.PdfIllisible(pdf_lecture.ERREUR_FORMAT)
    monkeypatch.setattr(pdf_lecture, "lire_pages", _boom)
    lectures_pypdf = []
    vrai = pypdf.PdfReader
    monkeypatch.setattr(pypdf, "PdfReader", lambda *a, **k: (lectures_pypdf.append(a), vrai(*a, **k))[1])

    text = lot_detector._extract_pdf_text_limited(pdf)
    assert "LOT 01" in text
    assert len(lectures_pypdf) == 1


def test_lots_lisent_le_pdf_avec_le_lecteur_du_depot(tmp_path, monkeypatch):
    """Lots : le PDF est lu par pdf_lecture (pypdfium2), pages limitées ; pas de pypdf."""
    import pypdf
    from services import lot_detector, pdf_lecture
    from tests.pdf_fabrique import ecrire_pdf

    pdf = ecrire_pdf(tmp_path / "rc.pdf", ["LOT 01 GROS OEUVRE", "", "LOT 02 COUVERTURE", "LOT 03 PVC"])
    appels = []
    vrai = pdf_lecture.lire_pages
    monkeypatch.setattr(pdf_lecture, "lire_pages", lambda *a, **k: (appels.append(k), vrai(*a, **k))[1])
    monkeypatch.setattr(pypdf, "PdfReader", lambda *a, **k: pytest.fail("repli pypdf inutile"))

    text = lot_detector._extract_pdf_text_limited(pdf, max_pages=3)
    assert text == "LOT 01 GROS OEUVRE\n\nLOT 02 COUVERTURE\n"
    assert appels == [{"max_pages": 3}]
