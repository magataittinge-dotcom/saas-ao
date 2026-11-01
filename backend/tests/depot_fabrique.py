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


# ── Modèle simulé : aucun appel payant ───────────────────────────────────────

class ModeleSimule:
    """Remplace `depot_extracteur._call_haiku`. `reponses[extracteur]` est un dict, ou une fonction (texte) -> dict.
    Chaque appel est noté : (extracteur, texte reçu) — le texte reçu est celui qui PART chez le fournisseur."""

    def __init__(self, reponses: dict, pause: float = 0.0):
        from services.ai import depot_extracteur
        self.reponses = reponses
        self.pause = pause
        self.appels: list[tuple[str, str]] = []
        self._par_prompt = {depot_extracteur.prompt_systeme(e): e for e in depot_extracteur._PROMPTS}
        import threading
        self._verrou = threading.Lock()
        self.en_cours = 0
        self.max_en_cours = 0

    def __call__(self, systeme: str, texte: str):
        import time
        extracteur = self._par_prompt[systeme]
        with self._verrou:
            self.appels.append((extracteur, texte))
            self.en_cours += 1
            self.max_en_cours = max(self.max_en_cours, self.en_cours)
        try:
            if self.pause:
                time.sleep(self.pause)
            reponse = self.reponses.get(extracteur, {})
            champs = reponse(texte) if callable(reponse) else reponse
            return dict(champs), {"input_tokens": (len(systeme) + len(texte)) // 4, "output_tokens": 220}
        finally:
            with self._verrou:
                self.en_cours -= 1

    @property
    def textes_envoyes(self) -> str:
        return "\n".join(t for _, t in self.appels)


@pytest.fixture
def modele(monkeypatch):
    """`modele(reponses)` installe le modèle simulé et le rend."""
    from services.ai import depot_extracteur

    def _installer(reponses: dict, pause: float = 0.0) -> ModeleSimule:
        faux = ModeleSimule(reponses, pause)
        monkeypatch.setattr(depot_extracteur, "_call_haiku", faux)
        return faux

    return _installer


def attendre_les_lectures() -> None:
    import threading
    for fil in threading.enumerate():
        if fil.name.startswith("synorix-depot-"):
            fil.join(60)


def deposer_et_lire(client, case: str, *fichiers: tuple[str, bytes]) -> list[dict]:
    reponse = deposer(client, case, *fichiers)
    assert reponse.status_code == 200, reponse.text
    attendre_les_lectures()
    return reponse.json()["resultats"]


def etat_de(client, case: str) -> dict:
    return next(c for c in client.get(f"{BASE}/etat").json()["cases"] if c["id"] == case)


KBIS_COMPLET = {
    "forme_juridique": "Société par actions simplifiée", "capital_social": 40000, "greffe_rcs": "REIMS",
    "adresse_siege": "12 avenue du Port 51100 REIMS", "annee_creation": 2011, "date_extrait": "2026-10-12",
    "gerant_nom": "Camille MARTIN", "gerant_titre": "Président",
}
DECENNALE_COMPLETE = {
    "assureur": "Mutuelle du Bâtiment Champagne", "numero_contrat": "BAT-2026-00457",
    "activites_garanties": "maçonnerie, gros oeuvre, ravalement de façades",
    "date_debut": "2026-01-01", "date_fin": "2026-12-31",
}
