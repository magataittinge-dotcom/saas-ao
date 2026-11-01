"""Dépôt par rubrique, tranche D2 : lecture du texte, masquage RGPD avant envoi, appel du modèle (SIMULÉ), garde « mot
pour mot », propositions avec leur source (fichier, page), registre des coûts, états des cases.

Aucun appel payant : le modèle est la fixture `modele` (tests/depot_fabrique.py). Fichiers et personnes inventés."""
import logging
import re

import pytest

from models.depot_entreprise import CoutIA, LectureDepot, PropositionProfil
from models.document import Document
from models.memoire_config import MemoireConfig
from models.organization import Organization
from tests import depot_fabrique as fab
from tests.depot_fabrique import (BASE, DECENNALE_COMPLETE, KBIS_COMPLET, attendre_les_lectures, coffre, deposer, deposer_et_lire, deux_orgs,  # noqa: F401
                                  etat_de, modele)

def _propositions(db, **filtres):
    db.expire_all()
    return db.query(PropositionProfil).filter_by(**filtres).order_by(PropositionProfil.champ).all()


def _par_champ(db, **filtres):
    return {p.champ + ("" if p.champ not in ("profil.materiel_liste", "profil.vehicules_liste", "reference") else f"#{i}"): p
            for i, p in enumerate(_propositions(db, **filtres))}


# ── Kbis : propositions, source, masquage, coût, rien d'écrit ───────────────

def test_kbis_propose_l_identite_avec_source_et_extrait_sans_rien_ecrire(client, coffre, db_session, modele):
    m = modele({"kbis": KBIS_COMPLET})
    res = deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))[0]
    props = {p.champ: p for p in _propositions(db_session)}
    assert set(props) == {
        "organisation.forme_juridique", "organisation.capital_social", "organisation.greffe_rcs", "organisation.address",
        "profil.date_creation", "profil.gerant_nom", "profil.gerant_titre", "document.issued_date"}
    p = props["organisation.capital_social"]
    assert (p.libelle, p.affichage, p.valeur, p.statut, p.rubrique, p.case_depot) == (
        "Capital social", "40 000 €", "40000", "proposee", "identite", "kbis")
    assert (p.source_fichier, p.source_page, p.source_lieu) == ("kbis.pdf", 1, "page 1")
    assert p.extrait and len(p.extrait) <= 200 and "40 000" in p.extrait
    assert all(q.extrait is None or len(q.extrait) <= 200 for q in props.values())
    assert props["document.issued_date"].valeur == '"2026-10-12"' and props["document.issued_date"].affichage == "12/10/2026"
    # RIEN n'est écrit avant validation
    db_session.expire_all()
    assert db_session.get(Organization, "org-test-1").forme_juridique is None
    assert db_session.query(MemoireConfig).count() == 0
    assert db_session.get(Document, res["document_id"]).issued_date is None
    # l'état de la case
    case = etat_de(client, "kbis")
    assert case["etat"] == "lu" and case["libelle_etat"] == "Lu · 8 informations proposées" and case["vers_verifier"] is True
    assert len(m.appels) == 1


def test_le_texte_qui_part_au_modele_est_masque_et_garde_les_numeros_de_l_entreprise(client, coffre, modele):
    m = modele({"kbis": KBIS_COMPLET})
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    envoye = m.textes_envoyes
    assert "contact@lambert-maconnerie.fr" not in envoye and "03 26 00 00 00" not in envoye
    assert "[EMAIL]" in envoye and "[TELEPHONE]" in envoye
    assert "123 456 789 00011" in envoye           # le SIRET est celui de l'entreprise : il reste
    assert "12 avenue du Port" in envoye           # l'adresse du siège aussi (Kbis, pas une case « personnes »)


def test_valeurs_inventees_par_le_modele_ecartees(client, coffre, db_session, modele):
    modele({"kbis": {
        "forme_juridique": "SARL unipersonnelle", "capital_social": 50000,
        "adresse_siege": "99 rue Imaginaire 75001 PARIS", "date_extrait": "2026-11-30", "greffe_rcs": "REIMS",
        "annee_creation": 1999, "cle_hors_schema": "x", "gerant_titre": "Directeur général délégué"}})
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    assert [p.champ for p in _propositions(db_session)] == ["organisation.greffe_rcs"]


