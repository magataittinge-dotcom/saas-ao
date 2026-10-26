"""Plan d'installation de principe et schéma de méthodologie (bloc 3, tranche 5) : rien d'inventé,
sans appel IA ; le plan porte toujours sa mention de principe. Données inventées."""
import io
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from types import SimpleNamespace

import pytest

from services.visuels import installation, methode, svg_conforme, svg_vers_png
from services.visuels.couleurs import Theme

TH = Theme("#1E40AF")
NS = "{http://www.w3.org/2000/svg}"
needs_soffice = pytest.mark.skipif(not (shutil.which("soffice") or shutil.which("libreoffice")),
                                   reason="LibreOffice absent de l'environnement")

MENTION = ("Schéma de principe, non à l'échelle, à arrêter en période de préparation avec la maîtrise d'œuvre "
           "et le coordonnateur SPS")

TEXTE = """Notre méthode en six temps.

### Diagnostic et réception des supports
Sondages et relevés.

**Préparation des supports**
Lavage haute pression.

Étape 3 : Pose de l'isolant
Collage et chevillage.

4. Sous-enduit armé et finition
Treillis marouflé.

## Points singuliers et réception :
- Appuis, tableaux.
"""


def _textes(svg):
    return ["".join(e.itertext()) for e in ET.fromstring(svg).iter(NS + "text")]


# ── Schéma de méthodologie ───────────────────────────────────────────────────

def test_etapes_tirees_des_sous_titres_dans_l_ordre():
    assert methode.etapes_depuis_texte(TEXTE) == [
        "Diagnostic et réception des supports", "Préparation des supports", "Pose de l'isolant",
        "Sous-enduit armé et finition", "Points singuliers et réception"]


def test_pas_de_schema_sans_assez_ni_trop_d_etapes_et_pas_d_instruction():
    assert methode.etapes_depuis_texte("Texte sans intertitre.\n- une puce\n- une autre") == []
    assert methode.etapes_depuis_texte("### Un\n### Deux") == []
    assert methode.etapes_depuis_texte("\n".join(f"### Étape numéro {i}" for i in range(13))) == []
    assert methode.etapes_depuis_texte("### [À COMPLÉTER : étape]\n### Trois mots ici\n### Autre titre ici\n### Et un autre") == \
        ["Trois mots ici", "Autre titre ici", "Et un autre"]
    assert methode.construire("", TH) is None and methode.construire(None, TH) is None


def test_le_schema_ne_montre_que_les_etapes_du_texte():
    v = methode.construire(TEXTE, TH)
    assert v.section == ("partie_c", "methodologie")
    textes = _textes(v.svg)
    assert svg_conforme(v.svg) == []
    for etape in methode.etapes_depuis_texte(TEXTE):
        assert etape in " ".join(textes).replace("  ", " ") or all(m in " ".join(textes) for m in etape.split())
    # rien d'autre que : numéros, mots des étapes, mention de source
    mots_etapes = set(" ".join(methode.etapes_depuis_texte(TEXTE)).split())
    autres = [x for x in textes if not x.isdigit() and not set(x.split()) <= mots_etapes]
    assert autres == ["Étapes : intertitres de la méthodologie rédigée ci-dessus."]
    assert "5 étapes" in v.texte_alt
    assert svg_vers_png(v.svg)[:8] == b"\x89PNG\r\n\x1a\n"


def test_texte_du_schema_dans_ses_cartes():
    from services.visuels import largeur
    longues = "\n".join(f"### Étape {i} : mise en œuvre très détaillée de la phase numéro {i} sur toutes les façades" for i in range(1, 8))
    v = methode.construire(longues, TH)
    racine = ET.fromstring(v.svg)
    cartes = [(float(e.get("x")), float(e.get("y")), float(e.get("width")), float(e.get("height")))
              for e in racine.iter(NS + "rect") if e.get("stroke") not in (None, "none") and float(e.get("width")) > 60]
    assert len(cartes) == 7
    for tx in racine.iter(NS + "text"):
        x, y = float(tx.get("x")), float(tx.get("y"))
        for cx, cy, cw, ch in cartes:
            if cx <= x <= cx + cw and cy <= y - 3 <= cy + ch and tx.get("text-anchor", "start") == "start":
                assert x + largeur("".join(tx.itertext()), float(tx.get("font-size")), tx.get("font-weight") == "bold") <= cx + cw
                assert y <= cy + ch


