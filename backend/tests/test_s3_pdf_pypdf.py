"""S3.6 — migration PyPDF2 (EOL) → pypdf (maintenu).

PyPDF2 3.0.1 ne reçoit plus de correctifs de sécurité alors que l'app parse des
PDF issus de DCE potentiellement hostiles. On migre vers pypdf (API identique)
et on prouve que le chemin d'extraction de secours (quand PyMuPDF/fitz échoue)
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
    """Le fallback d'extraction (fitz en échec) lit le PDF via pypdf."""
    import fitz
    from services import lot_detector

    # PDF texte minimal créé avec fitz.
    pdf = tmp_path / "lot.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "LOT 01 GROS OEUVRE")
    doc.save(str(pdf))
    doc.close()

    # Force l'échec de la branche fitz → le fallback pypdf prend le relais.
    def _boom(*a, **k):
        raise RuntimeError("fitz indisponible")
    monkeypatch.setattr(fitz, "open", _boom)

    text = lot_detector._extract_pdf_text_limited(pdf)
    assert "LOT 01" in text
