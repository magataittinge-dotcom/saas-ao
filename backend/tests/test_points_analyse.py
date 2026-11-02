"""« Points à éclaircir » dans l'analyse des nouveaux AO (passe 1). Aucun appel réel : le flux du modèle est simulé."""
import json
from types import SimpleNamespace

from models.project import Project, ProjectDocument
from services import points_eclaircir as pe
from services.ai import dce_analyzer as dce
from services.ai.prompts import DCE_PASS1_SYSTEM, DCE_PASS2_SYSTEM
from tests.test_memoire_generator_segments import _FakeStream

RC = "Règlement (texte inventé). Article 3 : le délai d'exécution est à préciser selon le phasage retenu avec le maître d'ouvrage. " * 3


def _analyseur(sorties):
    a = dce.DCEAnalyzer()
    a._demo_mode = False
    file = list(sorties)
    a.client = SimpleNamespace(messages=SimpleNamespace(stream=lambda **kw: _FakeStream(file.pop(0))))
    return a


def _q(i, extrait="le délai d'exécution est à préciser selon le phasage retenu"):
    return {"question": f"Pourriez-vous préciser le point numéro {i} du dossier ?", "pourquoi": "Flou.", "source_document": "RC", "source_page": None, "extrait": extrait}


def test_le_prompt_de_la_passe_1_demande_les_questions_sans_prix_et_la_passe_2_ne_change_pas():
    assert '"points_a_eclaircir"' in DCE_PASS1_SYSTEM and "8 au plus" in DCE_PASS1_SYSTEM
    assert "JAMAIS de question sur le prix" in DCE_PASS1_SYSTEM
    assert "points_a_eclaircir" not in DCE_PASS2_SYSTEM


def test_la_passe_1_rend_les_points_dans_infos_marche():
    reponse = json.dumps({"requirements": [], "criteres_jugement": [], "infos_marche": {"objet": "x", "points_a_eclaircir": [_q(1)]}})
    r = _analyseur([reponse])._run_pass_chunked(RC, DCE_PASS1_SYSTEM, "passe1-admin")
    assert r["infos_marche"]["points_a_eclaircir"][0]["question"].startswith("Pourriez-vous préciser")


def test_les_tranches_additionnent_leurs_points_huit_au_plus_sans_doublon():
    tranches = [{"objet": "x", "points_a_eclaircir": [_q(i) for i in range(5)]},
                {"objet": "y", "points_a_eclaircir": [_q(i) for i in range(3, 9)]},
                {"points_a_eclaircir": []}]
    infos = dce.fusionner_infos_marche(tranches)
    assert infos["objet"] == "x" and len(infos["points_a_eclaircir"]) == 8
    assert len({p["question"] for p in infos["points_a_eclaircir"]}) == 8


def test_une_liste_vide_est_gardee_pour_dire_rien_a_poser_et_une_analyse_ancienne_n_a_pas_la_cle():
    assert dce.fusionner_infos_marche([{"objet": "x", "points_a_eclaircir": []}])["points_a_eclaircir"] == []
    assert "points_a_eclaircir" not in dce.fusionner_infos_marche([{"objet": "x"}])


def test_ancrage_a_la_finalisation_verbatim_sans_prix_et_sans_source_inventee(db_session, test_org):
    from routers.analysis import _ancrer_points_safe
    db_session.add(Project(id="p-pt", organization_id=test_org.id, name="AO", status="en_cours"))
    db_session.add(ProjectDocument(project_id="p-pt", type="rc", file_url="x", file_name="RC-demo.pdf", extracted_text=RC))
    db_session.commit()
    infos = {"objet": "x", "points_a_eclaircir": [
        _q(1), _q(2, extrait="zzz qqq xxx www jjj kkk vvv"),
        {"question": "Pourriez-vous confirmer le montant estimé des travaux ?", "pourquoi": "Budget.", "source_document": "RC", "extrait": "le délai d'exécution est à préciser"}]}
    _ancrer_points_safe(db_session, "p-pt", infos)
    points = infos["points_a_eclaircir"]
    assert len(points) == 1 and points[0]["question"].endswith("numéro 1 du dossier ?")
    assert points[0]["source_document"] == "RC-demo.pdf" and points[0]["extrait"] in RC


def test_sans_la_cle_l_analyse_ancienne_n_est_pas_touchee(db_session):
    from routers.analysis import _ancrer_points_safe
    infos = {"objet": "x"}
    _ancrer_points_safe(db_session, "inconnu", infos)
    assert infos == {"objet": "x"}
    assert pe.lire_points(infos) == []
