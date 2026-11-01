"""Dépôt par rubrique, tranche D1 (socle) : les huit cases, le dépôt multi-fichiers, les contrôles de contenu,
le coffre-fort (rubrique et type de pièce), l'état des cases, l'isolation entre entreprises, la migration 0032.

Tous les fichiers sont inventés par `tests/depot_fabrique.py`."""
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

from models.depot_entreprise import LectureDepot
from models.document import DOCUMENT_TYPES, Document
from tests import depot_fabrique as fab
from tests.depot_fabrique import (BASE, attendre_les_lectures, coffre, deux_orgs, deposer, deposer_et_lire,  # noqa: F401
                                  modele)

BACKEND = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def _modele_vide(modele):
    """Ces tests regardent le dépôt, pas la lecture : le modèle simulé ne propose rien (aucun appel payant)."""
    modele({})


# ── les huit cases ──────────────────────────────────────────────────────────

def test_les_huit_cases_par_rubrique_avec_leurs_trois_textes(client):
    r = client.get(f"{BASE}/cases")
    assert r.status_code == 200
    cases = r.json()["cases"]
    assert len(cases) == 8
    par_rubrique = {}
    for c in cases:
        par_rubrique.setdefault(c["rubrique"], []).append(c["nom"])
        assert c["nom"] and c["contenu"] and c["usage"]
        assert c["plafond_mo"] == 20 and c["plusieurs_fichiers"] is True
        assert ".pdf" in c["formats"] and ".png" in c["formats"]
    assert par_rubrique == {
        "identite": ["Extrait Kbis", "Attestation d'assurance décennale", "Attestation de responsabilité civile"],
        "moyens": ["Liste du matériel ou inventaire", "Organigramme ou liste du personnel",
                   "Fiche des moyens déjà faite (PDF ou Word)"],
        "certifications": ["Certificat Qualibat, RGE ou autre label",
                           "Liste de références ou ancien mémoire technique"],
    }
    texte = " ".join(c["contenu"] + " " + c["usage"] for c in cases).lower()
    for interdit in ("manquant", "incomplet", "absent"):
        assert interdit not in texte


# ── le dépôt entre au coffre-fort avec sa rubrique et son type ──────────────

@pytest.mark.parametrize("case,rubrique,type_attendu,categorie", [
    ("kbis", "identite", "kbis", "documents_legaux"),
    ("decennale", "identite", "decennale", "assurances"),
    ("rc", "identite", "rc_civile", "assurances"),
    ("materiel", "moyens", "autre", "references_moyens"),
    ("personnel", "moyens", "organigramme_doc", "references_moyens"),
    ("fiche_moyens", "moyens", "autre", "references_moyens"),
    ("certificat", "certifications", "autre", "qualifications"),
    ("references", "certifications", "autre", "references_moyens"),
])
def test_une_piece_deposee_apparait_au_coffre_avec_sa_rubrique_et_son_type(
        client, coffre, db_session, case, rubrique, type_attendu, categorie):
    r = deposer(client, case, ("piece.pdf", fab.pdf("Texte inventé")))
    assert r.status_code == 200, r.text
    res = r.json()["resultats"][0]
    assert res["accepte"] is True and res["deja_depose"] is False
    doc = db_session.get(Document, res["document_id"])
    assert (doc.organization_id, doc.rubrique_entreprise, doc.case_depot) == ("org-test-1", rubrique, case)
    assert doc.type == type_attendu and doc.type in DOCUMENT_TYPES and doc.category == categorie
    # et le coffre-fort la liste
    noms = [d["file_name"] for d in client.get("/api/documents").json()]
    assert "piece.pdf" in noms


def test_certificat_reconnait_qualibat_et_rge_par_le_nom_sinon_autre_label(client, coffre, db_session):
    types = {}
    for nom in ("Qualibat 2026.pdf", "Attestation RGE.pdf", "label-maison.pdf"):
        res = deposer(client, "certificat", (nom, fab.pdf(nom))).json()["resultats"][0]
        types[nom] = db_session.get(Document, res["document_id"]).type
    assert types == {"Qualibat 2026.pdf": "qualibat", "Attestation RGE.pdf": "rge", "label-maison.pdf": "autre"}


def test_une_attestation_est_aussi_une_piece_a_surveiller(client, coffre, db_session):
    res = deposer(client, "decennale", ("decennale.pdf", fab.pdf(fab.TEXTE_DECENNALE))).json()["resultats"][0]
    doc = db_session.get(Document, res["document_id"])
    assert doc.status == "unverified" and doc.expiry_date is None   # reconnue ; la date viendra de la validation


def test_png_et_docx_et_xlsx_acceptes(client, coffre):
    r = deposer(
        client, "materiel",
        ("photo.png", fab.png_valide()),
        ("liste.xlsx", fab.xlsx({"Matériel": [["Quantité", "Désignation"], [2, "Nacelle ciseaux"]]})),
        ("fiche.docx", fab.docx("Nos moyens")),
    )
    assert [x["accepte"] for x in r.json()["resultats"]] == [True, True, True]


