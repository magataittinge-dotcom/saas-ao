"""Organigramme v2 (bloc 3, tranche 2) : métiers au féminin, vrais rattachements, texte
coupé dans ses boîtes, placé en A.5 « Organigramme », une seule source d'équipe.
Toutes les personnes sont inventées."""
import io
import re
import xml.etree.ElementTree as ET
import zipfile
from types import SimpleNamespace

import pytest

from services.visuels import largeur
from services.visuels.couleurs import Theme
from services.visuels import organigramme as org

TH = Theme("#1E40AF")
NS = "{http://www.w3.org/2000/svg}"


def _cfg(postes, gerant=("Julien Marchal", "Gérant")):
    return SimpleNamespace(gerant_nom=gerant[0], gerant_titre=gerant[1], postes_cles=postes)


EQUIPE = [
    {"poste": "Conductrice de travaux", "nom": "Sophie Lemaire", "role": "Interlocutrice de la maîtrise d'œuvre"},
    {"poste": "Chef de chantier", "nom": "Karim Benali", "role": ""},
    {"poste": "Compagnon façadier", "nom": "Louis Perrin", "role": ""},
    {"poste": "Compagnon façadier", "nom": "Marc Haddad", "role": ""},
    {"poste": "Responsable QSE", "nom": "Inès Carvalho", "role": "Une journée par semaine"},
]


@pytest.mark.parametrize("poste,attendu", [
    ("Conductrice de travaux", org.ENCADREMENT), ("Conducteur de travaux", org.ENCADREMENT),
    ("Cheffe de chantier", org.CHANTIER), ("Chef d'équipe", org.CHANTIER), ("Cheffe d'équipe", org.CHANTIER),
    ("Gérante", org.DIRECTION), ("Gérant", org.DIRECTION), ("Co-gérant", org.DIRECTION),
    ("Responsable QSE", org.SUPPORT), ("Assistante administrative", org.SUPPORT),
    ("Chargée d'affaires", org.ENCADREMENT), ("Directrice travaux", org.ENCADREMENT),
    ("Compagnon", org.TERRAIN), ("Ouvrière façadière", org.TERRAIN), ("", org.TERRAIN),
])
def test_metiers_au_masculin_et_au_feminin(poste, attendu):
    assert org.classer_poste(poste) == attendu


def test_une_seule_source_pour_l_equipe_sans_doublon():
    membres = [
        SimpleNamespace(name="sophie lemaire", role="Conductrice de travaux", specialite=None,
                        experience_years=None, certifications=None),      # déjà dans postes_cles
        SimpleNamespace(name="Yanis Roux", role="Compagnon", specialite="Enduits", experience_years=12,
                        certifications="SST, CACES R486, Échafaudage"),
    ]
    p = org.personnes_depuis(_cfg(EQUIPE), membres)
    noms = [x["nom"] for x in p]
    assert len(noms) == len(set(n.lower() for n in noms)) == 7
    yanis = next(x for x in p if x["nom"] == "Yanis Roux")
    assert yanis["infos"] == ["Enduits", "12 ans d'expérience"] and yanis["badges"] == ["SST", "CACES R486", "Échafaudage"]
    assert org.organigramme_possible(None, membres[1:]) is False  # une personne ne fait pas un organigramme
    assert org.organigramme_possible(None, membres) is True


def _lire(svg):
    return ET.fromstring(svg)


def _cartes(racine):
    return [(float(e.get("x")), float(e.get("y")), float(e.get("width")), float(e.get("height")))
            for e in racine.iter(NS + "rect")
            if e.get("fill") == "#FFFFFF" and e.get("stroke") not in (None, "none") and float(e.get("width")) > 60]


def test_texte_coupe_dans_ses_boites():
    longue = _cfg([
        {"poste": "Conductrice de travaux et responsable du suivi administratif des chantiers de façades",
         "nom": "Marie-Hélène Dubois-Castellane de la Fontaine", "role": "Interlocutrice unique de la maîtrise d'ouvrage et de la maîtrise d'œuvre pour la totalité du chantier"},
        {"poste": "Chef de chantier", "nom": "Karim Benali", "role": ""},
    ])
    svg, _ = org.organigramme_svg(org.personnes_depuis(longue), TH)
    racine = _lire(svg)
    cartes = _cartes(racine)
    assert len(cartes) == 3
    for tx in racine.iter(NS + "text"):
        x, y = float(tx.get("x")), float(tx.get("y"))
        if tx.get("text-anchor") not in (None, "start") or float(tx.get("font-size")) < 8:
            continue
        # la carte qui contient le début du texte
        proprio = [c for c in cartes if c[0] <= x <= c[0] + c[2] and c[1] <= y - 3 <= c[1] + c[3]]
        if not proprio:
            continue
        cx, cy, cw, ch = proprio[0]
        assert x + largeur("".join(tx.itertext()), float(tx.get("font-size")), tx.get("font-weight") == "bold") <= cx + cw, \
            "".join(tx.itertext())
        assert y <= cy + ch


