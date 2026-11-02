"""Date limite des questions lue dans le RC (sans IA). Textes INVENTÉS — jamais un extrait de DCE réel."""
from datetime import date

import pytest

from services.date_questions import trouver_date_questions

REMISE = date(2027, 3, 22)


def _lire(texte, remise=REMISE, nom="RC-demo.pdf"):
    return trouver_date_questions([(nom, texte)], remise)


def test_relative_en_jours_chiffres_calculee_depuis_la_remise():
    r = _lire("Les demandes de renseignements complémentaires doivent parvenir à l'acheteur au plus tard 10 jours avant la date limite de dépôt des plis.")
    assert (r["statut"], r["regle"], r["jours"], r["date"]) == ("trouvee", "relative", 10, "2027-03-12")
    assert r["document"] == "RC-demo.pdf" and "10 jours avant la date limite" in r["extrait"]


def test_relative_en_lettres_avec_chiffres_entre_parentheses():
    r = _lire("Les candidats peuvent poser leurs questions jusqu'à huit (8) jours calendaires avant la date limite de réception des plis.")
    assert (r["statut"], r["jours"], r["date"]) == ("trouvee", 8, "2027-03-14")


def test_relative_en_semaines():
    r = _lire("Toute question est posée au plus tard deux semaines avant la date limite de dépôt des plis.")
    assert (r["statut"], r["jours"], r["date"]) == ("trouvee", 14, "2027-03-08")


def test_absolue_numerique_avec_heure():
    r = _lire("Les questions doivent être transmises par la plateforme au plus tard le 12/03/2027 à 12h00.")
    assert (r["statut"], r["regle"], r["date"], r["heure"]) == ("trouvee", "absolue", "2027-03-12", "12h00")


def test_absolue_en_toutes_lettres_avec_premier():
    r = _lire("Toute demande de renseignements complémentaires est adressée avant le 1er mars 2027.", remise=None)
    assert (r["statut"], r["date"]) == ("trouvee", "2027-03-01")


def test_absolue_fixee_au_et_deux_points():
    assert _lire("La date limite de réception des questions est fixée au 5 mars 2027.", remise=None)["date"] == "2027-03-05"
    assert _lire("Date limite des questions : 05/03/2027", remise=None)["date"] == "2027-03-05"


def test_jours_ouvres_ne_sont_pas_calcules_mais_la_phrase_est_gardee():
    r = _lire("Les questions sont posées au plus tard cinq jours ouvrés avant la date limite de dépôt des plis.")
    assert r["statut"] == "a_verifier" and r["date"] is None and r["jours"] == 5
    assert "cinq jours ouvrés" in r["extrait"] and r["motif"]


def test_relative_sans_date_de_remise_connue_reste_a_verifier():
    r = _lire("Les questions sont posées au plus tard 7 jours avant la date limite de dépôt des plis.", remise=None)
    assert r["statut"] == "a_verifier" and r["date"] is None and r["jours"] == 7 and "remise" in r["motif"]


def test_absente_du_reglement():
    r = _lire("Les offres sont remises sur la plateforme de dématérialisation. Elles sont rédigées en français.")
    assert r["statut"] == "a_verifier" and r["date"] is None and r["extrait"] is None and r["document"] is None


def test_le_delai_de_reponse_de_lacheteur_nest_pas_celui_des_questions():
    r = _lire("Les réponses aux questions seront communiquées à tous les candidats six jours au plus tard avant la date limite de dépôt des plis.")
    assert r["statut"] == "a_verifier" and r["date"] is None


def test_une_autre_phrase_ne_compte_pas():
    r = _lire("Les candidats peuvent poser des questions sur la plateforme. La visite a lieu avant le 10/03/2027.", remise=None)
    assert r["statut"] == "a_verifier"


def test_cherche_dans_la_piece_suivante_et_cite_son_nom():
    r = trouver_date_questions([("RC-demo.pdf", "Les offres sont remises par voie électronique."),
                                ("CCAP-demo.pdf", "Les questions parviennent au plus tard 9 jours avant la date limite de dépôt des plis.")], REMISE)
    assert (r["document"], r["date"]) == ("CCAP-demo.pdf", "2027-03-13")


def test_texte_vide_ou_volumineux_ne_plante_pas():
    assert trouver_date_questions([("RC.pdf", ""), ("CCAP.pdf", "[document volumineux — texte non extrait]")], REMISE)["statut"] == "a_verifier"


@pytest.mark.parametrize("texte", ["Les questions au plus tard le 31/02/2027.", "Questions avant le 12/13/2027."])
def test_date_impossible_nest_pas_inventee(texte):
    assert _lire(texte, remise=None)["statut"] == "a_verifier"
