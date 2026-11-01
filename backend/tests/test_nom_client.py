"""Références « particulier » (migration 0031) : initiales par défaut sur les fiches et dans le mémoire, nom complet
seulement si l'entreprise l'a coché (RGPD, décision du 1er/11)."""
from pathlib import Path
from types import SimpleNamespace

from alembic.config import Config
from alembic.script import ScriptDirectory

from models.reference import Reference
from services.nom_client import initiales, nom_client_affiche
from tests import fiches_fabrique as fab

BACKEND = Path(__file__).resolve().parent.parent


def test_0031_suit_0030_une_seule_head_et_colonne_non_nulle_par_defaut_faux():
    script = ScriptDirectory.from_config(Config(str(BACKEND / "alembic.ini")))
    assert script.get_revision("0031").down_revision == "0030"
    assert len(script.get_heads()) == 1
    col = Reference.__table__.c["client_nom_complet"]
    assert not col.nullable and col.server_default is not None


def test_initiales_gardent_civilites_et_traits_d_union():
    assert initiales("Mme Dubois") == "Mme D."
    assert initiales("Jean-Pierre Martin") == "J.-P. M."
    assert initiales("M. Ali Ben Salah") == "M. A. B. S."
    assert initiales("  Dupont ") == "D."


def test_nom_affiche_initiales_sauf_accord_et_clients_non_particuliers_inchanges():
    assert nom_client_affiche("Mme Dubois", "particulier", False) == "Mme D."
    assert nom_client_affiche("Mme Dubois", "particulier", None) == "Mme D."
    assert nom_client_affiche("Mme Dubois", "particulier", True) == "Mme Dubois"
    assert nom_client_affiche("Ville de Reims", "public", False) == "Ville de Reims"
    assert nom_client_affiche("Sablier SAS", None, False) == "Sablier SAS"
    assert nom_client_affiche(None, "particulier", False) == ""


def _reference(**surcharges):
    base = dict(fab.champs_reference(0), maitre_ouvrage="Mme Dubois", client_type="particulier",
                client_adresse="4 rue des Roses, 51100 Reims", mode_intervention="direct", description="Extension",
                maitre_oeuvre=None, statut="gagné", is_reference=True, client_nom_complet=False)
    base.update(surcharges)
    return SimpleNamespace(**base)


def test_fiche_references_initiales_par_defaut_nom_complet_si_coche(db_session):
    org = fab.creer_entreprise(db_session, org_id="org-nom-client")
    lignes = fab.donnees(db_session, org, "certifications", references=[_reference()])["references"]["lignes"]
    assert lignes[0]["client"] == "Mme D." and lignes[0]["particulier"] is True
    assert lignes[0]["client_adresse"] == "4 rue des Roses, 51100 Reims"
    coche = fab.donnees(db_session, org, "certifications", references=[_reference(client_nom_complet=True)])
    assert coche["references"]["lignes"][0]["client"] == "Mme Dubois"
    # Le compte des donneurs d'ordre ne change pas avec l'affichage.
    deux = fab.donnees(db_session, org, "certifications", references=[_reference(), _reference(client_nom_complet=True)])
    assert deux["references"]["total"]["donneurs_ordre"] == 1


# ─── Textes abrégés sur les fiches : la coupure se voit toujours (« … »), décision du 1er/11 ───

def test_court_signale_toujours_la_coupure_par_points_de_suspension():
    from services import fiches_donnees as fd
    assert fd._court("Court.", 20) == "Court."
    phrase = "Première phrase assez longue. Seconde phrase. Troisième phrase qui dépasse la limite."
    coupe = fd._court(phrase, 45)
    assert coupe == "Première phrase assez longue …"   # coupé à la fin de phrase, point remplacé par la marque
    sans_phrase = fd._court("mot " * 40, 30)
    assert sans_phrase.endswith(" …") and len(sans_phrase) <= 32
    assert not fd._court("a. " * 5, 100).endswith("…")
