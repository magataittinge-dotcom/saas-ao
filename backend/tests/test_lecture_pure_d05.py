"""D-05 (audit données, solidité, coûts) — `GET /critical-fields` (et `/retroplanning`, `/synorix-score`, même calcul
paresseux) n'écrit plus en base : un GET qui écrit pouvait entrer en conflit avec une relance d'analyse.

Les champs critiques et la page de chaque source sont rangés à la fin de l'analyse (`_finalize_analysis`) ; un lot
jamais analysé (ou une recherche de pages d'une version antérieure) est calculé à la lecture, sans commit. Résultat
identique à l'écran : mêmes champs, même page. Textes inventés."""
import pytest
from sqlalchemy import event

from models.project import Project, ProjectDocument
from services import file_storage, pdfium_processus
from tests.pdf_fabrique import pdf_texte
from tests.test_critical_fields import CCAP_TEXT, CRITERES, INFOS_MARCHE, RC_TEXT

REMISE = "Les offres doivent parvenir au plus tard le 12/03/2027 à 12h00."


@pytest.fixture(autouse=True)
def _processus_propres():
    pdfium_processus.arreter()
    yield
    pdfium_processus.arreter()


@pytest.fixture
def ecritures(db_session):
    """Les ordres SQL d'écriture passés pendant le bloc (INSERT, UPDATE, DELETE), toutes connexions du moteur."""
    moteur = db_session.get_bind()
    vus: list[str] = []

    def espion(conn, curseur, ordre, params, contexte, multiple):
        if ordre.lstrip().split(" ", 1)[0].upper() in ("INSERT", "UPDATE", "DELETE"):
            vus.append(ordre)
    event.listen(moteur, "before_cursor_execute", espion)
    yield vus
    event.remove(moteur, "before_cursor_execute", espion)


def _projet(db, org_id, pid="p-d05"):
    db.add(Project(id=pid, organization_id=org_id, name="AO", selected_lot="lot2",
                   infos_marche=INFOS_MARCHE, criteres_jugement=CRITERES))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
                           file_name="RC_Gueux.pdf", extracted_text=RC_TEXT))
    db.add(ProjectDocument(project_id=pid, type="ccap", file_url=f"/uploads/projects/{pid}/ccap.pdf",
                           file_name="CCAP_Gueux.pdf", extracted_text=CCAP_TEXT))
    db.commit()


@pytest.mark.parametrize("chemin", ["critical-fields", "retroplanning", "synorix-score"])
def test_les_lectures_d_analyse_n_ecrivent_pas(client, db_session, test_org, ecritures, chemin):
    _projet(db_session, test_org.id)
    ecritures.clear()
    premiere = client.get(f"/api/projects/p-d05/{chemin}")
    seconde = client.get(f"/api/projects/p-d05/{chemin}")
    assert premiere.status_code == 200, premiere.text
    assert premiere.json() == seconde.json()
    assert ecritures == [], ecritures
    db_session.expire_all()
    assert db_session.get(Project, "p-d05").critical_fields is None


def test_resultat_identique_a_l_ecran(client, db_session, test_org):
    from services.critical_fields import build_critical_fields
    from services.critical_fields_pages import resoudre_pages
    _projet(db_session, test_org.id)
    docs = db_session.query(ProjectDocument).filter(ProjectDocument.project_id == "p-d05").all()
    attendu = build_critical_fields(INFOS_MARCHE, CRITERES, docs)
    attendu = resoudre_pages(db_session, "p-d05", attendu) or attendu
    corps = client.get("/api/projects/p-d05/critical-fields").json()
    assert corps == {"lot": "lot2", "fields": attendu}
    assert corps["fields"]["date_limite_remise"]["value"]["date"] == "2026-09-30"


def test_la_fin_de_l_analyse_range_les_champs_et_leur_page(client, db_session, test_org, tmp_path, monkeypatch):
    """Ce que le GET rangeait (la page de la source) est rangé par l'analyse ; le GET le relit tel quel."""
    from routers import analysis
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    dossier = tmp_path / "projects" / "p-d05p"
    dossier.mkdir(parents=True)
    (dossier / "rc.pdf").write_bytes(pdf_texte(["Page un.", "Page deux.", REMISE]))
    db_session.add(Project(id="p-d05p", organization_id=test_org.id, name="AO", selected_lot="lot1"))
    db_session.add(ProjectDocument(id="d-d05", project_id="p-d05p", type="rc", file_name="rc.pdf",
                                   file_url="/uploads/projects/p-d05p/rc.pdf", extracted_text=REMISE))
    db_session.commit()
    infos = {"date_limite_reponse": "12/03/2027"}
    analyse = {"requirements": [{"exigence": "Remettre l'offre", "source_document": "rc.pdf",
                                 "category": "administratif", "priority": "obligatoire"}],
               "criteres_jugement": [], "infos_marche": infos}
    monkeypatch.setattr(analysis, "controler_infos_marche", lambda i, *a, **k: i, raising=False)
    analysis._finalize_analysis(db_session, "p-d05p", test_org.id, analyse, 1, 1,
                                lot_specs=[{"lot_id": "lot1"}])
    db_session.expire_all()
    ranges = db_session.get(Project, "p-d05p").critical_fields["lot1"]
    source = ranges["date_limite_remise"]["source"]
    assert source["page"] == 3
    corps = client.get("/api/projects/p-d05p/critical-fields").json()
    assert corps["fields"] == ranges
