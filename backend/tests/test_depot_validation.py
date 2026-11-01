"""Dépôt par rubrique, tranche D3 : liste des propositions, validation (seules les cochées sont écrites, par les
mêmes règles que les formulaires), rejet, isolation entre entreprises. Aucun appel payant : modèle simulé."""
import json
from datetime import date

import pytest

from models.depot_entreprise import LectureDepot, PropositionProfil
from models.document import Document
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.qualification import Qualification
from models.reference import Reference
from tests import depot_fabrique as fab
from tests.depot_fabrique import (BASE, DECENNALE_COMPLETE, KBIS_COMPLET, coffre, deposer_et_lire, deux_orgs,  # noqa: F401
                                  modele)


def _props(db, **filtres):
    db.expire_all()
    return db.query(PropositionProfil).filter_by(**filtres).all()


def _par_champ(db, **filtres):
    return {p.champ: p for p in _props(db, **filtres)}


def _valider(client, ids, **extra):
    return client.post(f"{BASE}/propositions/valider", json={"ids": ids, **extra})


@pytest.fixture
def kbis_lu(client, coffre, modele):
    modele({"kbis": KBIS_COMPLET})
    return deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))[0]


# ── liste ───────────────────────────────────────────────────────────────────

def test_liste_des_propositions_par_rubrique_sans_rien_ecrire(client, db_session, kbis_lu):
    r = client.get(f"{BASE}/propositions?rubrique=identite")
    assert r.status_code == 200
    liste = r.json()["propositions"]
    assert len(liste) == 8 and all(p["rubrique"] == "identite" and p["case"] == "kbis" for p in liste)
    capital = next(p for p in liste if p["champ"] == "organisation.capital_social")
    assert capital["valeur"] == 40000 and capital["affichage"] == "40 000 €" and capital["a_confirmer"] is False
    assert capital["source"] == {"fichier": "kbis.pdf", "page": 1, "lieu": "page 1"} and capital["case_nom"] == "Extrait Kbis"
    assert client.get(f"{BASE}/propositions?rubrique=moyens").json()["propositions"] == []
    assert client.get(f"{BASE}/propositions?rubrique=inconnue").status_code == 422
    # lire n'écrit rien
    db_session.expire_all()
    org = db_session.get(Organization, "org-test-1")
    assert (org.forme_juridique, org.capital_social, org.greffe_rcs) == (None, None, None)
    assert db_session.query(MemoireConfig).count() == 0


# ── validation : seuls les cochés sont écrits, par les chemins existants ────

def test_seuls_les_coches_sont_ecrits_les_autres_de_la_lecture_sont_ecartes(client, db_session, kbis_lu):
    props = _par_champ(db_session)
    coches = [props[c].id for c in ("organisation.forme_juridique", "organisation.capital_social", "profil.gerant_titre")]
    r = _valider(client, coches)
    assert r.status_code == 200 and r.json() == {"validees": 3, "ecartees": 5, "erreurs": [], "rubriques": ["identite"]}
    db_session.expire_all()
    org = db_session.get(Organization, "org-test-1")
    assert org.forme_juridique == "Société par actions simplifiée" and org.capital_social == 40000
    assert org.greffe_rcs is None and org.address is None                      # non cochés : rien d'écrit
    cfg = db_session.query(MemoireConfig).one()
    assert cfg.gerant_titre == "Président" and cfg.gerant_nom is None and cfg.date_creation is None
    statuts = {p.champ: p.statut for p in _props(db_session)}
    assert sorted(c for c, s in statuts.items() if s == "validee") == [
        "organisation.capital_social", "organisation.forme_juridique", "profil.gerant_titre"]
    assert sum(1 for s in statuts.values() if s == "ecartee") == 5
    assert client.get(f"{BASE}/propositions").json()["propositions"] == []     # plus rien à vérifier


