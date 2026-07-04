"""
Tests C8a — organigramme SVG (option 0 € API).

  • SVG déterministe depuis le profil (gérant + postes_cles), hiérarchie
    2-3 niveaux, noms/rôles affichés.
  • Conversion PNG via PyMuPDF (déjà présent — aucune dépendance ajoutée).
  • Insertion dans le DOCX à la section « Effectifs dédiés au chantier ».
  • Données manquantes → None : JAMAIS d'organigramme vide (l'option front
    est grisée via preflight.organigramme_available).
"""
import io
import zipfile

import pytest


class _Cfg:
    def __init__(self, gerant_nom=None, gerant_titre=None, postes_cles=None):
        self.gerant_nom = gerant_nom
        self.gerant_titre = gerant_titre
        self.postes_cles = postes_cles


TEAM = [
    {"poste": "Conducteur de travaux", "nom": "Ali Benali", "role": "Pilotage chantier"},
    {"poste": "Chef de chantier", "nom": "Marc Petit", "role": "Encadrement équipe"},
    {"poste": "Chef d'équipe", "nom": "Yanis Robert", "role": "CACES R486"},
]


# ─── Génération SVG ──────────────────────────────────────────────────────────

def test_svg_generated_for_typical_team():
    from services.organigramme import generate_organigramme_svg

    svg = generate_organigramme_svg(_Cfg("Karim Omarov", "Gérant", TEAM))
    assert svg is not None
    # SVG bien formé (la validité structurelle est prouvée par la
    # rasterisation PyMuPDF dans test_svg_to_png_conversion)
    assert svg.lstrip().startswith("<svg") and svg.rstrip().endswith("</svg>")
    for name in ("Karim Omarov", "Ali Benali", "Marc Petit", "Yanis Robert"):
        assert name in svg
    assert "Gérant" in svg and "Conducteur de travaux" in svg


def test_hierarchy_levels():
    from services.organigramme import build_hierarchy

    levels = build_hierarchy(_Cfg("Karim Omarov", "Gérant", TEAM))
    assert [p["nom"] for p in levels[0]] == ["Karim Omarov"]      # direction
    assert any(p["nom"] == "Ali Benali" for p in levels[1])       # conducteur
    assert any(p["nom"] == "Marc Petit" for p in levels[2])       # chefs
    assert len(levels) <= 3


def test_no_data_returns_none_never_empty_chart():
    from services.organigramme import generate_organigramme_svg

    assert generate_organigramme_svg(_Cfg()) is None
    assert generate_organigramme_svg(None) is None
    # Gérant seul = pas un organigramme (1 seule boîte) → quand même généré ?
    # Non : il faut au moins 2 personnes pour une hiérarchie.
    assert generate_organigramme_svg(_Cfg("Karim Omarov", "Gérant", [])) is None


def test_svg_to_png_conversion():
    from services.organigramme import generate_organigramme_svg, svg_to_png_bytes

    svg = generate_organigramme_svg(_Cfg("Karim Omarov", "Gérant", TEAM))
    png = svg_to_png_bytes(svg)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"  # magic bytes PNG
    assert len(png) > 1000


# ─── Insertion DOCX ──────────────────────────────────────────────────────────

def _count_media(docx_bytes: bytes) -> int:
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        return len([n for n in z.namelist() if n.startswith("word/media/")])


CONTENT = {
    "preambule": "Préambule.",
    "partie_a": {"presentation": "Notre entreprise."},
    "partie_b": {},
    "partie_c": {"effectifs": "Une équipe dédiée de 6 compagnons.", "methodologie": "Méthode."},
}


def test_docx_contains_organigramme_image():
    from services.docx_exporter import build_memoire_docx
    from services.organigramme import generate_organigramme_svg, svg_to_png_bytes

    svg = generate_organigramme_svg(_Cfg("Karim Omarov", "Gérant", TEAM))
    png = svg_to_png_bytes(svg)

    without = build_memoire_docx(CONTENT, "Projet X", "BATI FACADE")
    with_org = build_memoire_docx(
        CONTENT, "Projet X", "BATI FACADE", organigramme_image=png,
    )
    assert _count_media(with_org) == _count_media(without) + 1


def test_docx_without_organigramme_unchanged():
    from services.docx_exporter import build_memoire_docx

    out = build_memoire_docx(CONTENT, "Projet X", "BATI FACADE", organigramme_image=None)
    assert out[:2] == b"PK"  # docx valide (zip)


# ─── Pre-flight : disponibilité de l'option ──────────────────────────────────

def test_preflight_exposes_organigramme_availability(client, db_session, test_org):
    from models.memoire_config import MemoireConfig
    from models.project import Project

    db_session.add(Project(id="proj-c8a", organization_id=test_org.id, name="AO"))
    db_session.commit()

    # Sans équipe → option indisponible
    resp = client.get("/api/projects/proj-c8a/memoire/preflight")
    assert resp.status_code == 200
    assert resp.json()["organigramme_available"] is False

    # Avec gérant + postes clés → disponible
    db_session.add(MemoireConfig(
        organization_id=test_org.id, gerant_nom="Karim Omarov",
        postes_cles=TEAM,
    ))
    db_session.commit()
    resp2 = client.get("/api/projects/proj-c8a/memoire/preflight")
    assert resp2.json()["organigramme_available"] is True