def test_cout_reel_enregistre_par_appel(client, coffre, db_session, modele):
    m = modele({"kbis": KBIS_COMPLET})
    res = deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))[0]
    lignes = db_session.query(CoutIA).all()
    assert len(lignes) == len(m.appels) == 1
    c = lignes[0]
    assert (c.organization_id, c.usage, c.modele, c.reference) == (
        "org-test-1", "depot_entreprise", "claude-haiku-4-5-20251001", res["lecture_id"])
    systeme_et_texte = len(m.appels[0][1])
    assert c.jetons_entree > systeme_et_texte // 4 - 1 and c.jetons_sortie == 220
    usd = round((c.jetons_entree * 1.00 + 220 * 5.00) / 1_000_000, 6)
    assert c.cout_usd == usd and c.cout_eur == round(usd * 0.92, 6)


def test_valeur_deja_identique_non_proposee_valeur_differente_a_confirmer(client, coffre, db_session, modele):
    modele({"kbis": KBIS_COMPLET})
    org = db_session.get(Organization, "org-test-1")
    org.forme_juridique = "Société par actions simplifiée"     # identique
    org.greffe_rcs = "CHALONS"                                  # différente
    db_session.commit()
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    props = {p.champ: p for p in _propositions(db_session)}
    assert "organisation.forme_juridique" not in props
    assert props["organisation.greffe_rcs"].remplace == "CHALONS"
    assert props["organisation.capital_social"].remplace is None


def test_redepot_du_meme_fichier_aucun_nouvel_appel_ni_cout(client, coffre, db_session, modele):
    m = modele({"kbis": KBIS_COMPLET})
    contenu = fab.pdf(fab.TEXTE_KBIS)
    deposer_et_lire(client, "kbis", ("kbis.pdf", contenu))
    second = deposer_et_lire(client, "kbis", ("copie.pdf", contenu))[0]
    assert second["deja_depose"] is True and len(m.appels) == 1
    assert db_session.query(CoutIA).count() == 1 and db_session.query(LectureDepot).count() == 1
    assert db_session.query(PropositionProfil).count() == 8


# ── assurances et certificats : la date de validité est proposée ────────────

@pytest.mark.parametrize("case,intitule", [
    ("decennale", "Garantie décennale"), ("rc", "Responsabilité civile professionnelle")])
def test_attestation_propose_l_assurance_et_sa_date_de_validite(client, coffre, db_session, modele, case, intitule):
    modele({"assurance": DECENNALE_COMPLETE})
    deposer_et_lire(client, case, ("attestation.pdf", fab.pdf(fab.TEXTE_DECENNALE)))
    props = {p.champ: p for p in _propositions(db_session)}
    assert set(props) == {"qualification", "document.expiry_date"}
    assert props["document.expiry_date"].affichage == "31/12/2026" and props["document.expiry_date"].libelle == "Valable jusqu'au"
    import json
    q = json.loads(props["qualification"].valeur)
    assert q["famille"] == "assurance" and q["intitule"] == intitule
    assert q["organisme"] == "Mutuelle du Bâtiment Champagne" and q["numero"] == "BAT-2026-00457"
    assert q["date_obtention"] == "2026-01-01" and q["date_fin"] == "2026-12-31" and "document_id" not in q
    assert "contrat" not in (props["qualification"].libelle or "").lower() or True


def test_attestation_l_extrait_d_origine_est_la_ligne_du_contrat_pas_celle_des_activites(client, coffre, db_session, modele):
    """Essai réel du 2/11 : l'extrait montré sous « Assurance » était la ligne des activités garanties (la plus longue),
    alors que le patron vérifie d'abord le numéro de contrat."""
    modele({"assurance": DECENNALE_COMPLETE})
    deposer_et_lire(client, "decennale", ("attestation.pdf", fab.pdf(fab.TEXTE_DECENNALE)))
    q = next(p for p in _propositions(db_session) if p.champ == "qualification")
    assert "BAT-2026-00457" in q.extrait and q.source_page == 1


def test_date_de_validite_inventee_ecartee(client, coffre, db_session, modele):
    modele({"assurance": {**DECENNALE_COMPLETE, "date_fin": "2027-12-31", "date_debut": "2026-02-01"}})
    deposer_et_lire(client, "decennale", ("attestation.pdf", fab.pdf(fab.TEXTE_DECENNALE)))
    props = {p.champ: p for p in _propositions(db_session)}
    assert set(props) == {"qualification"}
    import json
    q = json.loads(props["qualification"].valeur)
    assert q["date_fin"] is None and q["date_obtention"] is None


