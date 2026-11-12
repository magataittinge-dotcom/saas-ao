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
    assert res["delai_execution"]["source"]["page_cherchee"] == 2
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


def test_la_route_rend_les_pages_sans_ecrire(client, projet):
    projet.get(Project, "p-cfp").critical_fields = {"_all": _champs()}
    projet.commit()
    r = client.get("/api/projects/p-cfp/critical-fields")
    assert r.status_code == 200
    assert r.json()["fields"]["date_limite_remise"]["source"]["page"] == 3
    # D-05 : la page est rangée par la fin de l'analyse, plus par le GET (test_lecture_pure_d05.py).
    projet.expire_all()
    assert projet.get(Project, "p-cfp").critical_fields["_all"]["date_limite_remise"]["source"]["page"] is None


def test_la_route_d_une_autre_organisation_reste_fermee(client, db_session):
    from models.organization import Organization
    db_session.add(Organization(id="org-autre", name="Autre"))
    db_session.add(Project(id="p-autre", organization_id="org-autre", name="AO"))
    db_session.commit()
    assert client.get("/api/projects/p-autre/critical-fields").status_code == 404


# ── V1 : une page de sommaire n'est jamais la page du fait ────────────────────

SOMMAIRE = (
    "SOMMAIRE\n"
    "1. OBJET DE LA CONSULTATION ................................ 3\n"
    "2. CONDITIONS DE LA CONSULTATION ........................... 3\n"
    "3. PRESENTATION DES OFFRES ................................. 4\n"
    "4. JUGEMENT DES OFFRES INVENTES ET CHOIX DU TITULAIRE ...... 5\n"
    "5. RENSEIGNEMENTS COMPLEMENTAIRES .......................... 6"
)
JUGEMENT = ("4. JUGEMENT DES OFFRES INVENTES ET CHOIX DU TITULAIRE\n"
            "Les offres sont classees selon deux criteres ponderes :\n"
            "Valeur technique de l'offre : 60 pour cent\n"
            "Prix des prestations : 40 pour cent")


@pytest.fixture
def projet_sommaire(db_session, test_org, tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    dossier = tmp_path / "projects" / "p-som"
    dossier.mkdir(parents=True)
    pages = ["Reglement inventé de la consultation", SOMMAIRE, "1. OBJET\nTravaux inventés de peinture.",
             "3. PRESENTATION\nLes plis sont remis le douze mars à midi.", JUGEMENT,
             "5. RENSEIGNEMENTS\nVisite des lieux facultative sur rendez-vous."]
    (dossier / "rc.pdf").write_bytes(pdf_texte(pages))
    db_session.add(Project(id="p-som", organization_id=test_org.id, name="AO"))
    db_session.add(ProjectDocument(id="d-som", project_id="p-som", type="rc", file_name="rc.pdf",
                                   file_url="/uploads/projects/p-som/rc.pdf"))
    db_session.commit()
    return db_session


def _criteres(extrait):
    return {"criteres": {"value": [{"nom": "Valeur technique", "poids": 60}, {"nom": "Prix", "poids": 40}],
                         "source": {"document": "rc.pdf", "page": None, "excerpt": extrait}}}


def test_l_extrait_pris_dans_le_sommaire_ne_donne_pas_la_page_du_sommaire(projet_sommaire):
    extrait = "4. JUGEMENT DES OFFRES INVENTES ET CHOIX DU TITULAIRE ...... 5 5. RENSEIGNEMENTS COMPLEMENTAIRES"
    res = critical_fields_pages.resoudre_pages(projet_sommaire, "p-som", _criteres(extrait))
    assert res["criteres"]["source"]["page"] == 5, res            # la page du jugement, pas la page 2


def test_une_page_normale_est_gardee(projet_sommaire):
    extrait = "Les offres sont classees selon deux criteres ponderes"
    res = critical_fields_pages.resoudre_pages(projet_sommaire, "p-som", _criteres(extrait))
    assert res["criteres"]["source"]["page"] == 5


def test_une_recherche_ancienne_qui_a_garde_le_sommaire_est_refaite(projet_sommaire):
    champs = _criteres("4. JUGEMENT DES OFFRES INVENTES ET CHOIX DU TITULAIRE ...... 5 5. RENSEIGNEMENTS COMPLEMENTAIRES")
    champs["criteres"]["source"].update({"page": 2, "page_cherchee": True})     # état rangé par la première version
    res = critical_fields_pages.resoudre_pages(projet_sommaire, "p-som", champs)
    assert res["criteres"]["source"]["page"] == 5 and res["criteres"]["source"]["page_cherchee"] == 2


def test_la_visite_et_la_remise_gardent_leur_page(projet_sommaire):
    champs = {
        "visite_site": {"value": {"statut": "facultative", "date": None},
                        "source": {"document": "rc.pdf", "page": None, "excerpt": "Visite des lieux facultative sur rendez-vous."}},
        "date_limite_remise": {"value": {"date": "2027-03-12", "heure": "12:00"},
                               "source": {"document": "rc.pdf", "page": None, "excerpt": "Les plis sont remis le douze mars à midi."}},
    }
    res = critical_fields_pages.resoudre_pages(projet_sommaire, "p-som", champs)
    assert res["visite_site"]["source"]["page"] == 6
    assert res["date_limite_remise"]["source"]["page"] == 4


def test_detection_des_pages_de_sommaire():
    from services.pdf_pages_faits import est_sommaire
    assert est_sommaire(SOMMAIRE) and not est_sommaire(JUGEMENT)
    assert est_sommaire("Titre un ........ 3\nTitre deux ........ 4\nTitre trois ........ 9")
    assert not est_sommaire("Le délai d'exécution est de 3 mois. Les pénalités sont de 1/1000 par jour.")


def test_un_extrait_sans_rapport_avec_le_fait_ne_donne_pas_sa_page(db_session, test_org, tmp_path, monkeypatch):
    """Extrait pris dans un tableau de lots alors que le fait est une pénalité : la page est celle qui parle de pénalités."""
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    dossier = tmp_path / "projects" / "p-req"
    dossier.mkdir(parents=True)
    (dossier / "ccap.pdf").write_bytes(pdf_texte([
        "Cahier inventé", "Tableau des lots : peinture inventée, plomberie inventée, couverture inventée",
        "Article inventé", "Les penalites de retard sont de 1/1000 par jour calendaire."]))
    db_session.add(Project(id="p-req", organization_id=test_org.id, name="AO"))
    db_session.add(ProjectDocument(id="d-req", project_id="p-req", type="ccap", file_name="ccap.pdf",
                                   file_url="/uploads/projects/p-req/ccap.pdf"))
    db_session.commit()
    champs = {"penalites": {"value": {"retard": "1/1000 par jour", "plafond": None},
                            "source": {"document": "ccap.pdf", "page": None,
                                       "excerpt": "Tableau des lots : peinture inventée, plomberie inventée, couverture inventée"}}}
    res = critical_fields_pages.resoudre_pages(db_session, "p-req", champs)
    assert res["penalites"]["source"]["page"] == 4
