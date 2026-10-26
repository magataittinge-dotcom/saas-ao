"""Revue de sécurité des visuels : toile bornée, phases du Gantt validées, un visuel défaillant
ne casse jamais l'export Word, caractères illégaux en XML retirés des textes saisis."""
import io
import time
import tracemalloc
import zipfile
from types import SimpleNamespace

import pytest
from docx import Document
from pydantic import ValidationError

from schemas.memoire import MemoireGenerateRequest


# ── 1. Taille bornée ─────────────────────────────────────────────────────────

def test_phases_du_gantt_validees_au_schema():
    ok = [{"nom": "Installation", "duree_semaines": 2}, {"nom": "Pose", "duree_semaines": 5}]
    assert MemoireGenerateRequest(gantt_phases=ok).model_dump()["gantt_phases"] == ok
    for mauvais in (
        [{"nom": f"P{i}", "duree_semaines": 1} for i in range(10_000)],      # trop de phases
        [{"nom": f"P{i}", "duree_semaines": 1} for i in range(51)],
        [{"nom": "Pose", "duree_semaines": 10 ** 6}],                         # durée démesurée
        [{"nom": "Pose", "duree_semaines": 261}],
        [{"nom": f"P{i}", "duree_semaines": 100} for i in range(6)],          # total > 520 semaines
        [{"nom": "Pose", "duree_semaines": 0}],
        [{"nom": "x" * 5000, "duree_semaines": 1}],
    ):
        with pytest.raises(ValidationError):
            MemoireGenerateRequest(gantt_phases=mauvais)


def test_generateur_gantt_refuse_les_donnees_hors_bornes():
    from services.gantt import generate_gantt_svg
    t0 = time.perf_counter()
    assert generate_gantt_svg([{"nom": "Pose", "duree_semaines": 10 ** 6}]) is None
    assert generate_gantt_svg([{"nom": f"P{i}", "duree_semaines": 1} for i in range(10_000)]) is None
    assert time.perf_counter() - t0 < 1.0


def test_rasteriseur_refuse_une_toile_geante_en_temps_et_memoire_bornes():
    from services.visuels.raster import VisuelTropGrand, svg_vers_png
    geant = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000000 1000000">'
             '<rect width="100%" height="100%" fill="#FFFFFF"/></svg>')
    tracemalloc.start()
    t0 = time.perf_counter()
    with pytest.raises(VisuelTropGrand):
        svg_vers_png(geant)
    pic = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    assert time.perf_counter() - t0 < 1.0 and pic < 20_000_000


# ── 2. Un visuel défaillant ne casse pas le Word ─────────────────────────────

CONTENT = {"preambule": "P.", "partie_a": {}, "partie_b": {},
           "partie_c": {"effectifs": "Équipe.", "methodologie": "Méthode."}}
CFG = SimpleNamespace(gerant_nom="Julien Marchal", gerant_titre="Gérant",
                      postes_cles=[{"poste": "Conductrice de travaux", "nom": "Sophie Lemaire", "role": ""}])


def _docx_valide(octets: bytes):
    assert zipfile.ZipFile(io.BytesIO(octets)).testzip() is None
    Document(io.BytesIO(octets))


def test_rasterisation_en_echec_fait_disparaitre_le_visuel_sans_casser_l_export(monkeypatch):
    import services.visuels.modele as modele
    from services.docx_exporter import build_memoire_docx
    from services.visuels.assemblage import construire_visuels

    def boum(*a, **k):
        raise RuntimeError("rastérisation impossible")

    monkeypatch.setattr(modele, "svg_vers_png", boum)
    visuels = construire_visuels({"include_organigramme": True}, CFG)
    assert visuels == []
    _docx_valide(build_memoire_docx(CONTENT, "P", "E", visuels=visuels))


def test_visuel_defaillant_deja_construit_est_ignore_a_l_insertion(monkeypatch):
    import services.visuels.modele as modele
    from services.docx_exporter import build_memoire_docx
    from services.visuels.modele import Visuel

    monkeypatch.setattr(modele, "svg_vers_png", lambda *a, **k: (_ for _ in ()).throw(ValueError("x")))
    v = Visuel(("partie_c", "effectifs"), "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'/>", "alt", "légende")
    _docx_valide(build_memoire_docx(CONTENT, "P", "E", visuels=[v]))


# ── 3. Caractères illégaux en XML ────────────────────────────────────────────

def test_caracteres_de_controle_retires_des_textes_saisis():
    from services.visuels.svg import esc
    from services.visuels.texte import nettoyer
    assert nettoyer("Jean\x00 Du\x0bpont\ttab\nligne\r") == "Jean Dupont\ttab\nligne\r"
    assert esc("a\x00b\x0bc\x1fd") == "abcd"
    assert nettoyer("ok\ud800") == "ok"          # demi-substitut isolé


def test_nom_avec_caracteres_illegaux_donne_un_export_valide():
    import re
    from services.docx_exporter import build_memoire_docx
    from services.visuels.assemblage import construire_visuels

    cfg = SimpleNamespace(gerant_nom="Julien\x00 Marchal", gerant_titre="Gérant\x0b",
                          postes_cles=[{"poste": "Conductrice\x0b de travaux", "nom": "Sophie\x00 Lemaire", "role": "x\x01y"}])
    visuels = construire_visuels({"include_organigramme": True}, cfg)
    sortie = build_memoire_docx(CONTENT, "P", "E", visuels=visuels)
    _docx_valide(sortie)
    xml = zipfile.ZipFile(io.BytesIO(sortie)).read("word/document.xml").decode("utf-8")
    assert not re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", xml)


def test_texte_alternatif_et_legende_nettoyes():
    from services.docx_exporter import build_memoire_docx
    from services.visuels.modele import Visuel
    svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 20'><rect width='40' height='20' fill='#FF0000'/></svg>"
    v = Visuel(("partie_c", "effectifs"), svg, "alt\x00ernatif", "lé\x0bgende")
    _docx_valide(build_memoire_docx(CONTENT, "P", "E", visuels=[v]))