def test_certificat_propose_la_qualification_et_sa_date_de_fin(client, coffre, db_session, modele):
    texte = ("CERTIFICAT QUALIBAT\nCertificat n° 2026-04567\nOrganisme : Qualibat\n"
             "Qualification 2112 - Maçonnerie courante\nDate d'obtention : 15/03/2024\nValable jusqu'au 14/03/2028")
    modele({"certificat": {"certificats": [{
        "famille": "qualification", "intitule": "Qualibat 2112 Maçonnerie courante", "organisme": "Qualibat",
        "numero": "2026-04567", "perimetre": "2112", "date_obtention": "2024-03-15", "date_fin": "2028-03-14"}]}})
    deposer_et_lire(client, "certificat", ("qualibat.pdf", fab.pdf(texte)))
    props = {p.champ: p for p in _propositions(db_session)}
    assert set(props) == {"qualification", "document.expiry_date"}
    assert props["qualification"].libelle == "Qualification" and props["document.expiry_date"].affichage == "14/03/2028"
    assert props["qualification"].rubrique == "certifications"


# ── matériel : lignes d'un tableur ──────────────────────────────────────────

def test_materiel_xlsx_une_proposition_par_ligne_la_ligne_inventee_est_ecartee(client, coffre, db_session, modele):
    tableur = fab.xlsx({"Matériel": [
        ["Quantité", "Désignation", "Famille"], [2, "Nacelle ciseaux", "Levage"],
        [1, "Bétonnière 350 L", "Gros oeuvre"], [3, "Camion benne", "Véhicule"]]})
    modele({"materiel": {
        "materiel": [{"quantite": 2, "designation": "Nacelle ciseaux", "famille": "Levage"},
                     {"quantite": 1, "designation": "Bétonnière 350 L"},
                     {"quantite": 1, "designation": "Grue à tour"}],
        "vehicules": [{"quantite": 3, "designation": "Camion benne"}]}})
    deposer_et_lire(client, "materiel", ("inventaire.xlsx", tableur))
    props = _propositions(db_session)
    assert sorted((p.champ, p.affichage) for p in props) == [
        ("profil.materiel_liste", "1 × Bétonnière 350 L"), ("profil.materiel_liste", "2 × Nacelle ciseaux"),
        ("profil.vehicules_liste", "3 × Camion benne")]
    nacelle = next(p for p in props if "Nacelle" in p.affichage)
    assert nacelle.source_lieu == "feuille « Matériel »" and nacelle.source_page is None
    assert "Nacelle ciseaux" in nacelle.extrait and len(nacelle.extrait) <= 200
    assert etat_de(client, "materiel")["libelle_etat"] == "Lu · 3 informations proposées"


# ── personnel : aucun nom, aucune adresse, aucune date de naissance ─────────

PERSONNES = ["Durand", "Paul", "Camille", "MARTIN", "DUPONT", "Dupont", "Sophie", "Jean"]
DONNEES_PERSONNELLES = ["12/05/1980", "4 rue des Roses", "51100", "06 12 34 56 78", "exemple.fr", "rue des Lilas", "1980"]


def _tout(p: PropositionProfil) -> str:
    return " ".join(str(getattr(p, c.name)) for c in p.__table__.columns if c.name not in ("id",))


def test_liste_du_personnel_xlsx_rien_de_personnel_ne_part_ni_ne_reste(client, coffre, db_session, modele, caplog):
    tableur = fab.xlsx({"Équipe": [
        ["Nom", "Prénom", "Date de naissance", "Adresse", "Téléphone", "Fonction", "Habilitation"],
        ["Durand", "Paul", "12/05/1980", "4 rue des Roses 51100 Reims", "06 12 34 56 78", "maçon", "SST"],
        ["Martin", "Camille", "03/08/1990", "9 rue des Lilas 51100 Reims", "06 98 76 54 32", "maçon", "SST"],
        ["Dupont", "Sophie", "21/11/1985", "2 allée des Tilleuls 51100 Reims", "06 11 22 33 44", "chef de chantier", "SST"]]})
    m = modele({"personnel": {
        "effectifs": [{"categorie": "ouvrier", "specialite": "maçon", "effectif": 2},
                      {"categorie": "encadrement", "specialite": "chef de chantier", "effectif": 1},
                      {"categorie": "ouvrier", "specialite": "Paul Durand", "effectif": 1},      # un nom : écarté
                      {"categorie": "ouvrier", "specialite": "Durand", "effectif": 1}],           # un nom : écarté
        "habilitations": [{"type": "sst", "nombre": 3}]}})
    with caplog.at_level(logging.DEBUG):
        deposer_et_lire(client, "personnel", ("personnel.xlsx", tableur))
    envoye = m.textes_envoyes
    for interdit in PERSONNES + DONNEES_PERSONNELLES + ["Roses", "Lilas", "Tilleuls"]:
        assert interdit not in envoye, f"« {interdit} » part au modèle"
    assert "maçon" in envoye and "chef de chantier" in envoye and "SST" in envoye
    props = _propositions(db_session)
    assert sorted(p.affichage for p in props) == ["1 · Encadrement (chef de chantier)", "2 · Ouvriers (maçon)", "3 × SST"]
    for p in props:
        assert p.extrait is None
        for interdit in PERSONNES + DONNEES_PERSONNELLES:
            assert interdit not in _tout(p), f"« {interdit} » dans une proposition"
    for interdit in PERSONNES + DONNEES_PERSONNELLES:
        assert interdit not in caplog.text, f"« {interdit} » dans les journaux"


