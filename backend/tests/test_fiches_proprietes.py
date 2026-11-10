"""Mission finale DOCUMENTS (10/11/2026) — la fiche est celle de l'entreprise : jamais « Synorix » comme auteur,
langue française dans le fichier (Word : valeurs par défaut ; Excel : propriétés). Données inventées."""
import io
import re
import zipfile

import openpyxl
import pytest
from docx import Document

from services import fiches_donnees as fd
from services import fiches_entreprise as gen
from services import fiches_excel
from tests import fiches_fabrique as fab


@pytest.fixture
def entreprise(db_session):
    org = fab.creer_entreprise(db_session)
    fab.creer_documents(db_session, org.id)
    return org


def _jeu(db, org, rubrique="moyens", sans_nom=False):
    d = fab.donnees(db, org, rubrique)
    if sans_nom:
        d["societe"]["nom"] = ""
    b = fab.bordereau(rubrique)
    return d, b, fd.palette(b["couleur"])


def test_word_auteur_entreprise_et_langue_francaise(db_session, entreprise):
    d, b, pal = _jeu(db_session, entreprise)
    octets = gen.generer_docx(d, b, pal, None)
    cp = Document(io.BytesIO(octets)).core_properties
    assert cp.author == d["societe"]["nom"] and cp.language == "fr-FR"
    styles = zipfile.ZipFile(io.BytesIO(octets)).read("word/styles.xml").decode()
    defauts = re.search(r"<w:docDefaults>.*?</w:docDefaults>", styles, re.S).group(0)
    assert "en-US" not in defauts and 'w:val="fr-FR"' in defauts


def test_sans_raison_sociale_l_auteur_reste_vide_jamais_l_outil(db_session, entreprise):
    d, b, pal = _jeu(db_session, entreprise, sans_nom=True)
    cp = Document(io.BytesIO(gen.generer_docx(d, b, pal, None))).core_properties
    assert cp.author == "" and "synorix" not in (cp.last_modified_by or "").lower()
    wb = openpyxl.load_workbook(io.BytesIO(fiches_excel.generer_xlsx(d, b, pal)))
    assert "synorix" not in (wb.properties.creator or "").lower()
    assert wb.properties.language == "fr-FR"
