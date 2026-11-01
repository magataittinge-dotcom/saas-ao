"""Fiches « Mon entreprise » (T3) : le Word et le PDF générés sont OUVERTS et vérifiés.

Word : python-docx rouvre le fichier (bandeau, tuiles, sections numérotées, tableau des références avec sa ligne
TOTAL, pied de page et champs « Page n / N »). PDF : pypdfium2 rouvre le fichier (nombre de pages, textes clés)
après conversion par LibreOffice isolé. Données inventées (tests/fiches_fabrique.py).
"""
import io
import zipfile

import pypdfium2 as pdfium
import pytest
from docx import Document
from docx.oxml.ns import qn
from PIL import Image

from services import fiches_entreprise as gen
from services import fiches_donnees as fd
from services.libreoffice_isole import soffice_available
from tests import fiches_fabrique as fab
from tests.test_fiches_entreprise import _se_connecter_comme, deux_entreprises  # noqa: F401  (fixture)

BASE = "/api/entreprise/fiches"
pdf_requis = pytest.mark.skipif(not soffice_available(), reason="LibreOffice (soffice) absent de cet environnement")


@pytest.fixture
def entreprise(db_session):
    org = fab.creer_entreprise(db_session)
    fab.creer_documents(db_session, org.id)
    return org


def _docx(db, org, rubrique, *, logo=None, **surcharges):
    d = fab.donnees(db, org, rubrique)
    b = fab.bordereau(rubrique, **surcharges)
    return gen.generer_docx(d, b, fd.palette(b["couleur"]), logo), d, b


def _textes(octets: bytes) -> str:
    doc = Document(io.BytesIO(octets))

    def _paragraphes(element):
        return " ".join("".join(t.text or "" for t in p.iter(qn("w:t"))) for p in element.iter(qn("w:p")))
    return _paragraphes(doc.element.body) + " || " + _paragraphes(doc.sections[0].footer._element)


def _logo_png() -> bytes:
    sortie = io.BytesIO()
    Image.new("RGBA", (400, 160), (200, 40, 40, 255)).save(sortie, "PNG")
    return sortie.getvalue()


# ─── Word : Moyens ─────────────────────────────────────────────────────────────

def test_word_moyens_bandeau_tuiles_sections_et_pied(db_session, entreprise):
    octets, d, b = _docx(db_session, entreprise, "moyens")
    doc = Document(io.BytesIO(octets))
    # A4, une seule section.
    assert round(doc.sections[0].page_width.cm, 1) == 21.0 and round(doc.sections[0].page_height.cm, 1) == 29.7
    # Bandeau : 1re table, 2 cellules ; titre en capitales, sous-titre et contact à droite.
    bandeau = doc.tables[0]
    assert len(bandeau.rows) == 1 and len(bandeau.rows[0].cells) == 2
    droite = bandeau.rows[0].cells[1].text
    assert "MOYENS DE L'ENTREPRISE" in droite and "Dossier entreprise · novembre 2026" in droite
    assert "contact@lambert-maconnerie.example" in droite
    assert "Lambert Maçonnerie" in bandeau.rows[0].cells[0].text            # sans logo : le nom, jamais une image cassée
    assert "w:drawing" not in bandeau._tbl.xml
    # Fond sombre dérivé de l'accent (#008cf8) ; filet d'accent sous le bandeau.
    assert fd.palette("#008cf8")["bandeau"].lstrip("#").upper() in bandeau._tbl.xml
    # Tuiles : 4 cellules, chiffre puis libellé en capitales.
    tuiles = doc.tables[1]
    assert [c.paragraphs[0].text for c in tuiles.rows[0].cells] == [t["valeur"] for t in d["tuiles"]]
    assert [c.paragraphs[1].text for c in tuiles.rows[0].cells] == [t["libelle"].upper() for t in d["tuiles"]]
    assert [t["valeur"] for t in d["tuiles"]] == ["12", "4", "4", "9"]
    # Activités et zone d'intervention sous les tuiles.
    cles = doc.tables[2]
    assert [r.cells[0].text for r in cles.rows] == ["ACTIVITÉS", "ZONE D'INTERVENTION"]
    # Sections numérotées 01 à 07, en deux colonnes.
    grille = doc.tables[3]
    assert len(grille.rows) == 4 and all(len(r.cells) == 2 for r in grille.rows)
    titres = [c.paragraphs[0].text for r in grille.rows for c in r.cells if c.paragraphs[0].text]
    assert titres == ["01  MOYENS HUMAINS", "02  MOYENS INFORMATIQUES", "03  MATÉRIEL", "04  VÉHICULES",
                      "05  SÉCURITÉ ET PREMIERS SECOURS", "06  QUALITÉ ET ENVIRONNEMENT", "07  DOCUMENTS SUR DEMANDE"]
    materiel = grille.rows[1].cells[0].text
    assert "700 m²\tÉchafaudage de façade" in materiel or "700 m²" in materiel
    assert "Bétonnières" in materiel
    # Aucune pièce d'identité d'un salarié autre que les postes clés saisis.
    assert "Jean Moreau" in grille.rows[0].cells[0].text
    # Pied : identité de l'entreprise, puis « Page n / N » avec de vrais champs.
    pied = doc.sections[0].footer
    assert pied.paragraphs[0].text == d["pied"]
    assert pied.paragraphs[0].text.startswith("Lambert Maçonnerie · SAS · SIRET 12345678900019 · 12 avenue du Port")
    assert pied.paragraphs[1].text.startswith("Page ") and " / " in pied.paragraphs[1].text
    champs = [e.text.strip() for e in pied._element.iter(qn("w:instrText"))]
    assert champs == ["PAGE", "NUMPAGES"]
    # Propriétés : le titre de la fiche, l'entreprise comme auteur (jamais « python-docx »).
    assert doc.core_properties.title == "MOYENS DE L'ENTREPRISE" and "python-docx" not in doc.core_properties.author


