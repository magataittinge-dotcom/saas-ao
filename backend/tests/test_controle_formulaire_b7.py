"""B7 — un PDF importé comme formulaire rempli ne compte plus « prêt » sans contrôle.

Règle (fonction pure ``services.controle_formulaire.controle_formulaire_rempli``) : le texte lu dans le PDF déposé
doit contenir la raison sociale OU le SIRET du profil ; sinon la ligne passe « À relire » (statut ``warning``, le
motif dans ``details``). Un scan sans texte : « À relire » aussi. Jamais bloquant : le fichier part dans le ZIP.
Fichiers et entreprises inventés."""
import pytest

from models.checklist_item import ChecklistItem
from models.project import Project, ProjectDocument
from services.controle_formulaire import controle_formulaire_rempli
from tests.pdf_fabrique import pdf_texte

MOTS_INTERDITS = ("manquant", "incomplet", "absent")


def _motif_propre(motif):
    assert motif and all(m not in motif.lower() for m in MOTS_INTERDITS)
    assert "!" not in motif
    return motif


# ─── Règle pure ──────────────────────────────────────────────────────────────

def test_la_raison_sociale_suffit_casse_et_accents_compris():
    texte = "Formulaire DC1\nNom commercial et dénomination sociale : MAÇONNERIE DU BOCAGE\nAdresse : 1 rue X"
    assert controle_formulaire_rempli(texte, raison_sociale="Maçonnerie du Bocage", siret=None) is None


def test_la_forme_juridique_ne_compte_pas():
    texte = "Candidat : Maçonnerie du Bocage, 12 rue des Lilas"
    assert controle_formulaire_rempli(texte, raison_sociale="SARL Maçonnerie du Bocage", siret=None) is None


def test_le_siret_suffit_meme_ecrit_par_groupes():
    texte = "Numéro SIRET : 123 456 789 00012\nDénomination : Autre nom"
    assert controle_formulaire_rempli(texte, raison_sociale="Bocage", siret="12345678900012") is None
    texte_points = "SIRET 123.456.789.00012"
    assert controle_formulaire_rempli(texte_points, raison_sociale="", siret="12345678900012") is None


def test_un_mot_isole_ne_vaut_pas_la_raison_sociale():
    # « bocage » apparaît, mais pas « Maçonnerie du Bocage » en entier
    texte = "Le chantier est situé dans le bocage normand. SIRET : 987 654 321 00098"
    motif = controle_formulaire_rempli(texte, raison_sociale="Maçonnerie du Bocage", siret="12345678900012")
    assert "Ni votre raison sociale ni votre SIRET" in _motif_propre(motif)


def test_le_siret_d_une_autre_entreprise_ne_compte_pas():
    texte = "Dénomination : Toiture Martin\nSIRET : 111 222 333 00044"
    motif = controle_formulaire_rempli(texte, raison_sociale="Maçonnerie du Bocage", siret="12345678900012")
    assert motif is not None


def test_un_scan_sans_texte_est_a_relire():
    motif = controle_formulaire_rempli("   \n ", raison_sociale="Maçonnerie du Bocage", siret="12345678900012")
    assert "texte" in _motif_propre(motif).lower()
    motif2 = controle_formulaire_rempli("", raison_sociale="", siret=None)
    assert motif2 == motif


def test_un_profil_sans_raison_sociale_ni_siret_ne_permet_pas_le_controle():
    motif = controle_formulaire_rempli("Dénomination : Maçonnerie du Bocage", raison_sociale="", siret=None)
    assert "Mon entreprise" in _motif_propre(motif)


# ─── Dépôt réel d'un formulaire rempli ───────────────────────────────────────