# ── Plan d'installation de principe ──────────────────────────────────────────

def test_elements_lus_seulement_s_ils_sont_ecrits():
    assert installation.elements_declares("Échafaudage de pied", "fourgon") == ["echafaudage"]
    assert installation.elements_declares("Base vie 3 modules\nBennes de tri\nMalaxeur", None) == [
        "base_vie", "gachage", "benne"]
    assert installation.elements_declares(None, "", "  ") == []


def test_un_seul_element_ou_aucun_pas_de_plan():
    assert installation.construire("Échafaudage", None, None, TH) is None
    assert installation.construire(None, None, None, TH) is None
    assert installation.construire("Fourgon\nPerforateur", None, None, TH) is None


def test_le_plan_ne_dessine_que_les_elements_declares_et_porte_sa_mention():
    v = installation.construire("Échafaudage de pied\nBase vie 2 modules", "Benne 10 m³", None, TH)
    assert v.section == ("partie_b", "demarrage")
    textes = _textes(v.svg)
    corps = " ".join(textes)
    for present in ("Base vie", "Bennes de tri", "Échafaudage"):
        assert present in corps
    for absent in ("Sanitaires", "Stockage", "Aire de gâchage", "Nacelle"):
        assert absent not in corps                                    # jamais un élément non écrit
    assert MENTION in corps.replace("  ", " ")                       # mention dans l'image, toujours
    assert svg_conforme(v.svg) == [] and "non à l'échelle" in v.texte_alt
    assert svg_vers_png(v.svg)[:8] == b"\x89PNG\r\n\x1a\n"


def test_aucun_acces_ni_element_invente_dans_le_plan():
    corps = " ".join(_textes(installation.construire("Échafaudage\nBase vie", None, None, TH).svg))
    assert "Accès" not in corps and "Rue" not in corps


def test_la_mention_est_la_ou_le_plan_est_quelles_que_soient_les_donnees():
    for champs in (("Base vie\nSanitaires", None, None), ("Nacelle\nGrue\nBenne\nBase vie\nStockage\nMalaxeur\nSanitaires\nClôture", None, None),
                   (None, None, "Clôture et palissade ; benne")):
        v = installation.construire(*champs, TH)
        assert v is not None and MENTION in " ".join(_textes(v.svg))


def test_tout_le_texte_du_plan_tient_dans_l_image():
    from services.visuels import largeur
    v = installation.construire("Nacelle\nGrue\nBenne\nBase vie\nStockage\nMalaxeur\nSanitaires\nClôture\nÉchafaudage", None, None, TH)
    racine = ET.fromstring(v.svg)
    vb = [float(x) for x in racine.get("viewBox").split()]
    for tx in racine.iter(NS + "text"):
        x, y, taille = float(tx.get("x")), float(tx.get("y")), float(tx.get("font-size"))
        w = largeur("".join(tx.itertext()), taille, tx.get("font-weight") == "bold")
        ancre = tx.get("text-anchor", "start")
        gauche = x if ancre == "start" else x - w / 2 if ancre == "middle" else x - w
        assert gauche >= -0.5 and gauche + w <= vb[2] + 0.5 and y <= vb[3]
        assert taille >= 8


# ── Assemblage et placement ──────────────────────────────────────────────────