def test_word_logo_dans_le_bandeau(db_session, entreprise):
    octets, _, _ = _docx(db_session, entreprise, "moyens", logo=_logo_png())
    doc = Document(io.BytesIO(octets))
    assert "w:drawing" in doc.tables[0]._tbl.xml
    with zipfile.ZipFile(io.BytesIO(octets)) as z:
        medias = [n for n in z.namelist() if n.startswith("word/media/")]
    assert len(medias) == 1 and medias[0].endswith(".png")
    # Pas de nom d'entreprise en doublon quand le logo est là.
    assert doc.tables[0].rows[0].cells[0].text.strip() == ""


def test_word_lignes_libres_dans_leur_section(db_session, entreprise):
    libres = [{"section": "03", "libelle": "1", "valeur": "Grue mobile de 30 tonnes"},
              {"section": "07", "libelle": "Assurance", "valeur": "Attestation sur demande"}]
    octets, _, _ = _docx(db_session, entreprise, "moyens", lignes_libres=libres)
    grille = Document(io.BytesIO(octets)).tables[3]
    assert "Grue mobile de 30 tonnes" in grille.rows[1].cells[0].text            # section 03
    assert "Attestation sur demande" in grille.rows[3].cells[0].text             # section 07
    assert "Grue mobile" not in grille.rows[1].cells[1].text


def test_word_section_sans_donnee_imprime_precisions_sur_demande(db_session, entreprise):
    d = fab.donnees(db_session, entreprise, "moyens", cfg=type("C", (), {})())
    b = fab.bordereau("moyens")
    texte = _textes(gen.generer_docx(d, b, fd.palette(b["couleur"])))
    assert "Précisions sur demande" in texte
    for mot in ("manquant", "incomplet", "absent"):
        assert mot not in texte.lower()


def test_word_caracteres_de_controle_et_xml_ne_cassent_pas(db_session, entreprise):
    entreprise.name = "Dupont <&> \x00Maçonnerie\x08"
    d = fab.donnees(db_session, entreprise, "moyens", cfg=type("C", (), {"nom_entreprise": None})())
    b = fab.bordereau("moyens", titre="Titre \x0b<b>gras</b>", contact="a&b@example.com")
    octets = gen.generer_docx(d, b, fd.palette(b["couleur"]))
    texte = _textes(octets)
    assert "Dupont <&> Maçonnerie" in texte and "<b>gras</b>" in texte.replace("TITRE ", "titre ").lower() or "<B>GRAS</B>" in texte
    assert "\x00" not in texte and "\x08" not in texte


