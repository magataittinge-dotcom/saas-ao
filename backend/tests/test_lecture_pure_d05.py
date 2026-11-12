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


def test_mes_ao_ordre_stable_a_mise_a_jour_egale(client, db_session, test_org):
    """RESTES-3 (PERF § 6) — la liste du serveur départage les mises à jour égales par l'identifiant (ordre stable)."""
    from datetime import datetime
    meme = datetime(2026, 11, 1, 12, 0, 0)
    for pid in ("p-ordre-c", "p-ordre-a", "p-ordre-b"):
        db_session.add(Project(id=pid, organization_id=test_org.id, name="AO inventé", updated_at=meme))
    db_session.commit()
    ids = [p["id"] for p in client.get("/api/projects").json() if p["id"].startswith("p-ordre-")]
    assert ids == ["p-ordre-a", "p-ordre-b", "p-ordre-c"]


def test_dossier_sans_lot_une_seule_cle_et_la_lecture_ne_recalcule_rien(client, db_session, test_org, monkeypatch):
    """RESTES-3 point 8 (REVUE-2 P2-3) — un dossier sans lot était rangé sous « all » (spec de lot) et lu sous « _all » :
    chaque lecture recalculait champs et pages. Une seule clé (« _all ») ; la lecture relit ce que l'analyse a rangé."""
    from routers import analysis
    from schemas.project import ProjectResponse
    from services import critical_fields as cf, critical_fields_pages as cfp
    db_session.add(Project(id="p-sans-lot", organization_id=test_org.id, name="AO", selected_lot=None))
    db_session.add(ProjectDocument(project_id="p-sans-lot", type="rc", file_name="rc.pdf",
                                   file_url="/uploads/projects/p-sans-lot/rc.pdf", extracted_text=REMISE))
    db_session.commit()
    analyse = {"requirements": [{"exigence": "Remettre l'offre", "source_document": "rc.pdf",
                                 "category": "administratif", "priority": "obligatoire"}],
               "criteres_jugement": [], "infos_marche": {"date_limite_reponse": "12/03/2027"}}
    monkeypatch.setattr(analysis, "controler_infos_marche", lambda i, *a, **k: i, raising=False)
    analysis._finalize_analysis(db_session, "p-sans-lot", test_org.id, analyse, 1, 1, lot_specs=[{"lot_id": "all"}])
    db_session.expire_all()
    projet = db_session.get(Project, "p-sans-lot")
    assert list(projet.critical_fields) == ["_all"]
    assert ProjectResponse.model_validate(projet).model_dump()["lots_analyses"] == []

    appels = {"champs": 0, "pages": 0}
    vrai_pages = cfp.resoudre_pages
    monkeypatch.setattr(cf, "build_critical_fields", lambda *a, **k: appels.__setitem__("champs", appels["champs"] + 1) or {})
    monkeypatch.setattr(cfp, "resoudre_pages", lambda *a, **k: appels.__setitem__("pages", appels["pages"] + 1) or vrai_pages(*a, **k))
    premiere = client.get("/api/projects/p-sans-lot/critical-fields").json()
    apres_premiere = dict(appels)
    seconde = client.get("/api/projects/p-sans-lot/critical-fields").json()
    assert premiere == seconde and premiere["fields"]["date_limite_remise"]["value"]["date"] == "2027-03-12"
    assert appels["champs"] == 0, "les champs rangés par l'analyse sont relus, jamais recalculés"
    assert appels == apres_premiere, "la seconde lecture ne recalcule rien"


def test_dossier_sans_lot_range_avant_le_correctif_sous_all_est_relu(client, db_session, test_org, monkeypatch):
    """Les dossiers sans lot déjà analysés gardent leurs champs sous « all » : la lecture les relit (aucun recalcul)."""
    from services import critical_fields as cf
    ranges = {"date_limite_remise": {"value": {"date": "2027-03-12", "heure": None}, "source": None}}
    db_session.add(Project(id="p-sans-lot-ancien", organization_id=test_org.id, name="AO", selected_lot=None,
                           critical_fields={"all": ranges}))
    db_session.commit()
    monkeypatch.setattr(cf, "build_critical_fields", lambda *a, **k: (_ for _ in ()).throw(AssertionError("recalcul")))
    corps = client.get("/api/projects/p-sans-lot-ancien/critical-fields").json()
    assert corps["fields"]["date_limite_remise"]["value"]["date"] == "2027-03-12"


def test_le_cache_des_champs_lus_suit_les_pieces_du_dossier(client, db_session, test_org, monkeypatch):
    """RESTES-4 — la clé du cache `_LECTURES_CF` contient une empreinte des pièces : une pièce ajoutée, retypée ou
    dont le texte arrive (extraction différée) sur un lot jamais rangé relance le calcul, sans redémarrage."""
    import routers.analysis as analysis_mod
    import services.critical_fields as cf
    monkeypatch.setattr(analysis_mod, "_LECTURES_CF", analysis_mod.OrderedDict())
    vraie, appels = cf.build_critical_fields, []

    def espion(*a, **k):
        appels.append(1)
        return vraie(*a, **k)
    monkeypatch.setattr(cf, "build_critical_fields", espion)
    pid = "p-d05-pieces"
    db_session.add(Project(id=pid, organization_id=test_org.id, name="AO", selected_lot="lot2",
                           infos_marche=INFOS_MARCHE, criteres_jugement=CRITERES))
    db_session.add(ProjectDocument(id="d-rc", project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
                                   file_name="RC_Gueux.pdf", extracted_text=RC_TEXT))
    db_session.commit()

    def lire():
        r = client.get(f"/api/projects/{pid}/critical-fields")
        assert r.status_code == 200, r.text
        return r.json()
    lire()
    lire()
    assert len(appels) == 1                                            # le cache sert la seconde lecture

    db_session.add(ProjectDocument(id="d-ccap", project_id=pid, type="autre", file_url=f"/uploads/projects/{pid}/c.pdf",
                                   file_name="CCAP_Gueux.pdf", extracted_text=None))
    db_session.commit()
    lire()
    assert len(appels) == 2                                            # pièce ajoutée

    db_session.get(ProjectDocument, "d-ccap").type = "ccap"
    db_session.commit()
    lire()
    assert len(appels) == 3                                            # pièce retypée

    db_session.get(ProjectDocument, "d-ccap").extracted_text = CCAP_TEXT
    db_session.commit()
    sans_cache = cf.build_critical_fields(INFOS_MARCHE, CRITERES, db_session.query(ProjectDocument)
                                          .filter(ProjectDocument.project_id == pid).all())
    corps = lire()
    assert len(appels) == 5                                            # texte arrivé (+ l'appel de référence)
    assert {k: v.get("value") for k, v in corps["fields"].items()} == \
        {k: v.get("value") for k, v in sans_cache.items()}
    lire()
    assert len(appels) == 5                                            # et le cache resert ensuite