def test_assemblage_methode_et_plan_selon_les_donnees():
    from services.visuels.assemblage import construire_visuels
    cfg = SimpleNamespace(gerant_nom=None, gerant_titre=None, postes_cles=[],
                          materiel="Échafaudage de pied\nBase vie", vehicules="")
    contenu = {"partie_c": {"methodologie": TEXTE}}
    vis = construire_visuels({"gantt_phases": [{"nom": "Pose", "duree_semaines": 4}]}, cfg, content_json=contenu)
    legendes = [v.legende for v in vis]
    assert [x for x in legendes if x in ("Schéma de la méthodologie", "Planning prévisionnel des travaux")] == [
        "Schéma de la méthodologie", "Planning prévisionnel des travaux"]          # schéma avant Gantt
    assert ("partie_b", "demarrage") in [v.section for v in vis]
    # l'installation peut aussi être décrite dans les particularités saisies pour ce mémoire
    nu = SimpleNamespace(gerant_nom=None, gerant_titre=None, postes_cles=[], materiel="", vehicules="")
    avec = construire_visuels({"particularites": "Base vie à l'arrière, benne de tri, clôture"}, nu)
    assert [v.section for v in avec] == [("partie_b", "demarrage")]
    # sans donnée : rien
    vide = SimpleNamespace(gerant_nom=None, gerant_titre=None, postes_cles=[], materiel="", vehicules="")
    assert construire_visuels({}, vide, content_json={"partie_c": {"methodologie": "Texte plat."}}) == []


def test_schema_avant_le_gantt_dans_la_methodologie_et_plan_en_B1():
    from services.docx_exporter import build_memoire_docx
    from services.visuels.assemblage import construire_visuels
    cfg = SimpleNamespace(gerant_nom=None, gerant_titre=None, postes_cles=[], materiel="Échafaudage\nBase vie", vehicules="")
    contenu = {"partie_b": {"demarrage": "Démarrage.", "interlocuteur": "Interlocuteur."},
               "partie_c": {"methodologie": TEXTE}}
    vis = construire_visuels({"gantt_phases": [{"nom": "Pose", "duree_semaines": 4}]}, cfg, content_json=contenu)
    out = build_memoire_docx(contenu, "P", "E", visuels=vis)
    xml = zipfile.ZipFile(io.BytesIO(out)).read("word/document.xml").decode("utf-8")
    paras = re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)
    texte = [re.sub(r"<[^>]+>", "", p) for p in paras]
    i_b1 = next(i for i, x in enumerate(texte) if "1. Démarrage du chantier" in x)
    i_b2 = next(i for i, x in enumerate(texte) if "2. Interlocuteur dédié" in x)
    assert any("svgBlip" in p for p in paras[i_b1:i_b2])                       # le plan est en B.1
    i_c1 = next(i for i, x in enumerate(texte) if "1. Méthodologie détaillée" in x)
    i_c3 = next(i for i, x in enumerate(texte) if "3. Matériels dédiés" in x)
    images_c1 = [i for i, p in enumerate(paras) if "svgBlip" in p and i_c1 < i < i_c3]
    assert len(images_c1) == 2                                                # schéma puis Gantt
    legendes = [x for x in texte if x in ("Schéma de la méthodologie", "Planning prévisionnel des travaux")]
    assert legendes == ["Schéma de la méthodologie", "Planning prévisionnel des travaux"]


@needs_soffice
def test_textes_du_plan_et_du_schema_dans_le_pdf():
    from services.docx_exporter import build_memoire_docx
    from services.pdf_export import docx_to_pdf
    from services.pdf_lecture import lire_pages
    plan = installation.construire("Échafaudage de pied\nBase vie", None, None, TH)
    schema = methode.construire(TEXTE, TH)
    contenu = {"partie_b": {"demarrage": "Démarrage."}, "partie_c": {"methodologie": TEXTE}}
    texte = " ".join(lire_pages(docx_to_pdf(build_memoire_docx(contenu, "P", "E", visuels=[plan, schema])))).replace("\n", " ")
    assert "EMPRISE DU CHANTIER" in texte and "non à l'échelle" in texte and "coordonnateur SPS" in texte
    assert "Diagnostic et réception des supports" in texte
