"""Point 4 (mission SERVEUR-1) — les textes du serveur lus par un client s'accordent : plus de « (s) », plus de
« 1 matériels ». Le front corrigeait certains à l'affichage (SynorixScoreCard : « (s) » → « s », toujours au pluriel) ;
un texte déjà accordé y passe tel quel. Valeurs inventées."""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from services import fiches_donnees
from services.synorix_score import _eval_delai, _eval_qualifications


def _exigence(texte):
    return SimpleNamespace(exigence_text=texte, source_document="RC", source_page=2, source_excerpt=texte)


def _doc(type_, status="valid"):
    return SimpleNamespace(type=type_, status=status, expiry_date=None, issued_date=None)


@pytest.mark.parametrize("exigences,attendu", [
    (["Qualification Qualibat exigée"], "Qualification exigée, pas encore dans votre coffre-fort : Qualibat."),
    (["Qualibat exigée", "Certification RGE exigée"],
     "Qualifications exigées, pas encore dans votre coffre-fort : Qualibat, RGE."),
])
def test_qualifications_exigees_accordees(exigences, attendu):
    comp = _eval_qualifications([_exigence(t) for t in exigences], [_doc("kbis")])
    assert comp["explication"] == attendu


def test_aucun_pluriel_entre_parentheses_dans_le_score(monkeypatch):
    import services.synorix_score as score
    monkeypatch.setattr(score, "current_document_status", lambda d: "expired")
    une = _eval_qualifications([_exigence("Qualibat exigée")], [_doc("qualibat")])["explication"]
    deux = _eval_qualifications([_exigence("Qualibat et RGE exigés")], [_doc("qualibat"), _doc("rge")])["explication"]
    assert une.startswith("Qualification détenue mais expirée ou à vérifier : Qualibat")
    assert deux.startswith("Qualifications détenues mais expirées ou à vérifier : Qualibat, RGE")
    for texte in (une, deux):
        assert "(s)" not in texte and "(es)" not in texte


@pytest.mark.parametrize("jours,attendu", [
    (0, "La remise a lieu aujourd'hui — très court pour un dossier complet."),
    (1, "Il reste 1 jour — très court pour un dossier complet."),
    (5, "Il reste 5 jours — très court pour un dossier complet."),
])
def test_delai_accorde(jours, attendu):
    aujourd_hui = date(2026, 11, 12)
    champs = {"date_limite_remise": {"value": {"date": (aujourd_hui + timedelta(days=jours)).isoformat()}}}
    assert _eval_delai(champs, aujourd_hui)["explication"] == attendu


@pytest.mark.parametrize("n,singulier,pluriel", [
    (1, "personne", "personnes"), (1, "personne clé", "personnes clés"), (1, "chef d'équipe", "chefs d'équipe"),
    (1, "véhicule", "véhicules"), (1, "matériel", "matériels"), (1, "chantier", "chantiers"),
    (1, "chantier référencé", "chantiers référencés"), (1, "donneur d'ordre", "donneurs d'ordre"),
])
def test_tuiles_accordees(n, singulier, pluriel):
    assert fiches_donnees._tuile_accordee(1, singulier, pluriel) == {"valeur": "1", "libelle": singulier}
    assert fiches_donnees._tuile_accordee(3, singulier, pluriel) == {"valeur": "3", "libelle": pluriel}
    assert fiches_donnees._tuile_accordee(0, singulier, pluriel)["valeur"] == ""


def test_aucune_tuile_de_compte_ecrite_au_pluriel_seul():
    """Chaque tuile qui compte des choses passe par l'accord : plus de libellé pluriel figé à côté d'un nombre."""
    import inspect
    source = inspect.getsource(fiches_donnees)
    for figé in ('"matériels")', '"véhicules")', '"chefs d\'équipe")', '"chantiers")', '"chantiers référencés")',
                 '"donneurs d\'ordre")', '"personnes clés")'):
        assert f"_tuile(" not in source.split(figé)[0].rsplit("\n", 1)[-1], figé
