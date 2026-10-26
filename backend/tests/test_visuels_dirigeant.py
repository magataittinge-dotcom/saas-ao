"""WORD2 point 7 — le dirigeant n'entre pas dans l'effectif, mais il apparaît dans
l'organigramme (en tête) et dans l'encadrement du synoptique des moyens humains.
Toutes les personnes sont inventées."""
import xml.etree.ElementTree as ET
from types import SimpleNamespace

import pytest

from services.visuels import moyens
from services.visuels import organigramme as org
from services.visuels.couleurs import Theme

TH = Theme("#1E40AF")
NS = "{http://www.w3.org/2000/svg}"
POSTES = [
    {"poste": "Conductrice de travaux", "nom": "Sophie Lemaire", "role": ""},
    {"poste": "Compagnon façadier", "nom": "Louis Perrin", "role": ""},
    {"poste": "Compagnon façadier", "nom": "Marc Haddad", "role": ""},
]


def _cfg(titre="Gérant", gerant="Julien Marchal", postes=None):
    return SimpleNamespace(gerant_nom=gerant, gerant_titre=titre, postes_cles=postes if postes is not None else POSTES,
                           materiel="", vehicules="")


def _y_du_texte(svg: str, texte: str) -> float:
    for tx in ET.fromstring(svg).iter(NS + "text"):
        if "".join(tx.itertext()) == texte:
            return float(tx.get("y"))
    raise AssertionError(f"{texte!r} introuvable dans le SVG")


# ── Organigramme : le dirigeant est en tête, quel que soit l'intitulé saisi ──

@pytest.mark.parametrize("titre", [
    "Gérant", "", None, "Dirigeant", "Responsable de l'entreprise", "Artisan",
    "Gérant et responsable qualité", "Chef de chantier et gérant", "Conducteur de travaux associé",
])
def test_le_dirigeant_est_toujours_en_tete_de_l_organigramme(titre):
    personnes = org.personnes_depuis(_cfg(titre), None)
    gerant = next(p for p in personnes if p["nom"] == "Julien Marchal")
    assert gerant["categorie"] == org.DIRECTION
    svg, _ = org.organigramme_svg(personnes, TH)
    y_gerant = _y_du_texte(svg, "Julien Marchal")
    autres = [_y_du_texte(svg, p["nom"]) for p in personnes if p["nom"] != "Julien Marchal"]
    assert all(y_gerant < y for y in autres)


def test_le_dirigeant_saisi_aussi_comme_poste_cle_reste_une_seule_fois_en_direction():
    postes = POSTES + [{"poste": "Chef de chantier", "nom": "Julien Marchal", "role": ""}]
    personnes = org.personnes_depuis(_cfg("Dirigeant", postes=postes), None)
    assert [p["nom"] for p in personnes].count("Julien Marchal") == 1
    assert next(p for p in personnes if p["nom"] == "Julien Marchal")["categorie"] == org.DIRECTION


# ── Moyens humains : encadrement affiché, effectif inchangé ──────────────────

def test_le_synoptique_des_moyens_humains_a_une_ligne_encadrement_avec_le_dirigeant():
    cartes = moyens.cartes_humaines(_cfg(), None, 4)
    encadrement = moyens.encadrement(_cfg(), None)
    assert encadrement == ["Julien Marchal (Gérant)", "Sophie Lemaire (Conductrice de travaux)"]
    svg, alt = moyens.synoptique_humains(cartes, TH, encadrement)
    textes = ["".join(tx.itertext()) for tx in ET.fromstring(svg).iter(NS + "text")]
    ligne = next(t for t in textes if t.startswith("Encadrement :"))
    assert "Julien Marchal (Gérant)" in ligne
    assert _y_du_texte(svg, ligne) < _y_du_texte(svg, "Compagnon façadier")    # au-dessus des cartes
    assert "Encadrement : Julien Marchal (Gérant), Sophie Lemaire (Conductrice de travaux)" in alt


def test_le_dirigeant_n_est_jamais_compte_dans_l_effectif():
    cartes = moyens.cartes_humaines(_cfg(), None, 4)
    assert sum(c["nombre"] for c in cartes) == 3 + 4          # 3 postes clés + 4 ouvriers, pas le gérant
    assert all("Julien Marchal" not in c["noms"] for c in cartes)
    svg, alt = moyens.synoptique_humains(cartes, TH, moyens.encadrement(_cfg(), None))
    assert "1 Gérant" not in alt and "Gérant" not in "".join(c["role"] for c in cartes)


def test_dirigeant_seul_avec_des_ouvriers_saisis_apparait_en_encadrement():
    visuel = moyens.construire_humains(_cfg(postes=[]), None, 5, TH)
    assert visuel is not None
    assert "Encadrement : Julien Marchal (Gérant)" in visuel.texte_alt
    assert "5 Ouvriers dédiés au chantier" in visuel.texte_alt


def test_pas_de_visuel_si_seul_le_dirigeant_est_connu():
    assert moyens.construire_humains(_cfg(postes=[]), None, None, TH) is None


def test_le_dirigeant_de_l_equipe_en_base_apparait_en_encadrement_sans_etre_compte():
    membres = [SimpleNamespace(name="Aline Faure", role="Co-gérante", specialite=None, experience_years=None,
                               certifications=None),
               SimpleNamespace(name="Yanis Roux", role="Compagnon", specialite=None, experience_years=None,
                               certifications=None)]
    cfg = _cfg(gerant="", postes=[])
    assert moyens.encadrement(cfg, membres) == ["Aline Faure (Co-gérante)"]
    assert [(c["role"], c["nombre"]) for c in moyens.cartes_humaines(cfg, membres, None)] == [("Compagnon", 1)]


def test_la_ligne_encadrement_longue_reste_dans_la_page_et_le_svg_reste_conforme():
    from services.visuels import largeur, svg_conforme
    from services.visuels.svg import LARGEUR_PORTRAIT

    longue = [f"Personne{k} Inventée-Dupont (Directeur de projets et de développement des travaux)" for k in range(6)]
    svg, _ = moyens.synoptique_humains(moyens.cartes_humaines(_cfg(), None, 4), TH, longue)
    assert svg_conforme(svg) == []
    for tx in ET.fromstring(svg).iter(NS + "text"):
        if "".join(tx.itertext()).startswith(("Encadrement", "Personne")):
            assert float(tx.get("x")) + largeur("".join(tx.itertext()), float(tx.get("font-size"))) <= LARGEUR_PORTRAIT
