"""Ce que soffice laisse dans son dossier jetable est hostile (bloc 6, revue de sécurité) : un lien symbolique
``entree.pdf -> backend/.env`` faisait lire ce fichier par l'API (qui le rendait comme « PDF »), un lien à la place du
fichier d'état ou de stderr le faisait entrer dans les journaux, un FIFO faisait attendre l'ouverture sans fin.
Un FAUX soffice en shell dépose ces pièges."""
from __future__ import annotations

import time

import pytest

from services import libreoffice_isole as lo
from tests.test_landlock_libreoffice import needs_landlock

SECRET = "CLE_FACTICE=valeur-factice-sortie-hostile"

_FAUX = """#!/bin/sh
while [ $# -gt 1 ]; do if [ "$1" = "--outdir" ]; then OUT="$2"; fi; shift; done
{corps}
"""


@pytest.fixture
def faux(tmp_path, monkeypatch):
    secret = tmp_path / "backend" / ".env"
    secret.parent.mkdir()
    secret.write_text(SECRET)
    racine = tmp_path / "lo"
    racine.mkdir()
    monkeypatch.setenv("SYNORIX_LIBREOFFICE_DIR", str(racine))
    monkeypatch.setenv("SYNORIX_LIBREOFFICE_RESEAU", "auto")
    monkeypatch.setenv("SYNORIX_LIBREOFFICE_LANDLOCK", "auto")

    def installer(corps: str):
        script = tmp_path / "faux_soffice"
        script.write_text(_FAUX.format(corps=corps.replace("{secret}", str(secret))))
        script.chmod(0o755)
        monkeypatch.setattr(lo, "_soffice_binary", lambda: str(script))
    return installer


@needs_landlock
def test_un_lien_a_la_place_du_pdf_n_est_pas_lu(faux, caplog):
    faux('ln -s "{secret}" "$OUT/entree.pdf"')
    with pytest.raises(lo.PdfConversionError) as e:
        lo.convertir_en_pdf(b"x", ".docx")
    assert e.value.raison == "echec"
    assert SECRET not in caplog.text and SECRET not in str(e.value)


@needs_landlock
def test_un_lien_a_la_place_du_pdf_n_est_pas_copie_vers_la_destination(faux, tmp_path):
    faux('ln -s "{secret}" "$OUT/entree.pdf"')
    destination = tmp_path / "sortie" / "m.pdf"
    with pytest.raises(lo.PdfConversionError):
        lo.convertir_en_pdf(b"x", ".docx", destination)
    assert not destination.exists()


@needs_landlock
def test_un_fifo_a_la_place_du_pdf_ne_fait_pas_attendre(faux):
    faux('mkfifo "$OUT/entree.pdf"')
    debut = time.monotonic()
    with pytest.raises(lo.PdfConversionError):
        lo.convertir_en_pdf(b"x", ".docx")
    assert time.monotonic() - debut < 10


@needs_landlock
def test_des_liens_a_la_place_de_l_etat_et_de_stderr_n_entrent_pas_dans_les_journaux(faux, caplog):
    faux('echo "%PDF-1.4 faux" > "$OUT/entree.pdf"\n'
         'rm -f "$OUT/reseau.txt" "$OUT/stderr.txt"\n'
         'ln -s "{secret}" "$OUT/reseau.txt"\n')
    caplog.set_level("INFO", logger="services.libreoffice_isole")
    assert lo.convertir_en_pdf(b"x", ".docx").startswith(b"%PDF-1.4 faux")
    assert SECRET not in caplog.text and "inconnu" in caplog.text
    # même chose pour le stderr d'une conversion en échec
    faux('rm -f "$OUT/stderr.txt"; ln -s "{secret}" "$OUT/stderr.txt"; exit 1')
    caplog.clear()
    with pytest.raises(lo.PdfConversionError):
        lo.convertir_en_pdf(b"x", ".docx")
    assert SECRET not in caplog.text


@needs_landlock
def test_un_etat_reecrit_hors_format_est_remplace_par_inconnu(faux, caplog):
    faux('echo "%PDF-1.4 faux" > "$OUT/entree.pdf"\nprintf "FAUSSE LIGNE\\nde journal" > "$OUT/reseau.txt"\n')
    caplog.set_level("INFO", logger="services.libreoffice_isole")
    lo.convertir_en_pdf(b"x", ".docx")
    assert "FAUSSE" not in caplog.text


@needs_landlock
def test_un_pdf_ordinaire_est_rendu_et_copie(faux, tmp_path):
    faux('echo "%PDF-1.4 faux" > "$OUT/entree.pdf"')
    assert lo.convertir_en_pdf(b"x", ".docx").startswith(b"%PDF-1.4 faux")
    destination = tmp_path / "sortie" / "m.pdf"
    assert lo.convertir_en_pdf(b"x", ".docx", destination) == destination
    assert destination.read_bytes().startswith(b"%PDF-1.4 faux")
    assert not list((tmp_path / "sortie").glob("*.part"))