def test_la_date_de_l_extrait_est_posee_sur_la_piece_et_son_statut_recalcule(client, db_session, kbis_lu):
    ids = [_par_champ(db_session)["document.issued_date"].id]
    assert _valider(client, ids).json()["validees"] == 1
    db_session.expire_all()
    doc = db_session.get(Document, kbis_lu["document_id"])
    assert doc.issued_date == date(2026, 10, 12)
    assert doc.status != "unverified"        # Kbis : validité de 3 mois dérivée de la date de l'extrait


def test_attestation_cree_la_qualification_justifiee_par_la_piece_et_date_la_piece(client, coffre, db_session, modele):
    modele({"assurance": DECENNALE_COMPLETE})
    res = deposer_et_lire(client, "decennale", ("decennale.pdf", fab.pdf(fab.TEXTE_DECENNALE)))[0]
    ids = [p.id for p in _props(db_session)]
    assert _valider(client, ids).json()["validees"] == 2
    db_session.expire_all()
    q = db_session.query(Qualification).one()
    assert (q.famille, q.intitule, q.organisme, q.numero) == (
        "assurance", "Garantie décennale", "Mutuelle du Bâtiment Champagne", "BAT-2026-00457")
    assert q.date_fin == date(2026, 12, 31) and q.document_id == res["document_id"] and q.organization_id == "org-test-1"
    doc = db_session.get(Document, res["document_id"])
    assert doc.expiry_date == date(2026, 12, 31) and doc.status != "unverified"


def test_une_qualification_deja_connue_est_mise_a_jour_pas_dupliquee(client, coffre, db_session, modele):
    db_session.add(Qualification(organization_id="org-test-1", famille="assurance", intitule="Garantie décennale",
                                 organisme="Ancien assureur", numero="ANCIEN-1"))
    db_session.commit()
    modele({"assurance": DECENNALE_COMPLETE})
    deposer_et_lire(client, "decennale", ("decennale.pdf", fab.pdf(fab.TEXTE_DECENNALE)))
    prop = _par_champ(db_session)["qualification"]
    assert prop.remplace and "Ancien assureur" in prop.remplace            # « À confirmer : remplace … »
    assert client.get(f"{BASE}/propositions").json()["propositions"][0]["a_confirmer"] is True
    _valider(client, [p.id for p in _props(db_session)])
    db_session.expire_all()
    q = db_session.query(Qualification).one()
    assert q.organisme == "Mutuelle du Bâtiment Champagne" and q.numero == "BAT-2026-00457"


def test_materiel_et_vehicules_fusionnent_sans_rien_retirer(client, coffre, db_session, modele):
    db_session.add(MemoireConfig(
        organization_id="org-test-1",
        materiel_liste=[{"quantite": 1, "designation": "Nacelle ciseaux"}, {"quantite": 4, "designation": "Échafaudage de façade"}],
        vehicules_liste=[{"quantite": 1, "designation": "Fourgon"}]))
    db_session.commit()
    modele({"materiel": {
        "materiel": [{"quantite": 2, "designation": "Nacelle ciseaux"}, {"quantite": 1, "designation": "Bétonnière 350 L"}],
        "vehicules": [{"quantite": 3, "designation": "Camion benne"}]}})
    tableur = fab.xlsx({"Matériel": [["Quantité", "Désignation"], [2, "Nacelle ciseaux"], [1, "Bétonnière 350 L"], [3, "Camion benne"]]})
    deposer_et_lire(client, "materiel", ("inventaire.xlsx", tableur))
    nacelle = next(p for p in _props(db_session) if "Nacelle" in p.affichage)
    assert nacelle.remplace == "1 × Nacelle ciseaux"
    assert _valider(client, [p.id for p in _props(db_session)]).json()["validees"] == 3
    db_session.expire_all()
    cfg = db_session.query(MemoireConfig).one()
    assert {(l["quantite"], l["designation"]) for l in cfg.materiel_liste} == {
        (2, "Nacelle ciseaux"), (4, "Échafaudage de façade"), (1, "Bétonnière 350 L")}
    assert {(l["quantite"], l["designation"]) for l in cfg.vehicules_liste} == {(1, "Fourgon"), (3, "Camion benne")}


