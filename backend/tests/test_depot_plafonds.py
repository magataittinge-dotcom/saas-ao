"""Dépôt par rubrique — revue de sécurité du coordinateur : chaque lecture est un appel payant, donc plafonnée par
entreprise AVANT de partir (appels par jour, dépense du mois, lectures en attente). Au-delà, le fichier entre quand même au
coffre-fort, sans lecture, avec un état positif ; la lecture reprend quand la place revient. Aucun appel réel."""
from datetime import datetime, timedelta

import pytest

from models.depot_entreprise import CoutIA, LectureDepot, PropositionProfil
from models.document import Document
from tests import depot_fabrique as fab
from tests.depot_fabrique import (DECENNALE_COMPLETE, KBIS_COMPLET, attendre_les_lectures, coffre, deposer,  # noqa: F401
                                  deposer_et_lire, deux_orgs, etat_de, modele)
from tests.test_depot_lecture import _modele_references, _pdf_20_pages

DEMAIN = "Déposé dans le coffre-fort · lecture automatique reprise demain"
MOIS = "Déposé dans le coffre-fort · lecture automatique reprise le mois prochain"
PLACE = "Déposé dans le coffre-fort · lecture automatique reprise dès qu'une place se libère"


def _cout(db, org="org-test-1", eur=0.001, quand=None, n=1):
    for _ in range(n):
        db.add(CoutIA(organization_id=org, usage="depot_entreprise", modele="claude-haiku-4-5-20251001",
                      jetons_entree=300, jetons_sortie=200, cout_usd=eur / 0.92, cout_eur=eur,
                      created_at=quand or datetime.utcnow()))
    db.commit()


def _kbis(n=0):
    return (f"kbis{n}.pdf", fab.pdf(fab.TEXTE_KBIS + f"\nDossier {n}"))


def test_plafond_journalier_atteint_aucun_appel_et_etat_positif(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "2")
    m = modele({"kbis": KBIS_COMPLET})
    _cout(db_session, n=2)
    res = deposer_et_lire(client, "kbis", _kbis())[0]
    assert res["accepte"] is True and res["etat"] == "differee"
    assert m.appels == [] and db_session.query(CoutIA).count() == 2
    assert db_session.get(Document, res["document_id"]) is not None          # il est au coffre-fort
    case = etat_de(client, "kbis")
    assert case["etat"] == "differee" and case["libelle_etat"] == DEMAIN and case["vers_verifier"] is False
    assert db_session.query(PropositionProfil).count() == 0


def test_plafond_mensuel_atteint_aucun_appel_et_etat_positif(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_BUDGET_MENSUEL_EUR", "0.05")
    m = modele({"kbis": KBIS_COMPLET})
    _cout(db_session, eur=0.05)
    deposer_et_lire(client, "kbis", _kbis())
    assert m.appels == []
    assert etat_de(client, "kbis")["libelle_etat"] == MOIS


def test_les_plafonds_ont_des_valeurs_par_defaut(client, coffre, db_session, modele):
    from services import depot_budget
    assert depot_budget.plafonds() == {"appels_par_jour": 60, "budget_mensuel_eur": 3.0, "lectures_en_attente": 10}
    m = modele({"kbis": KBIS_COMPLET})
    _cout(db_session, n=59)                                  # 59 appels aujourd'hui : un de plus passe
    deposer_et_lire(client, "kbis", _kbis())
    assert len(m.appels) == 1


def test_une_autre_organisation_n_est_pas_touchee(client, coffre, db_session, modele, monkeypatch, deux_orgs):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "2")
    m = modele({"kbis": KBIS_COMPLET})
    _cout(db_session, org="org-test-1", n=2)
    fab.se_connecter_comme("user-b", "org-b")
    deposer_et_lire(client, "kbis", _kbis(1))
    assert len(m.appels) == 1 and etat_de(client, "kbis")["etat"] == "lu"
    fab.se_connecter_comme("user-test-1", "org-test-1")
    deposer_et_lire(client, "kbis", _kbis(2))
    assert len(m.appels) == 1 and etat_de(client, "kbis")["etat"] == "differee"


def test_redepot_identique_non_compte(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "1")
    m = modele({"kbis": KBIS_COMPLET})
    fichier = _kbis()
    deposer_et_lire(client, "kbis", fichier)
    assert len(m.appels) == 1                                # le plafond du jour est atteint
    second = deposer_et_lire(client, "kbis", ("copie.pdf", fichier[1]))[0]
    assert second["deja_depose"] is True
    assert db_session.query(LectureDepot).count() == 1 and db_session.query(CoutIA).count() == 1
    assert etat_de(client, "kbis")["etat"] == "lu"          # pas devenu « reprise demain »


def test_file_d_attente_bornee_puis_reprise_quand_la_place_revient(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_LECTURES_EN_ATTENTE", "2")
    m = modele({"kbis": KBIS_COMPLET}, pause=0.1)
    res = deposer(client, "kbis", *[_kbis(i) for i in range(4)]).json()["resultats"]
    assert [r["etat"] for r in res] == ["en_lecture", "en_lecture", "differee", "differee"]
    attendre_les_lectures()
    assert len(m.appels) == 2
    assert db_session.query(Document).count() == 4            # les quatre sont au coffre-fort
    # la place est revenue : l'ouverture de l'écran relance les deux fichiers en attente
    etat_de(client, "kbis")
    attendre_les_lectures()
    assert len(m.appels) == 4
    db_session.expire_all()
    assert {l.etat for l in db_session.query(LectureDepot).all()} == {"lu"}


def test_la_lecture_differee_reprend_le_lendemain(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "2")
    m = modele({"kbis": KBIS_COMPLET})
    _cout(db_session, n=2)
    deposer_et_lire(client, "kbis", _kbis())
    assert m.appels == [] and etat_de(client, "kbis")["libelle_etat"] == DEMAIN
    for c in db_session.query(CoutIA).all():
        c.created_at = datetime.utcnow() - timedelta(days=2)    # « le lendemain »
    db_session.commit()
    etat_de(client, "kbis")
    attendre_les_lectures()
    assert len(m.appels) == 1 and etat_de(client, "kbis")["etat"] == "lu"


def test_un_fichier_differe_redepose_ne_cree_ni_piece_ni_lecture(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "1")
    modele({"kbis": KBIS_COMPLET})
    _cout(db_session)
    fichier = _kbis()
    deposer_et_lire(client, "kbis", fichier)
    second = deposer_et_lire(client, "kbis", ("bis.pdf", fichier[1]))[0]
    assert second["deja_depose"] is True and db_session.query(Document).count() == 1


def test_le_plafond_arrete_aussi_une_lecture_en_cours_entre_deux_appels(client, coffre, db_session, modele, monkeypatch):
    monkeypatch.setenv("DEPOT_APPELS_PAR_JOUR", "2")
    m = modele({"references": _modele_references})
    res = deposer_et_lire(client, "references", ("memoire.pdf", _pdf_20_pages()))[0]
    assert len(m.appels) == 2, "le troisième morceau n'est pas envoyé"
    db_session.expire_all()
    lecture = db_session.get(LectureDepot, res["lecture_id"])
    assert lecture.etat == "lu" and "demain" in lecture.message and "partielle" in lecture.message
    assert 0 < db_session.query(PropositionProfil).count() < 20     # ce qui a été lu est proposé, le reste attend
    assert db_session.query(CoutIA).count() == 2