def test_un_fichier_redepose_dans_la_meme_case_ne_cree_ni_piece_ni_lecture(client, coffre, db_session):
    contenu = fab.pdf("Même fichier")
    premier = deposer(client, "kbis", ("kbis.pdf", contenu)).json()["resultats"][0]
    second = deposer(client, "kbis", ("kbis-bis.pdf", contenu)).json()["resultats"][0]
    assert second["deja_depose"] is True and second["document_id"] == premier["document_id"]
    assert db_session.query(Document).count() == 1 and db_session.query(LectureDepot).count() == 1
    # dans une AUTRE case, c'est un autre dépôt
    autre = deposer(client, "decennale", ("kbis.pdf", contenu)).json()["resultats"][0]
    assert autre["deja_depose"] is False and db_session.query(Document).count() == 2


# ── refus : fichiers piégés ─────────────────────────────────────────────────

def _piege_docx_exe() -> bytes:
    import io
    import zipfile
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document/>")
        z.writestr("word/charge.exe", b"MZ")
    return flux.getvalue()


def _zip_quelconque() -> bytes:
    import io
    import zipfile
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("notes.txt", "rien à voir avec Word")
    return flux.getvalue()


@pytest.mark.parametrize("nom,contenu", [
    ("kbis.pdf", fab.exe()),                                  # exécutable renommé .pdf
    ("kbis.pdf", fab.polyglotte_exe_pdf()),                   # exécutable qui porte « %PDF- » dans ses premiers octets
    ("logo.png", fab.svg_en_png()),                           # SVG renommé .png
    ("dessin.svg", fab.svg_en_png()),                         # SVG déclaré
    ("page.html", b"<html><script>1</script></html>"),
    ("outil.exe", fab.exe()),
    ("archive.zip", _zip_quelconque()),
    ("fiche.docx", _zip_quelconque()),                        # archive quelconque renommée .docx
    ("fiche.docx", _piege_docx_exe()),                        # .docx qui porte un exécutable
    ("fiche.docx", fab.zip_bombe_docx()),                     # bombe de décompression
    ("photo.jpg", fab.png_valide()),                          # PNG renommé .jpg
    ("photo.png", fab.png_valide()[:30]),                     # PNG tronqué
    ("liste.xlsx", fab.exe()),
])
def test_fichiers_pieges_refuses_sans_rien_ranger(client, coffre, db_session, nom, contenu):
    r = deposer(client, "materiel", (nom, contenu))
    assert r.status_code == 200
    res = r.json()["resultats"][0]
    assert res["accepte"] is False and res["statut"] == 415, res
    assert db_session.query(Document).count() == 0 and db_session.query(LectureDepot).count() == 0
    assert list(coffre.rglob("*.*")) == []        # aucun fichier orphelin sur le disque


def test_plus_de_20_mo_refuse_20_mo_pile_accepte(client, coffre):
    limite = 20 * 1024 * 1024
    ok = deposer(client, "references", ("grand.pdf", b"%PDF-1.4\n" + b"0" * (limite - 9))).json()["resultats"][0]
    assert ok["accepte"] is True
    trop = deposer(client, "references", ("trop.pdf", b"%PDF-1.4\n" + b"0" * (limite - 8))).json()["resultats"][0]
    assert trop["accepte"] is False and trop["statut"] == 413


def test_un_fichier_refuse_n_empeche_pas_les_autres_de_l_envoi(client, coffre):
    r = deposer(client, "materiel", ("a.pdf", fab.pdf("A")), ("virus.pdf", fab.exe()), ("b.pdf", fab.pdf("B")))
    assert [x["accepte"] for x in r.json()["resultats"]] == [True, False, True]


def test_plus_de_dix_fichiers_par_envoi_refuse(client, coffre, db_session):
    fichiers = [(f"f{i}.pdf", fab.pdf(str(i))) for i in range(11)]
    assert deposer(client, "materiel", *fichiers).status_code == 413
    assert db_session.query(Document).count() == 0


def test_envoi_total_plafonne_a_55_mo(client, coffre):
    gros = b"%PDF-1.4\n" + b"0" * (19 * 1024 * 1024)
    res = deposer(client, "materiel", *[(f"g{i}.pdf", gros + bytes([i])) for i in range(3)]).json()["resultats"]
    assert [x["accepte"] for x in res] == [True, True, False] and res[2]["statut"] == 413


def test_case_inconnue_404_et_rubrique_inconnue_422(client, coffre):
    assert deposer(client, "inconnue", ("a.pdf", fab.pdf("A"))).status_code == 404
    assert client.get(f"{BASE}/etat?rubrique=inconnue").status_code == 422


