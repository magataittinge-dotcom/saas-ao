"""Mission finale DOCUMENTS (10/11/2026) — le mémoire est le document de l'entreprise, remis à l'acheteur.

Avant : propriétés « python-docx », titre vide, langue en-US par défaut ; la page de garde titrait le
surnom donné à l'AO dans l'outil (en capitales) au lieu de l'objet du marché ; en-tête courant vide ;
couleurs de l'outil (bleu saturé, aplats pleins sous texte blanc) ; colonnes étroites qui coupaient
les mots. Contenu inventé.
"""
import io
import re
import zipfile

from docx import Document

from services.docx_exporter import build_memoire_docx, titre_du_marche

CONTENU = {
    "preambule": "Engagement fictif.",
    "partie_a": {"vehicules": (
        "| Type de véhicule | Quantité | Usage |\n|---|---|---|\n"
        "| Fourgon atelier | [À COMPLÉTER : nombre] | Transport du petit matériel |\n"
    )},
    "partie_b": {},
    "partie_c": {"methodologie": "Méthode fictive."},
}
OBJET = "Lot 03 — Couverture zinc — Réhabilitation de la salle des fêtes de Villefictive (99000)"


def _octets(**kw) -> bytes:
    kw.setdefault("objet_marche", OBJET)
    kw.setdefault("lot_name", "Lot 03 — Couverture zinc")
    return build_memoire_docx(CONTENU, "mon ao du mardi", "ENTREPRISE TEST", **kw)


def _xml(octets: bytes, nom: str) -> str:
    return zipfile.ZipFile(io.BytesIO(octets)).read(nom).decode("utf-8")


def test_titre_du_marche_sans_le_lot_et_repli_sur_le_nom():
    assert titre_du_marche(OBJET, "Lot 03 — Couverture zinc", "x") == \
        "Réhabilitation de la salle des fêtes de Villefictive (99000)"
    assert titre_du_marche("Réfection de voirie", None, "x") == "Réfection de voirie"
    assert titre_du_marche(None, None, "mon ao") == "mon ao"
    assert titre_du_marche("  ", "Lot 1", "mon ao") == "mon ao"


def test_proprietes_du_fichier_au_nom_de_l_entreprise_et_en_francais():
    octets = _octets()
    cp = Document(io.BytesIO(octets)).core_properties
    assert cp.author == "ENTREPRISE TEST"
    assert cp.last_modified_by == "ENTREPRISE TEST"
    assert cp.title.startswith("Mémoire technique")
    assert "Villefictive" in cp.title and "Lot 03" in cp.title
    assert cp.language == "fr-FR"
    defauts = re.search(r"<w:docDefaults>.*?</w:docDefaults>", _xml(octets, "word/styles.xml"), re.S).group(0)
    assert 'w:val="fr-FR"' in defauts and "en-US" not in defauts


def test_proprietes_sans_raison_sociale_jamais_python_docx():
    cp = Document(io.BytesIO(build_memoire_docx(CONTENU, "x", "", objet_marche=OBJET))).core_properties
    assert cp.author == "" and "python" not in (cp.last_modified_by or "").lower()


def test_page_de_garde_titre_l_objet_du_marche_pas_le_surnom():
    textes = [p.text for p in Document(io.BytesIO(_octets())).paragraphs[:20]]
    assert "Réhabilitation de la salle des fêtes de Villefictive (99000)" in textes
    assert not any("MON AO DU MARDI" in t or "mon ao du mardi" in t for t in textes)


def test_en_tete_courant_dit_le_marche_et_l_entreprise():
    doc = Document(io.BytesIO(_octets()))
    entete = doc.sections[0].header.paragraphs[0].text
    assert "Villefictive" in entete and "ENTREPRISE TEST" in entete
    assert doc.sections[0].first_page_header.paragraphs[0].text == ""


def test_couleurs_sobres_et_en_tetes_de_tableau_imprimables():
    octets = _octets()
    tout = _xml(octets, "word/document.xml") + _xml(octets, "word/styles.xml")
    for bleu in ("1E40AF", "1D4ED8", "0369A1"):
        assert bleu not in tout.upper(), bleu
    # en-tête de tableau : fond clair (jamais un aplat foncé sous texte blanc)
    fonds = set(re.findall(r'w:fill="([0-9A-Fa-f]{6})"', _xml(octets, "word/document.xml")))
    for f in fonds:
        r, g, b = (int(f[i:i + 2], 16) for i in (0, 2, 4))
        assert 0.2126 * r + 0.7152 * g + 0.0722 * b > 200, f
    assert 'w:color w:val="FFFFFF"' not in _xml(octets, "word/document.xml").upper().replace("W:VAL", "w:val")


def test_colonne_courte_assez_large_pour_ne_pas_couper_a_completer():
    doc = Document(io.BytesIO(_octets()))
    t = doc.tables[0]
    largeur_quantite_cm = t.columns[1].width / 360000
    # « À compléter : nombre » : « compléter » (9 signes en 9,5 pt) tient sur une ligne
    assert largeur_quantite_cm >= 2.2, largeur_quantite_cm
