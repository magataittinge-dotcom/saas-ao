"""Dépôt par rubrique — revue de sécurité du coordinateur : anciens formats OLE2 refusés, paquets OOXML qui portent une
macro, un contrôle ActiveX, un objet OLE embarqué ou un modèle externe refusés ; documents sains acceptés.
Tous les fichiers sont fabriqués ici."""
import io
import zipfile

import pytest

from models.document import Document
from tests import depot_fabrique as fab
from tests.depot_fabrique import coffre, deposer, modele  # noqa: F401

MESSAGE = "Enregistrez le fichier au format .docx (ou .xlsx) puis redéposez-le."
OLE2 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512


@pytest.fixture(autouse=True)
def _modele_vide(modele):
    modele({})


def _docx_avec(parties: dict, types: str = "<Types/>", doc_rels: str | None = None) -> bytes:
    """Un .docx minimal valide, plus les parties données (nom -> contenu)."""
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("word/document.xml", "<w:document/>")
        if doc_rels is not None:
            z.writestr("word/_rels/document.xml.rels", doc_rels)
        for nom, contenu in parties.items():
            z.writestr(nom, contenu)
    return flux.getvalue()


def _rels(type_: str, cible: str, externe: bool = True) -> str:
    mode = ' TargetMode="External"' if externe else ""
    return ('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{type_}" '
            f'Target="{cible}"{mode}/></Relationships>')


def _refuse(client, db, case, nom, contenu, message=None):
    res = deposer(client, case, (nom, contenu)).json()["resultats"][0]
    assert res["accepte"] is False and res["statut"] == 415, res
    if message:
        assert res["detail"] == message
    assert db.query(Document).count() == 0


@pytest.mark.parametrize("nom", ["ancienne.doc", "ancien.xls"])
def test_anciens_formats_ole2_refuses(client, coffre, db_session, nom):
    _refuse(client, db_session, "fiche_moyens", nom, OLE2, MESSAGE)


def test_doc_qui_est_un_zip_ooxml_refuse_sans_requalification(client, coffre, db_session):
    _refuse(client, db_session, "fiche_moyens", "fiche.doc", fab.docx("Texte sain"), MESSAGE)
    _refuse(client, db_session, "materiel", "liste.xls", fab.xlsx({"A": [[1]]}), MESSAGE)


@pytest.mark.parametrize("nom,contenu", [
    ("macro", {"word/vbaProject.bin": b"\xd0\xcf\x11\xe0"}),
    ("activex", {"word/activeX/activeX1.xml": "<ax/>", "word/activeX/activeX1.bin": b"x"}),
    ("objet_ole", {"word/embeddings/oleObject1.bin": b"\xd0\xcf\x11\xe0"}),
])
def test_docx_avec_macro_activex_ou_objet_ole_refuse(client, coffre, db_session, nom, contenu):
    _refuse(client, db_session, "fiche_moyens", "fiche.docx", _docx_avec(contenu))


def test_xlsx_avec_macro_refuse(client, coffre, db_session):
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("xl/workbook.xml", "<workbook/>")
        z.writestr("xl/vbaProject.bin", b"\xd0\xcf\x11\xe0")
    _refuse(client, db_session, "materiel", "liste.xlsx", flux.getvalue())


@pytest.mark.parametrize("type_,cible", [
    ("attachedTemplate", "https://exemple.invalid/modele.dotm"),
    ("attachedTemplate", "file:///C:/modeles/normal.dotm"),
    ("oleObject", "https://exemple.invalid/objet"),
    ("image", "https://exemple.invalid/pixel.png"),
])
def test_docx_avec_relation_externe_dangereuse_refuse(client, coffre, db_session, type_, cible):
    _refuse(client, db_session, "fiche_moyens", "fiche.docx", _docx_avec({}, doc_rels=_rels(type_, cible)))


def test_docx_declare_avec_macros_dans_ses_types_refuse(client, coffre, db_session):
    types = '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>'
    _refuse(client, db_session, "fiche_moyens", "fiche.docx", _docx_avec({}, types=types))


def test_docm_et_xlsm_refuses(client, coffre, db_session):
    _refuse(client, db_session, "fiche_moyens", "fiche.docm", _docx_avec({}))
    _refuse(client, db_session, "materiel", "liste.xlsm", fab.xlsx({"A": [[1]]}))


def test_documents_sains_acceptes_lien_hypertexte_compris(client, coffre, db_session):
    res = deposer(client, "fiche_moyens",
                  ("sain.docx", fab.docx("Texte sain")),
                  ("avec-lien.docx", _docx_avec({}, doc_rels=_rels("hyperlink", "https://www.synorix.example/")))).json()["resultats"]
    assert [r["accepte"] for r in res] == [True, True]
    res = deposer(client, "materiel", ("sain.xlsx", fab.xlsx({"A": [["Quantité", "Désignation"], [2, "Nacelle"]]}))).json()["resultats"]
    assert res[0]["accepte"] is True
