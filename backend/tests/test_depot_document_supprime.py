"""Dépôt par rubrique — 4e point de la revue de sécurité : une lecture dont le document a été supprimé du coffre-fort (ou qui
n'est pas de la même entreprise) n'envoie rien au modèle : état terminal « ecartee », aucun appel."""
from datetime import datetime

from models.depot_entreprise import CoutIA, LectureDepot
from models.document import Document
from services import depot_extraction
from tests import depot_fabrique as fab
from tests.depot_fabrique import KBIS_COMPLET, coffre, deposer, deposer_et_lire, deux_orgs, etat_de, modele  # noqa: F401


def test_document_supprime_pendant_la_mise_en_attente_aucun_appel(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "0")                  # tout est différé
    m = modele({"kbis": KBIS_COMPLET})
    res = deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))[0]
    assert res["etat"] == "differee"
    assert client.delete(f"/api/documents/{res['document_id']}").status_code == 204
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "60")                 # la place revient
    etat_de(client, "kbis")                                           # l'ouverture de l'écran tente la reprise
    fab.attendre_les_lectures()
    assert m.appels == [] and db_session.query(CoutIA).count() == 0
    db_session.expire_all()
    assert db_session.get(LectureDepot, res["lecture_id"]).etat == "ecartee"
    assert etat_de(client, "kbis")["etat"] == "vide"                  # le fichier supprimé n'apparaît plus


def test_document_supprime_entre_le_depot_et_la_lecture_aucun_appel(client, coffre, db_session, modele):
    m = modele({"kbis": KBIS_COMPLET})
    doc = Document(organization_id="org-test-1", type="kbis", category="documents_legaux", file_url="/uploads/x/k.pdf",
                   file_name="k.pdf", status="unverified", rubrique_entreprise="identite", case_depot="kbis",
                   deleted_at=datetime.utcnow())
    db_session.add(doc)
    db_session.flush()
    lecture = LectureDepot(organization_id="org-test-1", document_id=doc.id, case_depot="kbis", rubrique="identite",
                           sha256="0" * 64, etat="en_lecture")
    db_session.add(lecture)
    db_session.commit()
    depot_extraction.traiter_lecture(lecture.id)
    assert m.appels == []
    db_session.expire_all()
    assert db_session.get(LectureDepot, lecture.id).etat == "ecartee"


def test_document_d_une_autre_organisation_aucun_appel(client, coffre, db_session, modele, deux_orgs):
    m = modele({"kbis": KBIS_COMPLET})
    doc = Document(organization_id="org-b", type="kbis", category="documents_legaux", file_url="/uploads/x/k.pdf",
                   file_name="k.pdf", status="unverified", rubrique_entreprise="identite", case_depot="kbis")
    db_session.add(doc)
    db_session.flush()
    lecture = LectureDepot(organization_id="org-test-1", document_id=doc.id, case_depot="kbis", rubrique="identite",
                           sha256="1" * 64, etat="en_lecture")
    db_session.add(lecture)
    db_session.commit()
    depot_extraction.traiter_lecture(lecture.id)
    assert m.appels == []
    db_session.expire_all()
    assert db_session.get(LectureDepot, lecture.id).etat == "ecartee"


def test_document_absent_aucun_appel(client, coffre, db_session, modele):
    m = modele({"kbis": KBIS_COMPLET})
    lecture = LectureDepot(organization_id="org-test-1", document_id="n-existe-pas", case_depot="kbis", rubrique="identite",
                           sha256="2" * 64, etat="en_lecture")
    db_session.add(lecture)
    db_session.commit()
    depot_extraction.traiter_lecture(lecture.id)
    assert m.appels == []
    db_session.expire_all()
    assert db_session.get(LectureDepot, lecture.id).etat == "ecartee"
