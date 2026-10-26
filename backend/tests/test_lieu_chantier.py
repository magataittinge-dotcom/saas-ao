"""Lieu d'exécution sourcé (sprint Ozcan, lieu A) — contrôle sans IA, sans réseau.

Textes et adresses INVENTÉS. Décision de Mohamed : le lieu d'exécution n'est
utilisé que s'il est donné par le RC ou le CCAP, avec sa source ; jamais deviné.
"""
import logging
from types import SimpleNamespace

from services import maps_service as ms
from services.ai import prompts
from services.lieu_chantier import (
    controler_infos_marche, libelle_source, lire_lieu, valider_lieu_execution,
)

ADRESSE = "14 rue des Lilas, 51390 Gueux"
PHRASE = "Les travaux seront exécutés au 14 rue des Lilas, 51390 Gueux (école maternelle)."
RC = "ARTICLE 1 - Objet\nRénovation d'une école.\n2.1 Lieu d'exécution\n" + PHRASE + "\nARTICLE 3 - Durée"
CCAP = "Article 5 - Délais\nLe délai d'exécution est de 6 mois."


def _brut(**kw):
    base = {"adresse": ADRESSE, "document": "RC", "article": "2.1", "extrait": PHRASE}
    base.update(kw)
    return base


def _pieces():
    return [("rc", RC), ("ccap", CCAP), ("cctp", "Au 99 avenue du Test, 75000 Paris : gros œuvre.")]


def test_extrait_present_dans_le_rc_adresse_utilisee():
    lieu = valider_lieu_execution(_brut(), _pieces())
    assert lieu["adresse"] == ADRESSE and lieu["document"] == "RC" and lieu["article"] == "2.1"
    assert lieu["extrait"] == PHRASE                       # verbatim du document


def test_extrait_retrouve_malgre_apostrophes_retours_ligne_et_casse():
    rc = "Lieu :\nLes  travaux seront exécutés au 14 RUE des Lilas,\n51390 Gueux (école maternelle).\n"
    brut = _brut(extrait="les travaux seront executes au 14 rue des Lilas, 51390 Gueux")
    lieu = valider_lieu_execution(brut, [("rc", rc)])
    # texte réel du document (casse d'origine), pas la copie de l'IA
    assert lieu["extrait"] == "Les travaux seront exécutés au 14 RUE des Lilas, 51390 Gueux"


def test_extrait_absent_du_rc_ecarte():
    assert valider_lieu_execution(_brut(extrait="Chantier situé au 14 rue des Lilas, 51390 Gueux."),
                                  _pieces()) is None


def test_adresse_hors_de_l_extrait_ecartee():
    assert valider_lieu_execution(_brut(adresse="8 avenue de la Gare, 51100 Reims"), _pieces()) is None
    # l'extrait existe bien dans le RC, mais ne donne pas cette adresse
    assert valider_lieu_execution(_brut(extrait="Rénovation d'une école."), _pieces()) is None


def test_piece_citee_autre_que_rc_ou_ccap_ecartee():
    cctp = [("cctp", PHRASE)]
    assert valider_lieu_execution(_brut(document="CCTP"), cctp) is None
    assert valider_lieu_execution(_brut(document="AE"), [("ae", PHRASE)]) is None
    assert valider_lieu_execution(_brut(document="plans"), _pieces()) is None


def test_piece_citee_doit_contenir_l_extrait():
    # l'extrait est dans le RC, l'IA cite le CCAP : écarté
    assert valider_lieu_execution(_brut(document="CCAP"), _pieces()) is None
    # et dans un CCAP quand elle le cite : gardé
    lieu = valider_lieu_execution(_brut(document="CCAP", article="3.2"), [("ccap", "Art 3.2\n" + PHRASE)])
    assert lieu and lieu["document"] == "CCAP"


def test_champ_absent_ou_nul_ou_ancien_format():
    assert valider_lieu_execution(None, _pieces()) is None
    assert valider_lieu_execution({}, _pieces()) is None
    assert valider_lieu_execution(ADRESSE, _pieces()) is None            # ancien format : chaîne
    assert valider_lieu_execution(_brut(extrait=""), _pieces()) is None


def test_adresse_egale_a_l_acheteur_ecartee():
    phrase = "Chantier : Commune de GUEUX."
    brut = _brut(adresse="Commune de GUEUX", extrait=phrase)
    assert valider_lieu_execution(brut, [("rc", phrase)], "Commune de Gueux") is None


def test_le_journal_ne_contient_aucun_texte_du_dce(caplog):
    with caplog.at_level(logging.INFO):
        valider_lieu_execution(_brut(extrait="Une phrase qui n'existe pas dans le RC du dossier."), _pieces())
        valider_lieu_execution(_brut(adresse="8 avenue de la Gare, 51100 Reims"), _pieces())
    journal = " ".join(r.getMessage() for r in caplog.records)
    assert "écarté" in journal
    for mot in ("Lilas", "Gueux", "Gare", "phrase"):
        assert mot not in journal