def _liens(svg):
    """Les connecteurs (chemins M..V..H..V) : (x_haut, y_haut, x_bas, y_bas)."""
    res = []
    for e in _lire(svg).iter(NS + "path"):
        m = re.fullmatch(r"M([\d.]+),([\d.]+) V([\d.]+) H([\d.]+) V([\d.]+)", e.get("d", ""))
        if m:
            x1, y1, _, x2, y2 = map(float, m.groups())
            res.append((x1, y1, x2, y2))
    return res


def _centres(svg):
    c = _cartes(_lire(svg))
    return [(x + w / 2, y, y + h) for x, y, w, h in c]


def test_vrais_rattachements_un_seul_superieur():
    """Gérant -> conductrice -> chef de chantier -> compagnons : une chaîne, pas un éventail."""
    svg, _ = org.organigramme_svg(org.personnes_depuis(_cfg(EQUIPE[:4])), TH)
    liens = _liens(svg)
    assert len(liens) == 4      # gérant>conductrice, conductrice>chef, chef>2 compagnons
    # chaque lien relie le bas d'une carte au haut d'une carte de la rangée suivante
    cartes = _cartes(_lire(svg))
    bas = {round(y + h, 1) for x, y, w, h in cartes}
    haut = {round(y, 1) for x, y, w, h in cartes}
    for x1, y1, x2, y2 in liens:
        assert round(y1, 1) in bas and round(y2, 1) in haut and y2 > y1


def test_rattachement_explicite_du_profil():
    equipe = [
        {"poste": "Conducteur de travaux", "nom": "Ali Benali", "role": ""},
        {"poste": "Conductrice de travaux", "nom": "Sophie Lemaire", "role": ""},
        {"poste": "Chef de chantier", "nom": "Karim Benali", "role": "", "rattache_a": "Sophie Lemaire"},
    ]
    svg, _ = org.organigramme_svg(org.personnes_depuis(_cfg(equipe, gerant=(None, None))), TH)
    cartes = {tuple(round(v, 1) for v in c) for c in _cartes(_lire(svg))}
    textes = {"".join(t.itertext()): (float(t.get("x")), float(t.get("y"))) for t in _lire(svg).iter(NS + "text")}
    liens = _liens(svg)
    assert len(liens) == 1                      # un seul lien : le chef de chantier n'a qu'un supérieur
    xs, _, xb, _ = liens[0]
    sophie, karim = textes["Sophie Lemaire"][0], textes["Karim Benali"][0]
    # le lien part de la carte de Sophie (carte à gauche de son nom) et arrive sur celle de Karim
    assert abs(xs - (sophie - 36 + 158 / 2)) < 60 and abs(xb - (karim - 36 + 158 / 2)) < 60


def test_plusieurs_superieurs_sans_choix_arbitraire():
    """Deux conducteurs, un chef de chantier sans supérieur désigné : trait vers les deux (groupe)."""
    equipe = [
        {"poste": "Conducteur de travaux", "nom": "Ali Benali", "role": ""},
        {"poste": "Conductrice de travaux", "nom": "Sophie Lemaire", "role": ""},
        {"poste": "Chef de chantier", "nom": "Karim Benali", "role": ""},
    ]
    svg, _ = org.organigramme_svg(org.personnes_depuis(_cfg(equipe, gerant=(None, None))), TH)
    assert len(_liens(svg)) == 2


def test_groupe_quand_trop_de_compagnons():
    equipe = [{"poste": "Chef de chantier", "nom": "Karim Benali", "role": ""}] + [
        {"poste": "Compagnon façadier", "nom": f"Personne {chr(65 + i)}", "role": ""} for i in range(7)]
    svg, alt = org.organigramme_svg(org.personnes_depuis(_cfg(equipe)), TH)
    assert "7 × Compagnon façadier" in svg
    assert all(f"Personne {chr(65 + i)}" in svg for i in range(7))      # tous les noms restent lisibles
    assert max(x + w for x, _, w, _ in _cartes(_lire(svg))) <= 480


def test_pas_de_pattern_et_texte_alternatif():
    from services.visuels import svg_conforme
    svg, alt = org.organigramme_svg(org.personnes_depuis(_cfg(EQUIPE)), TH)
    assert svg_conforme(svg) == []
    assert "Sophie Lemaire, Conductrice de travaux" in alt