# ─── Word : Références et certifications ───────────────────────────────────────

def test_word_references_tableau_total_note_et_sections(db_session, entreprise):
    octets, d, _ = _docx(db_session, entreprise, "certifications")
    doc = Document(io.BytesIO(octets))
    tuiles = doc.tables[1]
    assert [c.paragraphs[0].text for c in tuiles.rows[0].cells] == ["20", "1 037 825 € HT", "8", "6"]
    tableau = doc.tables[2]
    assert len(tableau.rows) == 1 + 20 + 1                                   # en-tête, 20 chantiers, TOTAL
    entete = [c.text for c in tableau.rows[0].cells]
    assert entete == ["N°", "CLIENT / DONNEUR D'ORDRE", "INTERVENTION", "CHANTIER ET TRAVAUX RÉALISÉS", "MONTANT HT"]
    assert "w:tblHeader" in tableau.rows[0]._tr.xml                          # en-tête répété à chaque page
    premiere = tableau.rows[1].cells
    assert premiere[0].text == "01" and premiere[1].text == "Ville de Reims"
    assert premiere[2].text.strip() == "EN DIRECT" and premiere[4].text == "18 000 € HT"
    assert tableau.rows[2].cells[2].text.strip() == "SOUS-TRAITANCE"
    particulier = next(r for r in tableau.rows[1:-1] if "Mme Dubois" in r.cells[1].text)
    assert "PARTICULIER" in particulier.cells[1].text and "4 rue des Roses" in particulier.cells[1].text
    total = tableau.rows[-1]
    assert "TOTAL" in total.cells[0].text and "20 chantiers" in total.cells[0].text
    assert "dont 8 en sous-traitance" in total.cells[0].text
    assert total.cells[-1].text == "1 037 825 € HT"
    # La note suit le tableau.
    texte = _textes(octets)
    assert "Montants exprimés en euros hors taxes" in texte and "« sous-traitance »" in texte
    # Qualifications, assurances, habilitations avec leur validité.
    assert "QUALIFICATIONS ET LABELS" in texte and "Qualibat" in texte and "valable jusqu'au" in texte
    assert "Assurance décennale" in texte and "À renouveler avant le 21/11/2026" in texte
    assert "Sauveteurs secouristes du travail (SST)" in texte and "4 personnes" in texte
    # Le total du tableau est la somme des lignes.
    assert d["references"]["total"]["montant"] == "1 037 825 € HT"
    assert sum(float(r.montant_ht) for r in fab.references_0029(20)) == 1037825.0


def test_word_identite(db_session, entreprise):
    octets, d, _ = _docx(db_session, entreprise, "identite")
    texte = _textes(octets)
    for attendu in ("FICHE ENTREPRISE", "01  IDENTITÉ DE L'ENTREPRISE", "02  DIRIGEANT ET CONTACTS", "03  CHIFFRES",
                    "04  ACTIVITÉS ET ZONE D'INTERVENTION", "Camille Lambert", "SAS", "4399C", "Reims", "2009",
                    "1 640 000 € HT", "effectif moyen 12", "Gros œuvre et maçonnerie"):
        assert attendu in texte, attendu
    assert [t["libelle"] for t in d["tuiles"]] == ["effectif moyen", "CA HT 2025", "création", "chantiers référencés"]


# ─── PDF ───────────────────────────────────────────────────────────────────────

def _c(texte: str) -> str:
    """Sans espaces : le texte d'un PDF en capitales espacées sort lettre par lettre (« M O Y E N S »)."""
    return "".join(texte.split()).replace("\u00a0", "").replace("\u202f", "")


def _pdf(octets: bytes):
    doc = pdfium.PdfDocument(octets)
    textes = [doc[i].get_textpage().get_text_range() for i in range(len(doc))]
    return doc, textes


