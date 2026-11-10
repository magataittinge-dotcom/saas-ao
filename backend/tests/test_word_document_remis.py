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


def test_sommaire_lie_a_ses_titres_par_des_signets():
    """Chaque ligne du sommaire est un lien interne vers un signet posé sur son titre (PDF cliquable)."""
    xml = _xml(_octets(), "word/document.xml")
    ancres = re.findall(r'<w:hyperlink [^>]*w:anchor="([^"]+)"', xml)
    signets = set(re.findall(r'<w:bookmarkStart [^>]*w:name="([^"]+)"', xml))
    assert len(ancres) >= 3                       # préambule, partie A, une section… (titres 1 et 2)
    assert all(a in signets for a in ancres)


def test_pdf_sommaire_cliquable_et_numerote(tmp_path):
    import shutil

    import pytest
    if not (shutil.which("soffice") or shutil.which("libreoffice")):
        pytest.skip("LibreOffice absent")
    from pypdf import PdfReader

    from services.pdf_export import docx_to_pdf
    pdf = docx_to_pdf(_octets())
    lecteur = PdfReader(io.BytesIO(pdf))
    liens = [a.get_object() for p in lecteur.pages for a in (p.get("/Annots") or [])
             if a.get_object().get("/Subtype") == "/Link"]
    assert len(liens) >= 3
    sommaire = lecteur.pages[1].extract_text()
    assert re.search(r"PRÉAMBULE\W+3", sommaire), sommaire[:400]


def test_tableau_des_visuels_en_tete_claire_et_trait_de_couleur():
    """Tableau posé par les visuels (références) : fond clair, texte foncé, la couleur de l'entreprise
    en trait sous l'en-tête — plus d'aplat plein sous texte blanc."""
    from docx import Document as Nouveau

    from services.visuels.word import ajouter_tableau
    doc = Nouveau()
    ajouter_tableau(doc, {"entetes": ["Année", "Chantier"], "lignes": [["2024", "Halle fictive"]],
                          "largeurs_cm": [3, 14], "couleur": "#7A1F2B"})
    xml = doc.tables[0]._tbl.xml
    assert 'w:fill="7A1F2B"' not in xml
    assert 'w:color="7A1F2B"' in xml                       # le trait sous l'en-tête
    assert 'w:val="FFFFFF"' not in xml.upper().replace("W:VAL", "w:val")


def test_figures_sans_logo_en_encre_neutre_pas_au_bleu_de_l_outil():
    """Sans logo (donc sans couleur d'entreprise), organigramme, planning et moyens sortent en encre
    neutre : le dossier est celui de l'entreprise, pas une publicité pour l'outil."""
    from services.visuels.couleurs import ACCENT_PAR_DEFAUT, Theme, contraste
    r, g, b = (int(ACCENT_PAR_DEFAUT[i:i + 2], 16) for i in (1, 3, 5))
    assert max(r, g, b) - min(r, g, b) <= 40, ACCENT_PAR_DEFAUT          # un gris, pas une teinte
    assert contraste(Theme().accent, "#FFFFFF") >= 4.5


def test_ni_veuve_ni_orpheline_par_defaut():
    """Le modèle python-docx ne pose pas `widowControl` : sans lui, Word et LibreOffice laissent une ligne
    seule en haut ou en bas de page. Posé dans les valeurs par défaut du document (tous les styles)."""
    defauts = re.search(r"<w:docDefaults>.*?</w:docDefaults>", _xml(_octets(), "word/styles.xml"), re.S).group(0)
    assert "<w:widowControl/>" in defauts or '<w:widowControl w:val="1"/>' in defauts


def test_une_seule_carte_de_moyens_ne_prend_pas_toute_la_largeur():
    """Une carte seule (« 4 ouvriers ») ne s'étire plus sur 17 cm comme une carte de tableau de bord :
    grille fixe de quatre colonnes."""
    from services.visuels import moyens
    from services.visuels.couleurs import Theme
    from services.visuels.svg import LARGEUR_PORTRAIT
    svg, _ = moyens.synoptique_humains([{"role": "Ouvriers dédiés au chantier", "nombre": 4, "noms": []}],
                                       Theme())
    largeurs = [float(w) for w in re.findall(r'<rect x=[^>]*width="([\d.]+)"[^>]*rx=', svg)]   # les cartes (le fond n'a pas de rx)
    assert largeurs and max(largeurs) <= LARGEUR_PORTRAIT / 4 + 1, largeurs


def test_word_telecharge_porte_deja_les_numeros_du_sommaire():
    """Le Word téléchargé a déjà les numéros de page du sommaire (même passe LibreOffice que le PDF) : un
    patron qui refuse « mettre à jour les champs » à l'ouverture ne voit pas un sommaire sans pages."""
    import shutil

    import pytest
    if not (shutil.which("soffice") or shutil.which("libreoffice")):
        pytest.skip("LibreOffice absent")
    from services.pdf_export import docx_numerote
    doc = Document(io.BytesIO(docx_numerote(_octets())))
    lignes = [p.text for p in doc.paragraphs if p.style.name.startswith("TOC")]
    assert lignes and all(re.search(r"\t\d+$", t) for t in lignes), lignes


def test_word_numerote_sans_libreoffice_rend_le_fichier_tel_quel(monkeypatch):
    from services import pdf_export
    monkeypatch.setattr(pdf_export, "soffice_available", lambda: False)
    octets = _octets()
    assert pdf_export.docx_numerote(octets) == octets


def test_pdf_page_de_garde_tient_sur_une_page_avec_logo_et_long_objet():
    """Pire cas de la page de garde composée : logo haut, objet sur trois lignes, adresse et SIRET.
    Tout tient en page 1 ; le sommaire ouvre la page 2."""
    import shutil

    import pytest
    if not (shutil.which("soffice") or shutil.which("libreoffice")):
        pytest.skip("LibreOffice absent")
    from PIL import Image
    from pypdf import PdfReader

    from services.pdf_export import docx_to_pdf
    tampon = io.BytesIO()
    Image.new("RGB", (400, 400), (122, 31, 43)).save(tampon, "PNG")   # logo carré : le plus haut à 4,5 cm
    objet = ("Lot 03 — Couverture zinc — Réhabilitation lourde et extension de la salle des fêtes communale, "
             "du préau et des locaux associatifs de Villefictive-sur-Rivière (99000)")
    pdf = docx_to_pdf(build_memoire_docx(
        CONTENU, "x", "ENTREPRISE TEST", objet_marche=objet, lot_name="Lot 03 — Couverture zinc",
        maitre_ouvrage="Commune de Villefictive", org_address="1 rue Imaginaire, 99000 Villefictive",
        org_siret="00000000000000", logo_image=tampon.getvalue()))
    pages = PdfReader(io.BytesIO(pdf)).pages
    p1 = pages[0].extract_text()
    for attendu in ("Mémoire technique", "Présenté par", "ENTREPRISE TEST", "SIRET 00000000000000"):
        assert attendu in p1, (attendu, p1)
    assert pages[1].extract_text().lstrip().splitlines()[1].startswith("Sommaire") or \
        "Sommaire" in pages[1].extract_text()[:200]
