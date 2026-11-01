"""Fabrique des fichiers INVENTÉS du dépôt par rubrique (tranches D1 à D3) : aucun document réel.

Entreprise inventée : « Maçonnerie Lambert SAS » ; salariés inventés ; aucun texte de DCE."""
from __future__ import annotations

import io
import zipfile

import openpyxl
import pytest
from fastapi import Request

from database import SessionLocal, get_db
from main import app
from models.organization import Organization
from models.user import User
from routers.auth import get_auth_user, get_auth_user_short
from tests.pdf_fabrique import pdf_texte

BASE = "/api/entreprise/depots"

TEXTE_KBIS = (
    "EXTRAIT KBIS\n"
    "Immatriculation au Registre du Commerce et des Sociétés de REIMS\n"
    "Dénomination : MACONNERIE LAMBERT SAS\n"
    "Forme juridique : Société par actions simplifiée\n"
    "Capital social : 40 000,00 Euros\n"
    "Siège social : 12 avenue du Port 51100 REIMS\n"
    "Numéro SIRET : 123 456 789 00011\n"
    "Date de création : 14 mars 2011\n"
    "Président : Camille MARTIN\n"
    "Extrait délivré le 12 octobre 2026\n"
    "Contact : 03 26 00 00 00 - contact@lambert-maconnerie.fr\n"
)

TEXTE_DECENNALE = (
    "ATTESTATION D'ASSURANCE RESPONSABILITE DECENNALE\n"
    "Assureur : Mutuelle du Bâtiment Champagne\n"
    "Contrat numéro BAT-2026-00457\n"
    "Activités garanties : maçonnerie, gros oeuvre, ravalement de façades\n"
    "Période de validité : du 01/01/2026 au 31/12/2026\n"
)


def pdf(*pages: str) -> bytes:
    return pdf_texte(list(pages) or [""])


def docx(*paragraphes: str) -> bytes:
    import docx as _docx
    d = _docx.Document()
    for p in paragraphes:
        d.add_paragraph(p)
    flux = io.BytesIO()
    d.save(flux)
    return flux.getvalue()


def xlsx(feuilles: dict[str, list[list]]) -> bytes:
    classeur = openpyxl.Workbook()
    classeur.remove(classeur.active)
    for nom, lignes in feuilles.items():
        feuille = classeur.create_sheet(nom)
        for ligne in lignes:
            feuille.append(ligne)
    flux = io.BytesIO()
    classeur.save(flux)
    return flux.getvalue()


def zip_bombe_docx(mo: int = 140) -> bytes:
    """.docx valide en apparence dont la partie principale annonce `mo` Mo décompressés."""
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        with z.open("word/document.xml", "w", force_zip64=True) as sortie:
            bloc = b"a" * (1024 * 1024)
            for _ in range(mo):
                sortie.write(bloc)
    return flux.getvalue()


def svg_en_png() -> bytes:
    return b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


def exe() -> bytes:
    return b"MZ\x90\x00" + b"\x00" * 200


def polyglotte_exe_pdf() -> bytes:
    """Un exécutable (MZ) qui porte « %PDF- » dans ses 1 024 premiers octets."""
    return b"MZ\x90\x00" + b"\x00" * 100 + b"%PDF-1.4" + b"\x00" * 200


def png_valide() -> bytes:
    from PIL import Image
    flux = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 30, 30)).save(flux, "PNG")
    return flux.getvalue()


def se_connecter_comme(user_id: str, org_id: str) -> None:
    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _user(request: Request):
        request.state.rl_key = f"org:{org_id}"
        s = SessionLocal()
        try:
            return s.query(User).filter(User.id == user_id).first()
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = _user
    app.dependency_overrides[get_auth_user_short] = _user


@pytest.fixture
def coffre(tmp_path, monkeypatch):
    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


@pytest.fixture
def deux_orgs(db_session, test_org, test_user):
    """Org A (celle du client de test) et org B."""
    b = Organization(id="org-b", name="Bâtiments Dupré SARL")
    db_session.add(b)
    db_session.add(User(id="user-b", email="b@example.com", name="Utilisateur B", organization_id="org-b"))
    db_session.commit()
    return test_org, b


def deposer(client, case: str, *fichiers: tuple[str, bytes], type_mime: str = "application/octet-stream"):
    return client.post(
        f"{BASE}/{case}",
        files=[("fichiers", (nom, contenu, type_mime)) for nom, contenu in fichiers],
    )