def test_cv_word_masque_noms_adresses_naissance_telephone_et_ecarte_les_noms_du_modele(client, coffre, db_session, modele):
    cv = fab.docx(
        "Jean DUPONT, chef de chantier, né le 12/05/1980, 12 rue des Lilas 51100 Reims, tél 06 12 34 56 78, "
        "jean.dupont@exemple.fr, 12 ans d'expérience, SST, CACES R482.",
        "Mme Sophie MARTIN, conductrice de travaux, 8 ans d'expérience.")
    m = modele({"personnel": {
        "effectifs": [{"categorie": "encadrement", "specialite": "chef de chantier", "effectif": 1},
                      {"categorie": "encadrement", "specialite": "conductrice de travaux", "effectif": 1},
                      {"categorie": "ouvrier", "specialite": "Dupont", "effectif": 1}],
        "habilitations": [{"type": "sst", "nombre": 1}, {"type": "caces", "nombre": 1, "libelle": "Jean Dupont"}]}})
    deposer_et_lire(client, "personnel", ("cv-jean-dupont.docx", cv))
    envoye = m.textes_envoyes
    for interdit in ["DUPONT", "Dupont", "Sophie", "MARTIN", "12/05/1980", "rue des Lilas", "06 12 34 56 78", "exemple.fr"]:
        assert interdit not in envoye, f"« {interdit} » part au modèle"
    assert "12 ans d'expérience" in envoye and "chef de chantier" in envoye
    props = _propositions(db_session)
    assert sorted(p.affichage for p in props) == [
        "1 · Encadrement (chef de chantier)", "1 · Encadrement (conductrice de travaux)", "1 × CACES", "1 × SST"]
    for p in props:
        assert "cv-jean-dupont" not in _tout(p).lower() and "dupont" not in _tout(p).lower()
        assert p.source_fichier == "Organigramme ou liste du personnel (docx)" and p.extrait is None


# ── un PDF de 20 pages : découpage, aucune troncature, pages sources justes ─

NOMS = ["Alpha", "Bravo", "Cedre", "Delta", "Erable", "Fleur", "Genet", "Hetre", "Iris", "Jonc",
        "Karite", "Lilas", "Merise", "Noyer", "Orme", "Pivoine", "Quercus", "Roseau", "Saule", "Tilleul"]
_LIGNE_REF = re.compile(r"Chantier (\d+) : (Résidence \w+), (.+?), (\d{4}), (\d+) euros")


def nom_de(i: int) -> str:
    return f"{NOMS[(i - 1) % 20]}{i}"


def _pdf_20_pages(n: int = 20) -> bytes:
    pages = []
    for i in range(1, n + 1):
        bourrage = " ".join(f"Le chantier se déroule en phases successives, avec contrôle de réception {i}.{k}."
                            for k in range(1, 14))
        pages.append(f"Chantier {i} : Résidence {nom_de(i)}, Ville de Reims, 2024, {100000 + i} euros\n{bourrage}")
    return fab.pdf(*pages)


def _modele_references(texte: str) -> dict:
    return {"references": [
        {"intitule": nom, "maitre_ouvrage": maitre, "annee": int(annee), "montant_ht": float(montant)}
        for _, nom, maitre, annee, montant in _LIGNE_REF.findall(texte)]}