# ── état des cases ──────────────────────────────────────────────────────────

def test_etat_apres_depot_et_lecture_sans_rien_a_proposer_deposé_dans_le_coffre(client, coffre):
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    cases = {c["id"]: c for c in client.get(f"{BASE}/etat?rubrique=identite").json()["cases"]}
    assert set(cases) == {"kbis", "decennale", "rc"}
    assert cases["kbis"]["etat"] == "coffre_seul" and cases["kbis"]["libelle_etat"] == "Déposé dans le coffre-fort"
    assert cases["kbis"]["fichiers"][0]["nom"] == "kbis.pdf" and cases["kbis"]["vers_verifier"] is False
    assert cases["decennale"]["etat"] == "vide" and cases["decennale"]["libelle_etat"] is None


def test_un_fichier_supprime_du_coffre_disparait_de_la_case(client, coffre, db_session):
    res = deposer(client, "kbis", ("kbis.pdf", fab.pdf("Kbis inventé"))).json()["resultats"][0]
    assert client.delete(f"/api/documents/{res['document_id']}").status_code == 204
    case = next(c for c in client.get(f"{BASE}/etat").json()["cases"] if c["id"] == "kbis")
    assert case["etat"] == "vide"


# ── isolation entre entreprises ─────────────────────────────────────────────

def test_cross_org_depot_etat_et_coffre_restent_chez_leur_entreprise(client, coffre, db_session, deux_orgs):
    a_depose = deposer(client, "kbis", ("kbis-A.pdf", fab.pdf("Kbis de A"))).json()["resultats"][0]
    fab.se_connecter_comme("user-b", "org-b")
    # B ne voit rien de A
    cases_b = {c["id"]: c for c in client.get(f"{BASE}/etat").json()["cases"]}
    assert cases_b["kbis"]["etat"] == "vide" and cases_b["kbis"]["fichiers"] == []
    assert client.get("/api/documents").json() == []
    # le même fichier déposé par B est un dépôt neuf, rangé chez B
    b_depose = deposer(client, "kbis", ("kbis-A.pdf", fab.pdf("Kbis de A"))).json()["resultats"][0]
    assert b_depose["deja_depose"] is False and b_depose["document_id"] != a_depose["document_id"]
    assert db_session.get(Document, b_depose["document_id"]).organization_id == "org-b"
    assert db_session.get(Document, a_depose["document_id"]).organization_id == "org-test-1"
    assert db_session.query(LectureDepot).filter_by(organization_id="org-b").count() == 1


# ── migration 0032 ──────────────────────────────────────────────────────────

def _module():
    import importlib.util
    spec = importlib.util.spec_from_file_location("m0032", BACKEND / "alembic/versions/0032_depot_entreprise.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _executer(moteur, fonction):
    with moteur.begin() as c:
        with Operations.context(MigrationContext.configure(c)):
            fonction()


def test_0032_suit_0031_une_seule_head():
    script = ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini")))
    assert script.get_revision("0032").down_revision == "0031"
    assert len(script.get_heads()) == 1


def test_0032_additive_idempotente_et_downgrade_ne_retire_que_le_neuf():
    m = _module()
    moteur = sa.create_engine("sqlite://")
    with moteur.begin() as c:
        c.execute(sa.text("CREATE TABLE organizations (id VARCHAR PRIMARY KEY, name VARCHAR)"))
        c.execute(sa.text("CREATE TABLE documents (id VARCHAR PRIMARY KEY, file_name VARCHAR)"))
        c.execute(sa.text("INSERT INTO documents (id, file_name) VALUES ('d', 'existant.pdf')"))
    _executer(moteur, m.upgrade)
    _executer(moteur, m.upgrade)   # idempotent
    insp = sa.inspect(moteur)
    assert {"rubrique_entreprise", "case_depot"} <= {c["name"] for c in insp.get_columns("documents")}
    assert {"lectures_depot", "propositions_profil", "couts_ia"} <= set(insp.get_table_names())
    with moteur.begin() as c:
        assert c.execute(sa.text("SELECT file_name FROM documents")).scalar() == "existant.pdf"
        assert c.execute(sa.text("SELECT rubrique_entreprise FROM documents")).scalar() is None
    _executer(moteur, m.downgrade)
    _executer(moteur, m.downgrade)
    insp = sa.inspect(moteur)
    assert {c["name"] for c in insp.get_columns("documents")} == {"id", "file_name"}
    assert not ({"lectures_depot", "propositions_profil", "couts_ia"} & set(insp.get_table_names()))
    with moteur.begin() as c:
        assert c.execute(sa.text("SELECT file_name FROM documents")).scalar() == "existant.pdf"


def test_les_modeles_declarent_les_colonnes_nullables_de_documents():
    for nom in ("rubrique_entreprise", "case_depot"):
        assert Document.__table__.c[nom].nullable
