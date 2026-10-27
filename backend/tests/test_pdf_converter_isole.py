"""B19 — `PdfConverter` (Word déposé → PDF de « Voir dans le DCE ») passe par LibreOffice isolé :
profil jetable (conversions concurrentes sans échec), environnement minimal, PDF posé à côté de l'original."""
from __future__ import annotations

import io
import json
import shutil
import sys
import threading
from pathlib import Path

import pytest
from docx import Document

from services import libreoffice_isole as lo
from services.pdf_converter import PdfConverter

needs_soffice = pytest.mark.skipif(not (shutil.which("soffice") or shutil.which("libreoffice")),
                                   reason="LibreOffice absent de l'environnement")


def _docx(texte: str) -> bytes:
    d = Document()
    d.add_paragraph(texte)
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


@needs_soffice
@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="Linux seulement")
def test_conversions_concurrentes_de_fichiers_deposes_reussissent(tmp_path, monkeypatch):
    """Avant : pas de profil jetable, deux conversions simultanées se disputaient le profil par défaut."""
    monkeypatch.setenv("SYNORIX_LIBREOFFICE_DIR", str(tmp_path / "lo"))
    dossier = tmp_path / "uploads"
    dossier.mkdir()
    sources = []
    for i in range(3):
        s = dossier / f"piece{i}.docx"
        s.write_bytes(_docx(f"Texte fictif numéro {i}."))
        sources.append(s)
    resultats: dict = {}

    def convertir(s: Path):
        resultats[s.name] = PdfConverter.convert_to_pdf(s, s.parent)

    fils = [threading.Thread(target=convertir, args=(s,)) for s in sources]
    for f in fils:
        f.start()
    for f in fils:
        f.join(timeout=300)
    for s in sources:
        pdf = resultats[s.name]
        assert pdf == dossier / f"{s.stem}.pdf" and pdf.read_bytes()[:5] == b"%PDF-"
    assert [p.name for p in (tmp_path / "lo").glob("conv-*")] == []


def test_un_fichier_deposé_ne_voit_aucun_secret_de_l_api(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNORIX_LIBREOFFICE_DIR", str(tmp_path / "lo"))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-factice-converter")
    sortie = tmp_path / "env.json"
    faux = tmp_path / "faux"
    faux.write_text(f"""#!{sys.executable}
import os, sys, json
args = sys.argv[1:]
json.dump(dict(os.environ), open({str(sortie)!r}, "w"))
open(os.path.join(args[args.index("--outdir") + 1], "entree.pdf"), "wb").write(b"%PDF-1.4 faux")
""")
    faux.chmod(0o755)
    monkeypatch.setattr(lo, "_soffice_binary", lambda: str(faux))
    source = tmp_path / "dpgf.xlsx"
    source.write_bytes(b"PK xlsx fictif")

    pdf = PdfConverter.convert_to_pdf(source, tmp_path)

    assert pdf == tmp_path / "dpgf.pdf"
    assert "sk-ant-factice-converter" not in sortie.read_text()


def test_echec_de_conversion_rend_none_sans_lever(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNORIX_LIBREOFFICE_DIR", str(tmp_path / "lo"))
    monkeypatch.setattr(lo, "_soffice_binary", lambda: None)
    source = tmp_path / "x.docx"
    source.write_bytes(b"PK")
    assert PdfConverter.convert_to_pdf(source, tmp_path) is None
    assert PdfConverter.convert_to_pdf(tmp_path / "absent.docx", tmp_path) is None