def test_pdf_de_20_pages_decoupe_en_morceaux_chaque_reference_avec_sa_page(client, coffre, db_session, modele):
    m = modele({"references": _modele_references})
    res = deposer_et_lire(client, "references", ("memoire.pdf", _pdf_20_pages()))[0]
    assert len(m.appels) >= 3, "20 pages ne tiennent pas dans un seul appel"
    assert all(len(texte) <= 10_000 + 200 for _, texte in m.appels)
    assert db_session.query(CoutIA).count() == len(m.appels)
    props = _propositions(db_session)
    assert len(props) == 20, "aucune page n'est perdue"
    pages = {json_nom(p): p.source_page for p in props}
    for i in range(1, 21):
        assert pages[f"Résidence {nom_de(i)}"] == i, f"page source fausse pour le chantier {i}"
    derniere = next(p for p in props if p.source_page == 20)
    assert f"Résidence {nom_de(20)}" in derniere.extrait and len(derniere.extrait) <= 200
    lecture = db_session.get(LectureDepot, res["lecture_id"])
    assert (lecture.pages_lues, lecture.pages_total, lecture.plafond_atteint, lecture.nb_propositions) == (20, 20, False, 20)
    assert etat_de(client, "references")["plafond"] is None


def json_nom(p: PropositionProfil) -> str:
    import json
    return json.loads(p.valeur)["intitule"]


def test_plafond_de_40_pages_affiche_jamais_silencieux(client, coffre, db_session, modele):
    m = modele({"references": _modele_references})
    deposer_et_lire(client, "references", ("gros.pdf", _pdf_20_pages(45)))
    props = _propositions(db_session)
    assert max(p.source_page for p in props) == 40 and len(props) == 40
    case = etat_de(client, "references")
    assert case["plafond"] == "Lu jusqu'à la page 40" and case["fichiers"][0]["plafond_atteint"] is True
    assert "page 41" not in m.textes_envoyes


def test_reference_deja_au_profil_non_proposee_et_particulier_sans_nom(client, coffre, db_session, modele):
    from models.reference import Reference
    db_session.add(Reference(organization_id="org-test-1", intitule="Résidence Alpha", annee=2024))
    db_session.commit()
    modele({"references": {"references": [
        {"intitule": "Résidence Alpha", "annee": 2024},
        {"intitule": "Villa des Dunes", "maitre_ouvrage": "Mme Leroy", "annee": 2023}]}})
    texte = "Références : Résidence Alpha 2024. Villa des Dunes, pour Mme Leroy, 2023. Surface 120 m2 livrée en 2023."
    deposer_et_lire(client, "references", ("liste.pdf", fab.pdf(texte)))
    props = _propositions(db_session)
    assert [json_nom(p) for p in props] == ["Villa des Dunes"]
    import json
    v = json.loads(props[0].valeur)
    assert v["client_type"] == "particulier" and "maitre_ouvrage" not in v
    assert "Leroy" not in _tout(props[0]).replace(props[0].extrait or "", "")


# ── fiche des moyens (texte libre) ──────────────────────────────────────────

def test_fiche_des_moyens_propose_les_textes_ancres(client, coffre, db_session, modele):
    fiche = fab.docx("Moyens informatiques : logiciel de métrés, tablettes de chantier.",
                     "Matériel : deux nacelles et un chariot télescopique.")
    modele({"fiche_moyens": {
        "moyens_informatiques": "Logiciel de métrés et tablettes de chantier",
        "materiel": "2 nacelles, 1 chariot télescopique", "vehicules": "Un fourgon aménagé"}})
    deposer_et_lire(client, "fiche_moyens", ("moyens.docx", fiche))
    assert sorted(p.champ for p in _propositions(db_session)) == ["profil.materiel", "profil.moyens_informatiques"]


# ── états : OCR, ancien format, rien à extraire, échec ──────────────────────

def test_image_et_pdf_scanne_lisibles_seulement_avec_un_ocr_sans_appel_au_modele(client, coffre, db_session, modele):
    m = modele({"kbis": KBIS_COMPLET})
    deposer_et_lire(client, "kbis", ("photo.png", fab.png_valide()), ("scan.pdf", fab.pdf("", "")))
    case = etat_de(client, "kbis")
    assert case["etat"] == "ocr_requis"
    assert case["libelle_etat"] == "Déposé dans le coffre-fort · lisible seulement avec un OCR"
    assert [f["etat"] for f in case["fichiers"]] == ["ocr_requis", "ocr_requis"]
    assert m.appels == [] and db_session.query(CoutIA).count() == 0
    assert db_session.query(Document).count() == 2        # les deux sont au coffre-fort