@pdf_requis
def test_pdf_moyens_une_page(db_session, entreprise):
    octets, _, _ = _docx(db_session, entreprise, "moyens", logo=_logo_png())
    pdf = gen.generer_pdf(octets)
    assert pdf[:5] == b"%PDF-"
    doc, textes = _pdf(pdf)
    assert len(doc) == 1
    t = textes[0]
    for attendu in ("MOYENS DE L'ENTREPRISE", "Dossier entreprise", "ACTIVITÉS", "ZONE D'INTERVENTION",
                    "MOYENS HUMAINS", "MATÉRIEL", "VÉHICULES", "DOCUMENTS SUR DEMANDE", "Page 1 / 1",
                    "12", "CHEFS D'ÉQUIPE", "Bétonnières", "SIRET 12345678900019"):
        assert _c(attendu) in _c(t), attendu
    assert len(pdf) < 300_000


@pdf_requis
def test_pdf_references_deux_pages_total_et_entete_repete(db_session, entreprise):
    octets, _, _ = _docx(db_session, entreprise, "certifications")
    pdf = gen.generer_pdf(octets)
    doc, textes = _pdf(pdf)
    assert len(doc) == 2 == fd.pages_estimees("certifications", fab.donnees(db_session, entreprise, "certifications"))
    assert "Page 1 / 2" in textes[0] and "Page 2 / 2" in textes[1]
    assert _c("CHANTIER ET TRAVAUX RÉALISÉS") in _c(textes[0]) and _c("CHANTIER ET TRAVAUX RÉALISÉS") in _c(textes[1])
    assert _c("TOTAL") in _c(textes[1]) and "20chantiers" in _c(textes[1]) and "1037825" in _c(textes[1])
    assert "Opération01" in _c(textes[0]) and "Opération20" in _c(textes[1])
    assert _c("SOUS-TRAITANCE") in _c(textes[0]) and "PARTICULIER" in _c("".join(textes))
    assert _c("Montants exprimés en euros hors taxes") in _c(textes[1])
    assert len(pdf) < 400_000


@pdf_requis
def test_pdf_identite_une_page(db_session, entreprise):
    pdf = gen.generer_pdf(_docx(db_session, entreprise, "identite")[0])
    doc, textes = _pdf(pdf)
    assert len(doc) == 1 and _c("FICHE ENTREPRISE") in _c(textes[0]) and "CamilleLambert" in _c(textes[0])


# ─── Route de génération ───────────────────────────────────────────────────────

def test_route_generer_word(client, deux_entreprises):
    r = client.post(f"{BASE}/moyens/generer?format=docx")
    assert r.status_code == 200
    assert r.headers["content-type"] == gen.TYPE_DOCX
    assert 'filename="Fiche_entreprise_moyens_Lambert_Maconnerie.docx"' in r.headers["content-disposition"]
    assert r.headers["cache-control"] == "private, no-store"
    texte = _textes(r.content)
    assert "MOYENS DE L'ENTREPRISE" in texte and "Lambert Maçonnerie" in texte and "Camille Martin" in texte


def test_route_generer_utilise_le_bordereau_enregistre(client, deux_entreprises):
    client.put(f"{BASE}/moyens", json={
        "titre": "Nos moyens 2026", "sous_titre": "Édition spéciale", "contact": "bureau@lambert.example",
        "couleur": "#aa3300", "lignes_libres": [{"section": "04", "libelle": "2", "valeur": "Camions grue"}]})
    r = client.post(f"{BASE}/moyens/generer?format=docx")
    doc = Document(io.BytesIO(r.content))
    droite = doc.tables[0].rows[0].cells[1].text
    assert "NOS MOYENS 2026" in droite and "Édition spéciale" in droite and "bureau@lambert.example" in droite
    assert fd.palette("#aa3300")["bandeau"].lstrip("#").upper() in doc.tables[0]._tbl.xml
    assert "Camions grue" in _textes(r.content)


def test_route_generer_avec_le_logo_de_la_fiche(client, deux_entreprises, tmp_path, monkeypatch):
    from routers import file_serve
    from services import file_storage
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(file_serve, "UPLOADS_ROOT", tmp_path)
    assert client.post(f"{BASE}/moyens/logo", files={"file": ("l.png", _logo_png(), "image/png")}).status_code == 200
    r = client.post(f"{BASE}/moyens/generer?format=docx")
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        assert [n for n in z.namelist() if n.startswith("word/media/")] and not any(
            n.endswith(".webp") for n in z.namelist())                      # PNG dans le Word (le WebP n'y est pas lu)


