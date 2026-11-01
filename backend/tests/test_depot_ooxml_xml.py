"""Dépôt par rubrique — 3e point de la revue de sécurité : le contenu actif d'un paquet OOXML se détecte par son TYPE (types
de contenu et relations, analysés comme du XML), pas par une expression régulière ni par un nom de dossier ; les noms en double
(casse comprise) sont refusés ; chaque partie est lue par son propre ZipInfo. Fichiers fabriqués ici."""
import io
import zipfile

import pytest

from models.document import Document
from tests import depot_fabrique as fab
from tests.depot_fabrique import coffre, deposer, modele  # noqa: F401

NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
TYPES_OK = ('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/></Types>')


@pytest.fixture(autouse=True)
def _modele_vide(modele):
    modele({})


def _docx(parties=None, types=TYPES_OK, rels=None, doublon=None) -> bytes:
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("word/document.xml", "<w:document/>")
        if rels is not None:
            z.writestr("word/_rels/document.xml.rels", rels)
        for nom, contenu in (parties or {}).items():
            z.writestr(nom, contenu)
        if doublon:
            z.writestr(doublon, "<x/>")
    return flux.getvalue()


def _rel(type_: str, cible: str = "x.bin", externe: bool = False, guillemet: str = '"') -> str:
    q = guillemet
    mode = f" TargetMode={q}External{q}" if externe else ""
    return (f'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"<Relationship Id={q}rId1{q} Type={q}{type_}{q} Target={q}{cible}{q}{mode}/></Relationships>")


def _refuse(client, db, contenu, nom="fiche.docx"):
    res = deposer(client, "fiche_moyens", (nom, contenu)).json()["resultats"][0]
    assert res["accepte"] is False and res["statut"] == 415, res
    assert db.query(Document).count() == 0


@pytest.mark.parametrize("type_", ["vbaProject", "vbaProjectSignature", "control", "activeXControl", "activeXControlBinary",
                                   "oleObject", "package", "aFChunk", "attachedTemplate", "subDocument", "frame", "externalLink"])
def test_type_de_relation_actif_refuse_dans_tous_les_espaces_de_noms(client, coffre, db_session, type_):
    for espace in (NS_REL, "http://schemas.microsoft.com/office/2006/relationships", "http://exemple.invalid/ns"):
        _refuse(client, db_session, _docx(rels=_rel(f"{espace}/{type_}", "interne.bin")))


def test_guillemets_simples_dans_les_rels_ne_contournent_pas_le_controle(client, coffre, db_session):
    _refuse(client, db_session, _docx(rels=_rel(f"{NS_REL}/vbaProject", "vba.bin", guillemet="'")))
    _refuse(client, db_session, _docx(rels=_rel(f"{NS_REL}/image", "https://exemple.invalid/p.png", externe=True, guillemet="'")))


def test_relation_aFChunk_refusee(client, coffre, db_session):
    _refuse(client, db_session, _docx(rels=_rel(f"{NS_REL}/aFChunk", "chunk.html")))


def test_entite_xml_refusee(client, coffre, db_session):
    entite = ('<?xml version="1.0"?><!DOCTYPE r [<!ENTITY e "x">]><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
              f'<Relationship Id="rId1" Type="{NS_REL}/hyperlink" Target="https://exemple.invalid/&e;" TargetMode="External"/></Relationships>')
    _refuse(client, db_session, _docx(rels=entite))
    _refuse(client, db_session, _docx(types='<?xml version="1.0"?><!DOCTYPE t [<!ENTITY e "x">]><Types>&e;</Types>'))


def test_xml_invalide_ou_encodage_illisible_refuse(client, coffre, db_session):
    _refuse(client, db_session, _docx(rels="<Relationships><Relationship"))
    _refuse(client, db_session, _docx(types="<Types><Default"))
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("[Content_Types].xml", b"\xff\xfe\x00<\xff\xff")
        z.writestr("word/document.xml", "<w:document/>")
    _refuse(client, db_session, flux.getvalue())


def test_noms_en_double_refuses_casse_comprise(client, coffre, db_session):
    _refuse(client, db_session, _docx(doublon="WORD/Document.xml"))
    _refuse(client, db_session, _docx(rels=_rel(f"{NS_REL}/hyperlink", "https://a.invalid", externe=True), doublon="word/_rels/DOCUMENT.xml.rels"))


@pytest.mark.parametrize("type_contenu", [
    "application/vnd.ms-office.activeX+xml", "application/vnd.ms-office.vbaProject",
    "application/vnd.openxmlformats-officedocument.oleObject", "application/vnd.ms-word.document.macroEnabled.main+xml",
    "application/vnd.ms-office.VBAPROJECT"])
def test_contenu_actif_declare_par_son_type_dans_un_dossier_anodin(client, coffre, db_session, type_contenu):
    types = ('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             f'<Override PartName="/word/theme/tout-va-bien.xml" ContentType="{type_contenu}"/></Types>')
    _refuse(client, db_session, _docx(parties={"word/theme/tout-va-bien.xml": "<a/>"}, types=types))
    par_defaut = ('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                  f'<Default Extension="dat" ContentType="{type_contenu}"/></Types>')
    _refuse(client, db_session, _docx(parties={"word/media/image9.dat": b"x"}, types=par_defaut))


def test_externe_hors_hyperlink_refuse_hyperlink_externe_accepte(client, coffre, db_session):
    _refuse(client, db_session, _docx(rels=_rel(f"{NS_REL}/image", "https://exemple.invalid/p.png", externe=True)))
    ok = deposer(client, "fiche_moyens",
                 ("lien.docx", _docx(rels=_rel(f"{NS_REL}/hyperlink", "https://www.synorix.example/", externe=True))),
                 ("sain.docx", fab.docx("Texte sain"))).json()["resultats"]
    assert [r["accepte"] for r in ok] == [True, True]
    assert deposer(client, "materiel", ("sain.xlsx", fab.xlsx({"A": [["Quantité", "Désignation"], [2, "Nacelle"]]}))).json()["resultats"][0]["accepte"]


def test_les_verifications_par_nom_restent_un_filet(client, coffre, db_session):
    _refuse(client, db_session, _docx(parties={"word/vbaProject.bin": b"x"}))
    _refuse(client, db_session, _docx(parties={"word/activeX/a1.xml": "<a/>"}))
    _refuse(client, db_session, _docx(parties={"word/embeddings/oleObject1.bin": b"x"}))


# ── 5e point : feuilles de macros Excel 4.0 (XLM) et feuilles de dialogue ────

def _xlsx(types=TYPES_OK, rels=None, parties=None) -> bytes:
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("xl/workbook.xml", "<workbook/>")
        if rels is not None:
            z.writestr("xl/_rels/workbook.xml.rels", rels)
        for nom, contenu in (parties or {}).items():
            z.writestr(nom, contenu)
    return flux.getvalue()


@pytest.mark.parametrize("type_contenu", [
    "application/vnd.ms-excel.macrosheet+xml", "application/vnd.ms-excel.intlmacrosheet+xml",
    "application/vnd.ms-excel.dialogsheet+xml", "application/vnd.ms-excel.MacroSheet+xml"])
def test_xlsx_avec_feuille_de_macros_xlm_ou_de_dialogue_refuse_par_son_type_de_contenu(client, coffre, db_session, type_contenu):
    types = ('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             f'<Override PartName="/xl/feuilles/s1.xml" ContentType="{type_contenu}"/></Types>')
    res = deposer(client, "materiel", ("liste.xlsx", _xlsx(types=types, parties={"xl/feuilles/s1.xml": "<a/>"}))).json()["resultats"][0]
    assert res["accepte"] is False and res["statut"] == 415 and db_session.query(Document).count() == 0


@pytest.mark.parametrize("type_", ["xlMacrosheet", "xlIntlMacrosheet", "dialogsheet"])
def test_xlsx_avec_relation_vers_une_feuille_de_macros_refuse(client, coffre, db_session, type_):
    res = deposer(client, "materiel", ("liste.xlsx", _xlsx(rels=_rel(f"{NS_REL}/{type_}", "feuilles/s1.xml")))).json()["resultats"][0]
    assert res["accepte"] is False and res["statut"] == 415 and db_session.query(Document).count() == 0


@pytest.mark.parametrize("dossier", ["xl/macrosheets/s1.xml", "xl/dialogsheets/s1.xml"])
def test_filet_par_nom_pour_les_feuilles_de_macros(client, coffre, db_session, dossier):
    res = deposer(client, "materiel", ("liste.xlsx", _xlsx(parties={dossier: "<a/>"}))).json()["resultats"][0]
    assert res["accepte"] is False and res["statut"] == 415


def test_xlsx_sain_accepte_apres_ce_durcissement(client, coffre, db_session):
    res = deposer(client, "materiel", ("sain.xlsx", fab.xlsx({"Matériel": [["Quantité", "Désignation"], [2, "Nacelle"]]}))).json()["resultats"][0]
    assert res["accepte"] is True