def test_effectifs_et_habilitations_en_nombres_fusionnent(client, coffre, db_session, modele):
    db_session.add(MemoireConfig(organization_id="org-test-1",
                                 effectifs_par_categorie=[{"categorie": "administratif", "effectif": 1}],
                                 habilitations=[{"type": "caces", "nombre": 2}]))
    db_session.commit()
    modele({"personnel": {
        "effectifs": [{"categorie": "ouvrier", "specialite": "maçon", "effectif": 6}],
        "habilitations": [{"type": "sst", "nombre": 4}, {"type": "autre", "libelle": "Port du harnais", "nombre": 3}]}})
    texte = "Équipe : 6 maçons. 4 titulaires du SST. 3 personnes formées au port du harnais."
    deposer_et_lire(client, "personnel", ("equipe.pdf", fab.pdf(texte)))
    assert _valider(client, [p.id for p in _props(db_session)]).json()["validees"] == 3
    db_session.expire_all()
    cfg = db_session.query(MemoireConfig).one()
    assert {(l["categorie"], l.get("specialite"), l["effectif"]) for l in cfg.effectifs_par_categorie} == {
        ("administratif", None, 1), ("ouvrier", "maçon", 6)}
    assert {(l["type"], l["nombre"]) for l in cfg.habilitations} == {("caces", 2), ("sst", 4), ("autre", 3)}
    toutes = json.dumps(cfg.effectifs_par_categorie + cfg.habilitations, ensure_ascii=False)
    assert "nom" not in {k for l in cfg.effectifs_par_categorie + cfg.habilitations for k in l}, toutes


def test_une_reference_est_creee_par_les_regles_de_post_references(client, coffre, db_session, modele):
    modele({"references": {"references": [
        {"intitule": "Villa des Dunes", "maitre_ouvrage": "Mme Leroy", "annee": 2023},
        {"intitule": "Groupe scolaire Jean Moulin", "maitre_ouvrage": "Ville de Reims", "annee": 2024, "montant_ht": 450000}]}})
    texte = ("Références : Villa des Dunes, pour Mme Leroy, 2023. Groupe scolaire Jean Moulin, Ville de Reims, 2024, "
             "450 000 euros HT.")
    deposer_et_lire(client, "references", ("liste.pdf", fab.pdf(texte)))
    assert _valider(client, [p.id for p in _props(db_session)]).json()["validees"] == 2
    db_session.expire_all()
    refs = {r.intitule: r for r in db_session.query(Reference).all()}
    assert refs["Villa des Dunes"].client_type == "particulier" and refs["Villa des Dunes"].maitre_ouvrage is None
    assert refs["Groupe scolaire Jean Moulin"].maitre_ouvrage == "Ville de Reims"
    assert refs["Groupe scolaire Jean Moulin"].montant_ht == 450000 and refs["Groupe scolaire Jean Moulin"].annee == 2024
    assert {r.organization_id for r in refs.values()} == {"org-test-1"}


# ── validation deux fois, refus, rejet ──────────────────────────────────────

def test_valider_deux_fois_est_sans_effet_la_seconde(client, db_session, kbis_lu):
    ids = [_par_champ(db_session)["organisation.capital_social"].id]
    assert _valider(client, ids).json()["validees"] == 1
    org = db_session.get(Organization, "org-test-1")
    org.capital_social = 1       # le patron a corrigé entre-temps
    db_session.commit()
    r = _valider(client, ids)
    assert r.status_code == 200 and r.json()["validees"] == 0
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1").capital_social == 1


def test_une_proposition_ecartee_ne_ressuscite_pas(client, db_session, kbis_lu):
    ids = [_par_champ(db_session)["organisation.greffe_rcs"].id]
    assert client.post(f"{BASE}/propositions/ecarter", json={"ids": ids}).json() == {"ecartees": 1}
    assert client.post(f"{BASE}/propositions/ecarter", json={"ids": ids}).json() == {"ecartees": 0}   # sans effet
    assert _valider(client, ids).json()["validees"] == 0
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1").greffe_rcs is None