@pytest.fixture
def uploads(tmp_path, monkeypatch):
    import routers.candidature as candidature
    monkeypatch.setattr(candidature, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _ligne(db, org_id, pid="p-b7"):
    db.add(Project(id=pid, organization_id=org_id, name="AO B7"))
    db.add(ProjectDocument(id=f"{pid}-tpl", project_id=pid, type="dc1_template",
                           file_url="/uploads/dc1.pdf", file_name="DC1.pdf"))
    db.add(ChecklistItem(id=f"{pid}-l", project_id=pid, document_type_required="dc1_template",
                         source_kind="dce_template", template_project_doc_id=f"{pid}-tpl", status="manquant"))
    db.commit()
    return f"/api/projects/{pid}/checklist/{pid}-l/upload-completed"


def _deposer(client, url, octets, nom="DC1_rempli.pdf"):
    return client.post(url, files={"file": (nom, octets, "application/pdf")})


def test_un_formulaire_au_nom_de_l_entreprise_est_pret(client, db_session, test_org, uploads):
    url = _ligne(db_session, test_org.id)
    r = _deposer(client, url, pdf_texte(["DC1 — Lettre de candidature", "Candidat : SYNORIX TEST BTP"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "present"
    assert r.json()["a_relire"] is False


def test_un_formulaire_d_une_autre_entreprise_est_a_relire(client, db_session, test_org, uploads):
    url = _ligne(db_session, test_org.id)
    r = _deposer(client, url, pdf_texte(["DC1 — Lettre de candidature\nCandidat : Toiture Martin"]))
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["status"] == "warning" and corps["a_relire"] is True
    assert "DC1_rempli.pdf" in _motif_propre(corps["details"])
    # la pièce reste déposée : elle part dans le dossier, rien n'est bloqué
    assert corps["completed_project_doc_id"]
    ligne = [l for l in client.get(f"/api/projects/p-b7/checklist").json() if l["id"] == "p-b7-l"][0]
    assert ligne["a_relire"] is True and ligne["jointe"] is False


def test_un_scan_sans_texte_est_a_relire_au_depot(client, db_session, test_org, uploads):
    url = _ligne(db_session, test_org.id)
    r = _deposer(client, url, pdf_texte(["", ""]), nom="DC1_scan.pdf")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "warning" and r.json()["a_relire"] is True


def test_un_tableur_n_est_pas_concerne(client, db_session, test_org, uploads):
    """Le contrôle B7 ne vise que les PDF ; la DPGF tableur garde son propre contrôle."""
    import io
    import openpyxl
    url = _ligne(db_session, test_org.id)
    wb = openpyxl.Workbook()
    wb.active["A1"] = "Annexe"
    tampon = io.BytesIO()
    wb.save(tampon)
    r = client.post(url, files={"file": ("annexe.xlsx", tampon.getvalue(),
                                         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "present"


def test_le_controle_lit_le_profil_de_l_organisation_qui_depose(client, db_session, test_org, uploads):
    """Cloisonnement : un formulaire au nom et au SIRET d'une AUTRE organisation de la base reste « À relire »."""
    from models.organization import Organization
    db_session.add(Organization(id="org-b7-autre", name="Toiture Martin", siret="11122233300044",
                                siret_verified=True))
    db_session.commit()
    url = _ligne(db_session, test_org.id)
    r = _deposer(client, url, pdf_texte(["DC1\nCandidat : Toiture Martin\nSIRET : 111 222 333 00044"]))
    assert r.status_code == 200, r.text
    assert r.json()["a_relire"] is True


def test_l_export_dit_a_relire_et_le_formulaire_part_dans_le_dossier(client, db_session, test_org, uploads, monkeypatch):
    """L'écran Export lit la même ligne que Pièces : « À relire » (pas « Date de validité à confirmer ») et le motif à part ;
    le formulaire déposé figure dans ce que le ZIP contient (B7 n'est jamais bloquant)."""
    import routers.export as export
    monkeypatch.setattr(export, "UPLOADS_ROOT", uploads)
    url = _ligne(db_session, test_org.id)
    assert _deposer(client, url, pdf_texte(["DC1\nCandidat : Toiture Martin"])).status_code == 200
    r = client.get("/api/projects/p-b7/export/detail")
    assert r.status_code == 200, r.text
    ligne = [l for l in r.json()["checklist_items"] if l["id"] == "p-b7-l"][0]
    assert ligne["a_relire"] is True and ligne["status"] == "warning"
    assert ligne["document_type_required"] == "dc1_template"
    complet = db_session.get(ChecklistItem, "p-b7-l").completed_project_doc_id
    assert complet and any(p["document_projet_id"] == complet for p in r.json()["pieces_zip"])


def test_l_export_ne_dit_pas_a_relire_un_formulaire_au_nom_de_l_entreprise(client, db_session, test_org, uploads, monkeypatch):
    import routers.export as export
    monkeypatch.setattr(export, "UPLOADS_ROOT", uploads)
    url = _ligne(db_session, test_org.id)
    assert _deposer(client, url, pdf_texte(["DC1\nCandidat : SYNORIX TEST BTP"])).status_code == 200
    ligne = [l for l in client.get("/api/projects/p-b7/export/detail").json()["checklist_items"] if l["id"] == "p-b7-l"][0]
    assert ligne["a_relire"] is False and ligne["jointe"] is True
