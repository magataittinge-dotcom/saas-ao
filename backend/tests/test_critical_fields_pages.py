"""R14 — la source d'un champ critique (remise, visite, critères…) porte la page où se lit
l'extrait, pour que « Voir dans le dossier » ouvre la bonne page. Textes inventés."""
import pytest

from models.project import Project, ProjectDocument
from services import critical_fields_pages, file_storage, pdfium_processus
from tests.pdf_fabrique import pdf_texte

REMISE = "Les offres doivent parvenir au plus tard le douze mars à midi."
VISITE = "Une visite du site est facultative et se fait sur rendez-vous."


@pytest.fixture(autouse=True)
def _processus_propres():
    pdfium_processus.arreter()
    yield
    pdfium_processus.arreter()


@pytest.fixture
def projet(db_session, test_org, tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    dossier = tmp_path / "projects" / "p-cfp"
    dossier.mkdir(parents=True)
    (dossier / "rc.pdf").write_bytes(pdf_texte(["Page un.", "Page deux.", REMISE, VISITE]))
    db_session.add(Project(id="p-cfp", organization_id=test_org.id, name="AO"))
    db_session.add(ProjectDocument(id="d-rc", project_id="p-cfp", type="rc", file_name="rc.pdf",
                                   file_url="/uploads/projects/p-cfp/rc.pdf"))
    db_session.commit()
    return db_session


def _champs():
    return {
        "date_limite_remise": {"value": {"date": "2027-03-12", "heure": "12:00"},
                               "source": {"document": "rc.pdf", "page": None, "excerpt": REMISE}},
        "visite_site": {"value": {"statut": "facultative", "date": None},
                        "source": {"document": "rc.pdf", "page": None, "excerpt": VISITE}},
        "delai_execution": {"value": "6 mois",
                            "source": {"document": "rc.pdf", "page": None,
                                       "excerpt": "Un passage qui n'existe nulle part dans la pièce"}},
        "penalites": {"value": None, "source": None},
    }


def test_la_page_de_chaque_source_est_trouvee_dans_le_pdf(projet):
    champs = _champs()
    res = critical_fields_pages.resoudre_pages(projet, "p-cfp", champs)
    assert res["date_limite_remise"]["source"]["page"] == 3
    assert res["visite_site"]["source"]["page"] == 4
    # extrait introuvable : pas de page inventée, mais la recherche est marquée (pas de nouvel essai)
    assert res["delai_execution"]["source"]["page"] is None
    assert res["delai_execution"]["source"]["page_cherchee"] is True
    assert res["penalites"] == {"value": None, "source": None}
    assert champs["date_limite_remise"]["source"]["page"] is None      # l'entrée n'est pas modifiée


def test_un_seul_aller_retour_par_piece(projet, monkeypatch):
    appels = []
    vrai = pdfium_processus.executer
    monkeypatch.setattr(pdfium_processus, "executer", lambda *a, **k: appels.append(a[0]) or vrai(*a, **k))
    critical_fields_pages.resoudre_pages(projet, "p-cfp", _champs())
    assert len(appels) == 1


def test_rien_a_faire_une_fois_cherche(projet):
    res = critical_fields_pages.resoudre_pages(projet, "p-cfp", _champs())
    assert critical_fields_pages.resoudre_pages(projet, "p-cfp", res) is None


def test_pdf_absent_ne_casse_rien(db_session, test_org, tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    db_session.add(Project(id="p-cfp2", organization_id=test_org.id, name="AO"))
    db_session.add(ProjectDocument(id="d-rc2", project_id="p-cfp2", type="rc", file_name="rc.pdf",
                                   file_url="/uploads/projects/p-cfp2/rc.pdf"))
    db_session.commit()
    res = critical_fields_pages.resoudre_pages(db_session, "p-cfp2", _champs())
    assert res["date_limite_remise"]["source"]["page"] is None


def test_la_route_range_les_pages(client, projet):
    projet.get(Project, "p-cfp").critical_fields = {"_all": _champs()}
    projet.commit()
    r = client.get("/api/projects/p-cfp/critical-fields")
    assert r.status_code == 200
    assert r.json()["fields"]["date_limite_remise"]["source"]["page"] == 3
    projet.expire_all()
    assert projet.get(Project, "p-cfp").critical_fields["_all"]["date_limite_remise"]["source"]["page"] == 3


def test_la_route_d_une_autre_organisation_reste_fermee(client, db_session):
    from models.organization import Organization
    db_session.add(Organization(id="org-autre", name="Autre"))
    db_session.add(Project(id="p-autre", organization_id="org-autre", name="AO"))
    db_session.commit()
    assert client.get("/api/projects/p-autre/critical-fields").status_code == 404
