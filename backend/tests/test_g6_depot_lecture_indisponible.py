"""G6 (recette Ozcan) — le dépôt de « Mon entreprise » passe par le même pré-vol IA que l'analyse et le mémoire.

Avant : sans clé ou avec un service IA en panne, la lecture partait quand même et levait une `TypeError` interne ;
le patron lisait « Ce fichier n'a pas pu être lu. » en petit gris, sans issue.
Maintenant : le fichier reste dans le coffre-fort, aucun appel ne part, rien n'entre dans le profil, et la phrase dit
ce qui se passe et ce qu'on peut faire (saisir à la main). Aucun appel réel : `_ping` et le modèle sont simulés."""
import pytest

from models.depot_entreprise import LectureDepot, PropositionProfil
from models.document import Document
from models.organization import Organization
from tests import depot_fabrique as fab
from tests.depot_fabrique import (KBIS_COMPLET, BASE, coffre, deposer, deposer_et_lire, deux_orgs, etat_de,  # noqa: F401
                                  modele)

PHRASE = "Lecture indisponible : le fichier est dans votre coffre-fort, vous pouvez saisir à la main."


def _ia_indisponible(monkeypatch):
    from services.ai import api_preflight

    def _boom():
        raise RuntimeError("credit balance is too low")
    monkeypatch.setattr(api_preflight, "_ping", _boom)
    api_preflight._cache.update(ts=0.0, ok=False)


def _kbis(n=0):
    return (f"kbis{n}.pdf", fab.pdf(fab.TEXTE_KBIS + f"\nDossier {n}"))


def test_lecture_indisponible_le_fichier_reste_au_coffre_et_rien_n_est_invente(
        client, coffre, db_session, modele, monkeypatch):
    m = modele({"kbis": KBIS_COMPLET})
    _ia_indisponible(monkeypatch)
    org_avant = db_session.get(Organization, "org-test-1").forme_juridique

    res = deposer_et_lire(client, "kbis", _kbis())[0]

    assert res["accepte"] is True and res["etat"] == "echec"
    assert db_session.get(Document, res["document_id"]) is not None        # au coffre-fort
    assert m.appels == []                                                   # aucun appel au modèle
    assert db_session.query(PropositionProfil).count() == 0                 # rien d'inventé, rien dans le profil
    lecture = db_session.query(LectureDepot).one()
    assert lecture.etat == "echec" and lecture.message == PHRASE
    case = etat_de(client, "kbis")
    assert case["note"] == PHRASE and case["vers_verifier"] is False
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1").forme_juridique == org_avant


def test_une_lecture_normale_n_est_pas_touchee_par_le_pre_vol(client, coffre, db_session, modele):
    m = modele({"kbis": KBIS_COMPLET})
    res = deposer_et_lire(client, "kbis", _kbis())[0]
    assert res["etat"] in ("en_lecture", "lu") and len(m.appels) == 1


def test_le_meme_fichier_peut_etre_redepose_quand_le_service_revient(client, coffre, db_session, modele, monkeypatch):
    modele({"kbis": KBIS_COMPLET})
    _ia_indisponible(monkeypatch)
    deposer_et_lire(client, "kbis", _kbis())
    from services.ai import api_preflight    # le service revient
    monkeypatch.setattr(api_preflight, "_ping", lambda: None)
    api_preflight._cache.update(ts=0.0, ok=False)
    m = modele({"kbis": KBIS_COMPLET})
    res = deposer_et_lire(client, "kbis", _kbis())[0]
    assert res.get("deja_depose") is False and len(m.appels) == 1