def test_route_parametres_invalides(client, deux_entreprises):
    assert client.post(f"{BASE}/moyens/generer?format=odt").status_code == 422
    assert client.post(f"{BASE}/inconnue/generer?format=docx").status_code == 404
    assert client.get(f"{BASE}/moyens/generer").status_code == 405


def test_route_generer_refuse_les_pdf_sans_libreoffice(client, deux_entreprises, monkeypatch):
    monkeypatch.setattr(gen, "soffice_available", lambda: False)
    r = client.post(f"{BASE}/moyens/generer?format=pdf")
    assert r.status_code == 503 and "Word" in r.json()["detail"]


def test_route_generer_pdf_echec_de_conversion_503_et_reessai(client, deux_entreprises, monkeypatch):
    monkeypatch.setattr(gen, "soffice_available", lambda: True)

    def _echec(_docx):
        raise gen.PdfConversionError("Conversion occupée, réessayez dans un instant.", "attente")
    monkeypatch.setattr(gen, "generer_pdf", _echec)
    r = client.post(f"{BASE}/moyens/generer?format=pdf")
    assert r.status_code == 503 and r.headers["retry-after"] == "15"


@pdf_requis
def test_route_generer_pdf(client, deux_entreprises):
    r = client.post(f"{BASE}/certifications/generer?format=pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content[:5] == b"%PDF-"
    doc, textes = _pdf(r.content)
    t = " ".join(textes)
    assert _c("Groupe scolaire Jean Moulin") in _c(t) and "TOTAL" in _c(t) and "2chantiers" in _c(t)


def test_cross_org_la_fiche_generee_ne_contient_que_les_donnees_de_l_utilisateur(client, deux_entreprises):
    a = _textes(client.post(f"{BASE}/certifications/generer?format=docx").content)
    a_moyens = _textes(client.post(f"{BASE}/moyens/generer?format=docx").content)
    _se_connecter_comme("user-b", "org-b")
    b = _textes(client.post(f"{BASE}/certifications/generer?format=docx").content)
    b_moyens = _textes(client.post(f"{BASE}/moyens/generer?format=docx").content)
    assert "Groupe scolaire" in a and "Chantier confidentiel de B" not in a and "Client de B" not in a
    assert "Chantier confidentiel de B" in b and "Groupe scolaire" not in b and "Habitat Marne" not in b
    assert "Secret B" in b_moyens and "Secret de B" in b_moyens
    assert "Secret B" not in a_moyens and "Camille Martin" in a_moyens and "Camille Martin" not in b_moyens
    assert "Salarié de B" in b_moyens and "Salarié de B" not in a_moyens


def test_cross_org_le_bordereau_de_a_n_apparait_pas_chez_b(client, deux_entreprises):
    client.put(f"{BASE}/moyens", json={"titre": "TITRE CONFIDENTIEL DE A", "contact": "a@secret.example"})
    _se_connecter_comme("user-b", "org-b")
    b = _textes(client.post(f"{BASE}/moyens/generer?format=docx").content)
    assert "CONFIDENTIEL" not in b and "a@secret.example" not in b and "MOYENS DE L'ENTREPRISE" in b


def test_cross_org_le_logo_de_a_n_est_pas_dans_le_word_de_b(client, deux_entreprises, tmp_path, monkeypatch):
    from routers import file_serve
    from services import file_storage
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(file_serve, "UPLOADS_ROOT", tmp_path)
    client.post(f"{BASE}/moyens/logo", files={"file": ("l.png", _logo_png(), "image/png")})
    _se_connecter_comme("user-b", "org-b")
    with zipfile.ZipFile(io.BytesIO(client.post(f"{BASE}/moyens/generer?format=docx").content)) as z:
        assert not [n for n in z.namelist() if n.startswith("word/media/")]


def test_generation_debit_limite(client, deux_entreprises):
    from services.rate_limit import limiter
    limiter.enabled = True
    try:
        limiter.reset()
        codes = [client.post(f"{BASE}/moyens/generer?format=docx").status_code for _ in range(12)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:10] == [200] * 10 and 429 in codes[10:]