def test_une_valeur_refusee_par_le_champ_est_ecartee_et_signalee_les_autres_passent(client, db_session, kbis_lu):
    props = _par_champ(db_session)
    props["organisation.capital_social"].valeur = "-5"       # refusée par OrganizationUpdate (ge=0)
    db_session.commit()
    ids = [props["organisation.capital_social"].id, props["organisation.forme_juridique"].id]
    r = _valider(client, ids).json()
    assert r["validees"] == 1 and len(r["erreurs"]) == 1 and r["erreurs"][0]["libelle"] == "Capital social"
    db_session.expire_all()
    org = db_session.get(Organization, "org-test-1")
    assert org.capital_social is None and org.forme_juridique == "Société par actions simplifiée"


def test_aucune_case_cochee_les_propositions_de_la_lecture_sont_ecartees(client, db_session, kbis_lu):
    r = _valider(client, [], lecture_ids=[kbis_lu["lecture_id"]])
    assert r.status_code == 200 and r.json()["validees"] == 0 and r.json()["ecartees"] == 8
    assert {p.statut for p in _props(db_session)} == {"ecartee"}
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1").forme_juridique is None


def test_la_piece_supprimee_du_coffre_refuse_la_date(client, db_session, kbis_lu):
    ids = [_par_champ(db_session)["document.issued_date"].id]
    assert client.delete(f"/api/documents/{kbis_lu['document_id']}").status_code == 204
    r = _valider(client, ids).json()
    assert r["validees"] == 0 and r["erreurs"][0]["libelle"] == "Date de l'extrait"


# ── isolation entre entreprises (chaque route) ──────────────────────────────

def test_cross_org_liste_validation_et_rejet(client, db_session, kbis_lu, deux_orgs):
    ids_a = [p.id for p in _props(db_session)]
    lecture_a = kbis_lu["lecture_id"]
    fab.se_connecter_comme("user-b", "org-b")
    # liste : B ne voit rien
    assert client.get(f"{BASE}/propositions").json()["propositions"] == []
    # validation d'une proposition d'une autre entreprise : 404, rien n'est écrit chez A ni chez B
    assert _valider(client, ids_a[:1]).status_code == 404
    assert _valider(client, [], lecture_ids=[lecture_a]).status_code == 404
    assert client.post(f"{BASE}/propositions/ecarter", json={"ids": ids_a[:1]}).status_code == 404
    db_session.expire_all()
    assert {p.statut for p in _props(db_session)} == {"proposee"}
    for org in ("org-test-1", "org-b"):
        o = db_session.get(Organization, org)
        assert (o.forme_juridique, o.capital_social) == (None, None)
    # le même identifiant inconnu et un identifiant d'autrui donnent la MÊME réponse
    inconnu = _valider(client, ["n-existe-pas"])
    autrui = _valider(client, ids_a[:1])
    assert (inconnu.status_code, inconnu.json()) == (autrui.status_code, autrui.json())


def test_cross_org_une_requete_mixte_n_ecrit_rien_du_tout(client, db_session, coffre, modele, kbis_lu, deux_orgs):
    ids_a = [p.id for p in _props(db_session, organization_id="org-test-1")]
    fab.se_connecter_comme("user-b", "org-b")
    modele({"kbis": KBIS_COMPLET})
    deposer_et_lire(client, "kbis", ("kbis-b.pdf", fab.pdf(fab.TEXTE_KBIS + "\nDossier B")))
    ids_b = [p.id for p in _props(db_session, organization_id="org-b")]
    assert len(ids_b) == 8
    assert _valider(client, ids_b + ids_a[:1]).status_code == 404
    db_session.expire_all()
    assert db_session.get(Organization, "org-b").forme_juridique is None            # atomique : rien chez B non plus
    assert {p.statut for p in _props(db_session)} == {"proposee"}
    assert _valider(client, ids_b).json()["validees"] == 8                          # B valide les siennes
    db_session.expire_all()
    assert db_session.get(Organization, "org-b").forme_juridique == "Société par actions simplifiée"
    assert db_session.get(Organization, "org-test-1").forme_juridique is None