# ─── Placement dans le Word : section A.5, plus en C.2 ───────────────────────

def _paragraphes(docx_bytes):
    xml = zipfile.ZipFile(io.BytesIO(docx_bytes)).read("word/document.xml").decode("utf-8")
    return re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)


def test_organigramme_en_A5_et_gabarit_retire():
    from services.docx_exporter import build_memoire_docx

    contenu = {
        "partie_a": {"organigramme": "[À COMPLÉTER : insérer la photo de l'organigramme]",
                     "roles_missions": "Rôles de l'équipe."},
        "partie_c": {"effectifs": "Une équipe de six personnes."},
    }
    visuel = org.construire(_cfg(EQUIPE), None, TH)
    assert visuel.section == ("partie_a", "organigramme")
    out = build_memoire_docx(contenu, "Projet X", "Entreprise Y", visuels=[visuel])
    paras = _paragraphes(out)
    texte = [re.sub(r"<[^>]+>", "", p) for p in paras]
    i_titre = next(i for i, t in enumerate(texte) if "5. Organigramme" in t)
    i_image = next(i for i, p in enumerate(paras) if "svgBlip" in p)
    i_suivant = next(i for i, t in enumerate(texte) if "6. Rôles et missions" in t)
    assert i_titre < i_image < i_suivant                      # l'image est dans la section A.5
    assert not any("À COMPLÉTER" in t for t in texte)         # l'instruction du prompt a disparu
    i_c2 = next(i for i, t in enumerate(texte) if "2. Effectifs" in t)
    assert not any("svgBlip" in p for p in paras[i_c2:])      # plus rien en C.2


def test_section_vide_avec_visuel_garde_son_titre_sans_instruction():
    from services.docx_exporter import build_memoire_docx
    visuel = org.construire(_cfg(EQUIPE), None, TH)
    out = build_memoire_docx({"partie_a": {}}, "P", "E", visuels=[visuel])
    texte = " ".join(re.sub(r"<[^>]+>", "", p) for p in _paragraphes(out))
    assert "5. Organigramme" in texte and "svgBlip" in "".join(_paragraphes(out))


# ─── Sources : team_members, isolation entre organisations ───────────────────

def test_preflight_lit_aussi_les_membres_de_l_equipe_et_pas_ceux_d_une_autre_org(client, db_session, test_org):
    from models.organization import Organization
    from models.project import Project
    from models.team_member import TeamMember

    db_session.add(Project(id="proj-org2", organization_id=test_org.id, name="AO"))
    autre = Organization(id="autre-org", name="Autre")
    db_session.add(autre)
    db_session.commit()
    db_session.add_all([
        TeamMember(organization_id=autre.id, name="Étrangère Une", role="Conductrice de travaux"),
        TeamMember(organization_id=autre.id, name="Étranger Deux", role="Chef de chantier"),
    ])
    db_session.commit()
    url = "/api/projects/proj-org2/memoire/preflight"
    assert client.get(url).json()["organigramme_available"] is False      # l'équipe d'une autre org ne compte pas

    db_session.add_all([
        TeamMember(organization_id=test_org.id, name="Sophie Lemaire", role="Conductrice de travaux"),
        TeamMember(organization_id=test_org.id, name="Karim Benali", role="Chef de chantier"),
    ])
    db_session.commit()
    assert client.get(url).json()["organigramme_available"] is True


def test_construire_visuels_organigramme_si_option_cochee_seulement():
    from services.visuels.assemblage import construire_visuels
    cfg = _cfg(EQUIPE)
    assert construire_visuels({}, cfg) == []
    v = construire_visuels({"include_organigramme": True}, cfg)
    assert [x.section for x in v] == [("partie_a", "organigramme")]
    assert construire_visuels({"include_organigramme": True}, _cfg([], gerant=(None, None))) == []


import shutil
needs_soffice = pytest.mark.skipif(not (shutil.which("soffice") or shutil.which("libreoffice")),
                                   reason="LibreOffice absent de l'environnement")


@needs_soffice
def test_texte_de_l_organigramme_present_dans_le_pdf():
    from services.docx_exporter import build_memoire_docx
    from services.pdf_export import docx_to_pdf
    from services.pdf_lecture import lire_pages

    visuel = org.construire(_cfg(EQUIPE), None, TH)
    pdf = docx_to_pdf(build_memoire_docx({"partie_a": {"organigramme": "Texte."}}, "Projet X", "Entreprise Y",
                                         visuels=[visuel]))
    texte = " ".join(lire_pages(pdf))
    for attendu in ("Julien Marchal", "Conductrice de travaux", "Karim Benali", "Inès Carvalho", "Fonction support"):
        assert attendu in texte
