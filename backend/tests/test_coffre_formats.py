"""Décision 1 du 2/11 — le coffre-fort accepte PDF, Word, Excel, JPEG et PNG, avec les mêmes contrôles de contenu que
les dépôts de « Mon entreprise » (`services/depot_controles.py`, réutilisé et non recopié). Fichiers fabriqués ici."""
import io
import zipfile

import pytest

from models.document import Document
from tests import depot_fabrique as fab
from tests.depot_fabrique import coffre, deux_orgs  # noqa: F401

OLE2 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512
MESSAGE_ANCIEN = "Enregistrez le fichier au format .docx (ou .xlsx) puis redéposez-le."


def _jpeg() -> bytes:
    from PIL import Image
    flux = io.BytesIO()
    Image.new("RGB", (8, 8), (30, 30, 200)).save(flux, "JPEG")
    return flux.getvalue()


def _envoyer(client, nom, contenu):
    return client.post("/api/documents", files={"file": (nom, contenu, "application/octet-stream")},
                       data={"type": "autre"})


@pytest.mark.parametrize("nom,contenu", [
    ("attestation.pdf", fab.pdf("Attestation sur l'honneur inventée")),
    ("fiche.docx", fab.docx("Nos moyens inventés")),
    ("liste.xlsx", fab.xlsx({"Matériel": [["Quantité", "Désignation"], [2, "Nacelle inventée"]]})),
    ("photo.jpg", _jpeg()),
    ("photo2.jpeg", _jpeg()),
    ("logo.png", fab.png_valide()),
], ids=lambda v: v if isinstance(v, str) else "")
def test_un_fichier_de_chaque_format_accepte(client, coffre, db_session, nom, contenu):
    res = _envoyer(client, nom, contenu)
    assert res.status_code == 200, res.text
    assert db_session.query(Document).count() == 1


def _docm() -> bytes:
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document/>")
        z.writestr("word/vbaProject.bin", b"\xd0\xcf\x11\xe0")
    return flux.getvalue()


@pytest.mark.parametrize("nom,contenu", [
    ("macro.docm", _docm()),                             # extension hors liste
    ("macro.docx", _docm()),                             # macro cachée sous .docx
    ("liste.xlsm", fab.xlsx({"A": [[1]]})),              # extension hors liste
    ("faux.pdf", fab.exe()),                             # exécutable renommé .pdf
    ("faux2.pdf", b"   \n" + fab.pdf("Texte")),          # préambule avant « %PDF- »
    ("logo.png", fab.svg_en_png()),                      # SVG renommé .png
    ("photo.jpg", fab.png_valide()),                     # PNG renommé .jpg
    ("archive.docx", b"PK\x03\x04 pas un vrai paquet"),  # archive quelconque
], ids=lambda v: v if isinstance(v, str) else "")
def test_contenus_piegés_ou_faux_refuses(client, coffre, db_session, nom, contenu):
    res = _envoyer(client, nom, contenu)
    assert res.status_code == 415, res.text
    assert db_session.query(Document).count() == 0


@pytest.mark.parametrize("nom", ["ancien.doc", "ancien.xls"])
def test_anciens_formats_ole2_refuses_avec_le_message_du_depot(client, coffre, db_session, nom):
    res = _envoyer(client, nom, OLE2)
    assert res.status_code == 415
    assert res.json()["detail"] == MESSAGE_ANCIEN
    assert db_session.query(Document).count() == 0


def test_doc_qui_est_un_zip_ooxml_refuse_sans_requalification(client, coffre, db_session):
    assert _envoyer(client, "fiche.doc", fab.docx("Texte sain")).status_code == 415
    assert db_session.query(Document).count() == 0


def test_cross_org_une_piece_deposee_reste_dans_son_organisation(client, coffre, db_session, deux_orgs):
    org_a, org_b = deux_orgs
    res = _envoyer(client, "liste.xlsx", fab.xlsx({"A": [[1]]}))
    assert res.status_code == 200, res.text
    doc = db_session.query(Document).one()
    assert doc.organization_id == org_a.id
    assert f"organizations/{org_a.id}/vault" in doc.file_url
    assert "org-b" not in doc.file_url
    # l'autre organisation ne voit rien et ne peut pas supprimer la pièce
    fab.se_connecter_comme("user-b", org_b.id)
    assert client.get("/api/documents").json() == []
    assert client.delete(f"/api/documents/{doc.id}").status_code == 404