def test_controler_infos_marche_garde_le_valide_retire_le_reste():
    docs = [SimpleNamespace(type="rc", extracted_text=RC, is_user_completed=False)]
    sortie = controler_infos_marche({"objet": "x", "lieu_execution": _brut()}, docs)
    assert sortie["lieu_execution"]["adresse"] == ADRESSE and sortie["objet"] == "x"
    sortie = controler_infos_marche({"objet": "x", "lieu_execution": _brut(document="CCTP")}, docs)
    assert "lieu_execution" not in sortie and sortie["objet"] == "x"
    # ancien format d'un AO déjà analysé : retiré à la prochaine analyse
    assert "lieu_execution" not in controler_infos_marche({"lieu_execution": ADRESSE}, docs)
    # pièce remplie par l'entreprise : jamais une source
    docs[0].is_user_completed = True
    assert "lieu_execution" not in controler_infos_marche({"lieu_execution": _brut()}, docs)
    assert controler_infos_marche({"objet": "x"}, docs) == {"objet": "x"}
    assert controler_infos_marche(None, docs) is None


def test_la_carte_ne_lit_que_le_format_source():
    def projet(infos):
        return SimpleNamespace(infos_marche=infos, maitre_ouvrage="Commune de GUEUX")
    assert ms.lieu_execution(projet({"lieu_execution": ADRESSE})) is None      # ancien format : siège seul
    assert ms.lieu_execution(projet({})) is None and ms.lieu_execution(projet(None)) is None
    ok = projet({"lieu_execution": _brut()})
    assert ms.lieu_execution(ok) == ADRESSE and ms.lieu_source(ok) == "RC, art. 2.1"
    sans_extrait = projet({"lieu_execution": _brut(extrait="")})
    assert ms.lieu_execution(sans_extrait) is None and ms.lieu_source(sans_extrait) is None
    hors = projet({"lieu_execution": _brut(adresse="8 avenue de la Gare, 51100 Reims")})
    assert ms.lieu_execution(hors) is None
    autre = projet({"lieu_execution": _brut(document="CCTP")})
    assert ms.lieu_execution(autre) is None


def test_libelle_source():
    assert libelle_source({"document": "RC", "article": "2.1"}) == "RC, art. 2.1"
    assert libelle_source({"document": "CCAP", "article": "Article 4.3"}) == "CCAP, art. 4.3"
    assert libelle_source({"document": "RC", "article": None}) == "RC"
    assert lire_lieu({"lieu_execution": _brut(article=" ")})["article"] is None


def test_legende_cite_la_source_du_chantier():
    from datetime import date
    legende = ms._legende(["Siège", "Chantier"], "1 rue A 51100 Reims", ADRESSE, 3.9, date(2026, 10, 26),
                          "RC, art. 2.1")
    assert f"{ADRESSE} — RC, art. 2.1" in legende
    seul = ms._legende(["Chantier"], "", ADRESSE, None, date(2026, 10, 26), "CCAP, art. 5")
    assert "CCAP, art. 5" in seul
    # chantier non repéré sur la carte : aucune source affichée
    assert "RC" not in ms._legende(["Siège"], "1 rue A 51100 Reims", ADRESSE, None, date(2026, 10, 26), "RC")


def test_prompt_d_analyse_demande_le_lieu_sourcé_sans_appel_payant():
    for prompt in (prompts.DCE_PASS1_SYSTEM, prompts.DCE_ANALYSIS_SYSTEM):
        assert '"lieu_execution"' in prompt
        assert '"document": "RC" | "CCAP"' in prompt
        assert "extrait" in prompt
    regle = prompts.DCE_PASS1_SYSTEM
    assert "UNIQUEMENT si le RC ou le CCAP donne explicitement" in regle
    assert "Jamais déduit" in regle and "null" in regle
    # la passe technique ne l'extrait pas
    assert "lieu_execution" not in prompts.DCE_PASS2_SYSTEM


# ── Fusion des tranches de la passe 1 : le premier lieu qui PASSE le contrôle ──

def test_fusion_trois_tranches_invalide_vide_valide_garde_le_valide():
    from services.ai.dce_analyzer import fusionner_infos_marche
    invalide = _brut(extrait="Chantier situé au 14 rue des Lilas, 51390 Gueux.")   # absent du RC
    tranches = [
        {"objet": "Rénovation", "lieu_execution": invalide},    # tranche 1 : invalide
        {"objet": "autre", "lieu_execution": None},             # tranche 2 : vide
        {"lieu_execution": _brut()},                            # tranche 3 : valide
    ]
    infos = fusionner_infos_marche(tranches)
    assert infos["objet"] == "Rénovation"                       # autres champs : premier non vide, inchangé
    docs = [SimpleNamespace(type="rc", extracted_text=RC, is_user_completed=False)]
    sortie = controler_infos_marche(infos, docs)
    assert sortie["lieu_execution"]["extrait"] == PHRASE
    assert "lieu_execution_candidats" not in sortie             # jamais persisté


def test_fusion_aucune_tranche_valide_siege_seul():
    from services.ai.dce_analyzer import fusionner_infos_marche
    tranches = [{"lieu_execution": _brut(document="CCTP")},
                {"lieu_execution": _brut(adresse="8 avenue de la Gare, 51100 Reims")},
                {"lieu_execution": ""}]
    docs = [SimpleNamespace(type="rc", extracted_text=RC, is_user_completed=False)]
    sortie = controler_infos_marche(fusionner_infos_marche(tranches), docs)
    assert "lieu_execution" not in sortie and "lieu_execution_candidats" not in sortie


def test_fusion_une_seule_tranche_sans_lieu_ne_change_rien():
    from services.ai.dce_analyzer import fusionner_infos_marche
    assert fusionner_infos_marche([{"objet": "x"}, {}, None]) == {"objet": "x"}
