"""« N passages à compléter » : le détail d'export donne le compte que l'écran affiche.

Le compte vient du texte du mémoire (sans construire le Word) et doit être celui de l'export Word.
Contenu inventé.
"""
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project
from services.docx_exporter import build_memoire_docx_ex, compter_passages_a_completer

CONTENU = {
    "preambule": "Engagement fictif. [À COMPLÉTER : nom du chef de chantier désigné]",
    "partie_a": {
        "roles_missions": "- Conducteur : [À COMPLÉTER : nom du conducteur]\n- Diplôme : [à compléter : diplôme]",
        "historique": "Texte fictif complet.",
    },
    "partie_b": {"securite": "Données fictives. [À COMPLÉTER PAR L'ENTREPRISE]"},
    "partie_c": {"delai": "Phasage fictif."},
}


def test_le_compte_est_celui_du_word():
    assert compter_passages_a_completer(CONTENU) == 4
    assert build_memoire_docx_ex(CONTENU, "Chantier fictif", "Entreprise fictive").nombre == 4


def test_compte_robuste_aux_contenus_vides_ou_mal_formes():
    assert compter_passages_a_completer(None) == 0
    assert compter_passages_a_completer({}) == 0
    assert compter_passages_a_completer({"partie_a": None, "partie_b": "texte", "preambule": 3}) == 0


def _projet(db, org_id, pid, contenu):
    db.add(Project(id=pid, organization_id=org_id, name="AO fictif"))
    if contenu is not None:
        db.add(MemoireTechnique(project_id=pid, content_json=contenu))
    db.commit()


def test_detail_d_export_expose_le_compte(client, db_session, test_org):
    _projet(db_session, test_org.id, "proj-pac", CONTENU)
    info = client.get("/api/projects/proj-pac/export/detail").json()["memoire_info"]
    assert info["passages_a_completer"] == 4


def test_detail_d_export_sans_passage(client, db_session, test_org):
    _projet(db_session, test_org.id, "proj-pac0", {"partie_a": {"historique": "Texte fictif."}})
    info = client.get("/api/projects/proj-pac0/export/detail").json()["memoire_info"]
    assert info["passages_a_completer"] == 0


def test_detail_d_export_d_une_autre_organisation_refuse(client, db_session, test_org):
    autre = Organization(id="org-autre-pac", name="Autre entreprise fictive")
    db_session.add(autre)
    db_session.commit()
    _projet(db_session, autre.id, "proj-pac-autre", CONTENU)
    assert client.get("/api/projects/proj-pac-autre/export/detail").status_code == 404