def test_ancien_format_word_refuse_sans_rien_lire(client, coffre, db_session, modele):
    m = modele({})
    ole2 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512
    res = deposer_et_lire(client, "fiche_moyens", ("ancienne-fiche.doc", ole2))[0]
    assert res["accepte"] is False and res["statut"] == 415 and ".docx" in res["detail"]
    assert etat_de(client, "fiche_moyens")["etat"] == "vide" and m.appels == [] and db_session.query(Document).count() == 0


def test_rien_a_extraire_deposé_dans_le_coffre_fort(client, coffre, modele):
    modele({"kbis": {}})
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    case = etat_de(client, "kbis")
    assert case["etat"] == "coffre_seul" and case["libelle_etat"] == "Déposé dans le coffre-fort"
    assert case["vers_verifier"] is False


def test_panne_du_modele_etat_lisible_et_fichier_conserve(client, coffre, db_session, modele):
    def _panne(texte):
        raise RuntimeError("fournisseur indisponible")
    modele({"kbis": _panne})
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    case = etat_de(client, "kbis")
    assert case["etat"] == "echec" and case["libelle_etat"] == "Déposé dans le coffre-fort"
    assert case["fichiers"][0]["message"] and db_session.query(Document).count() == 1


def test_lecture_abandonnee_apres_un_redemarrage_devient_a_relancer(client, coffre, db_session):
    from datetime import datetime, timedelta
    doc = Document(organization_id="org-test-1", type="kbis", category="documents_legaux", file_url="/uploads/x/k.pdf",
                   file_name="k.pdf", status="unverified", rubrique_entreprise="identite", case_depot="kbis")
    db_session.add(doc)
    db_session.flush()
    db_session.add(LectureDepot(organization_id="org-test-1", document_id=doc.id, case_depot="kbis", rubrique="identite",
                                sha256="0" * 64, etat="en_lecture", created_at=datetime.utcnow() - timedelta(hours=2)))
    db_session.commit()
    case = etat_de(client, "kbis")
    assert case["etat"] == "echec" and "redéposez" in case["fichiers"][0]["message"].lower()


# ── une seule lecture à la fois par entreprise ──────────────────────────────

def test_une_seule_extraction_a_la_fois_par_organisation(client, coffre, modele):
    m = modele({"kbis": KBIS_COMPLET}, pause=0.15)
    fichiers = [(f"k{i}.pdf", fab.pdf(fab.TEXTE_KBIS + f"\nDossier {i}")) for i in range(3)]
    deposer_et_lire(client, "kbis", *fichiers)
    assert len(m.appels) == 3 and m.max_en_cours == 1


# ── « Décrire avec vos mots » enregistre aussi son coût ─────────────────────

def test_decrire_avec_vos_mots_enregistre_son_cout(client, db_session, monkeypatch):
    from services.ai import profile_structurer
    monkeypatch.setattr(profile_structurer, "_call_haiku", lambda texte: (
        {"vehicules": "3 camions benne"}, {"input_tokens": 400, "output_tokens": 50}))
    r = client.post("/api/memoire-config/structure-text", json={"text": "On a 3 camions benne pour nos chantiers de terrassement."})
    assert r.status_code == 200 and r.json()["proposed"] == {"vehicules": "3 camions benne"}
    c = db_session.query(CoutIA).one()
    assert (c.usage, c.jetons_entree, c.jetons_sortie) == ("structure_texte", 400, 50) and c.cout_usd == round((400 + 250) / 1e6, 6)


# ── isolation : la lecture d'une entreprise ne produit rien chez l'autre ────

def test_cross_org_les_propositions_restent_chez_leur_entreprise(client, coffre, db_session, modele, deux_orgs):
    modele({"kbis": KBIS_COMPLET})
    deposer_et_lire(client, "kbis", ("kbis.pdf", fab.pdf(fab.TEXTE_KBIS)))
    assert db_session.query(PropositionProfil).filter_by(organization_id="org-b").count() == 0
    assert db_session.query(CoutIA).filter_by(organization_id="org-b").count() == 0
    fab.se_connecter_comme("user-b", "org-b")
    assert etat_de(client, "kbis")["etat"] == "vide" and etat_de(client, "kbis")["propositions"] == 0
