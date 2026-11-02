"""« Points à éclaircir » : questions à l'acheteur. Aucun appel réel (le modèle est simulé), textes INVENTÉS."""
import pytest

from models.audit_log import AuditLog
from models.depot_entreprise import CoutIA
from models.organization import Organization
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption
from services import points_eclaircir as pe

PID = "proj-points"
RC = ("Règlement de la consultation (texte inventé). Article 3 : le délai d'exécution est à préciser selon le phasage retenu avec le "
      "maître d'ouvrage. " + "Les candidats remettent leur offre par voie électronique. " * 5)
CCAP = ("CCAP (texte inventé). Article 7 : les travaux supplémentaires éventuels sont réglés selon les besoins du chantier. "
        "La durée du préavis est de quinze jours. " * 3)
Q1 = {"question": "Pourriez-vous préciser le phasage retenu pour fixer le délai d'exécution ?", "pourquoi": "Le délai dépend d'un phasage non décrit.",
      "source_document": "RC-demo.pdf", "source_page": None, "extrait": "le délai d'exécution est à préciser selon le phasage retenu"}
Q_PRIX = {"question": "Pourriez-vous confirmer le montant estimé de l'opération ?", "pourquoi": "Le budget n'est pas lisible.",
          "source_document": "RC-demo.pdf", "source_page": None, "extrait": "le délai d'exécution est à préciser"}
Q_FAUSSE_SOURCE = {"question": "Pourriez-vous confirmer la couleur des menuiseries retenue ?", "pourquoi": "Non précisée.",
                   "source_document": "RC-demo.pdf", "source_page": None, "extrait": "zzz qqq xxx www jjj kkk"}
USAGE = {"input_tokens": 4200, "output_tokens": 600, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}


# ── Le service, sans base ni réseau ───────────────────────────────────────────

def test_normaliser_borne_dedoublonne_et_ecarte_le_prix():
    bruts = [Q1, dict(Q1), Q_PRIX, "pas un dict", {"question": "court"}, {"question": "x" * 1000 + " ?", "source_page": "4"}]
    bruts += [{"question": f"Pourriez-vous préciser le point numéro {i} du dossier ?"} for i in range(20)]
    sortie = pe.normaliser(bruts)
    assert len(sortie) == pe.MAX_POINTS == 8
    assert sum(p["question"] == Q1["question"] for p in sortie) == 1            # doublon retiré
    assert not any("montant" in p["question"].lower() for p in sortie)            # jamais le prix
    assert all(len(p["question"]) <= pe.MAX_QUESTION for p in sortie)
    assert all(p["source_page"] is None for p in sortie)                          # une page en texte n'est pas gardée
    assert pe.normaliser("n'importe quoi") == [] and pe.normaliser(None) == []


@pytest.mark.parametrize("texte", ["Quel est le prix unitaire ?", "Pourriez-vous préciser le budget ?", "Le tarif de la prestation ?",
                                   "Quel forfait est prévu ?", "Le bordereau est-il modifiable ?", "Une rémunération est-elle due ?"])
def test_aucune_question_sur_le_prix_ne_passe(texte):
    assert pe.normaliser([{"question": texte + " Merci de préciser."}]) == []


def test_fusionner_les_tranches_garde_huit_au_plus():
    a = [{"question": f"Pourriez-vous préciser le premier point {i} ?"} for i in range(6)]
    b = [{"question": f"Pourriez-vous préciser le second point {i} ?"} for i in range(6)]
    assert len(pe.fusionner(a, b)) == 8 and pe.fusionner(None, []) == []


def test_une_analyse_ancienne_sans_le_champ_se_lit_sans_erreur():
    assert pe.lire_points(None) == [] and pe.lire_points({}) == [] and pe.lire_points({"objet": "x"}) == []
    assert pe.lire_points({pe.CLE_INFOS: "abîmé"}) == []


def test_extraits_plafonnes_rc_et_ccap_avant_le_cctp_et_aucun_texte_brut():
    gros = ("Phrase neutre sans importance pour le test. " * 400 + "La quantité est à préciser. ") * 20      # ~ 360 000 caractères
    sans_signal = "Texte administratif banal sans aucune ambiguïté. " * 500
    pieces = [("CCTP-demo.pdf", "cctp", gros), ("RC-demo.pdf", "rc", gros), ("CCAP-demo.pdf", "ccap", sans_signal)]
    extraits = pe.selectionner_extraits(pieces)
    assert [n for n, _ in extraits] == ["RC-demo.pdf", "CCTP-demo.pdf"]           # RC d'abord ; le CCAP sans mot signal n'envoie rien
    assert sum(len(t) for _, t in extraits) <= pe.BUDGET_CARACTERES
    assert all("à préciser" in t for _, t in extraits)
    petit = pe.selectionner_extraits(pieces, budget=2_000)
    assert sum(len(t) for _, t in petit) <= 2_000


# ── La route ─────────────────────────────────────────────────────────────────

@pytest.fixture
def modele(monkeypatch):
    """Haiku simulé : enregistre les messages reçus, renvoie les points demandés."""
    etat = {"appels": [], "sortie": [Q1], "erreur": None}

    def _faux(message):
        etat["appels"].append(message)
        if etat["erreur"]:
            raise etat["erreur"]
        return list(etat["sortie"]), dict(USAGE)
    monkeypatch.setattr(pe, "appeler_haiku", _faux)
    return etat


def _projet(db, org_id, pid=PID, infos=None, docs=True):
    db.add(Project(id=pid, organization_id=org_id, name="AO points", status="analyzed", processing_status="ready",
                   selected_lot="lot1", infos_marche=infos))
    if docs:
        db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="RC-demo.pdf", extracted_text=RC))
        db.add(ProjectDocument(project_id=pid, type="ccap", file_url="y", file_name="CCAP-demo.pdf", extracted_text=CCAP))
        db.add(ProjectDocument(project_id=pid, type="dpgf_template", file_url="z", file_name="DPGF-demo.xlsx",
                               extracted_text="Poste 1 ; quantité à préciser ; prix unitaire 120 € " * 10))
    db.commit()


def _infos(db, pid=PID):
    db.expire_all()
    return db.get(Project, pid).infos_marche


def test_preparer_enregistre_ancre_et_ne_decompte_aucune_unite(client, db_session, test_org, modele, capsys):
    _projet(db_session, test_org.id, infos={"objet": "Réhabilitation (inventé)", "source_avis": "avis-1"})
    r = client.post(f"/api/projects/{PID}/points-a-eclaircir")
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["cout_unites"] == 0 and len(corps["points"]) == 1
    p = corps["points"][0]
    assert p["question"] == Q1["question"] and p["source_document"] == "RC-demo.pdf"
    assert p["extrait"] in RC and "phasage" in p["extrait"]                        # verbatim du dossier
    # enregistré, sans toucher au reste de l'analyse
    infos = _infos(db_session)
    assert infos["points_a_eclaircir"] == corps["points"] and infos["objet"] == "Réhabilitation (inventé)" and infos["source_avis"] == "avis-1"
    # aucune unité décomptée ; le coût est tracé (jetons, pas d'euros à l'écran) et la ligne `jetons` est au journal
    assert db_session.query(QuotaConsumption).count() == 0
    ligne = db_session.query(CoutIA).filter(CoutIA.usage == "points_a_eclaircir").one()
    assert (ligne.modele, ligne.jetons_entree, ligne.jetons_sortie, ligne.reference) == (pe.MODELE, 4200, 600, PID)
    assert "jetons etape=points_a_eclaircir modele=claude-haiku-4-5-20251001 entree=4200" in capsys.readouterr().out


def test_seuls_les_extraits_utiles_partent_au_modele_jamais_la_grille_de_prix(client, db_session, test_org, modele):
    _projet(db_session, test_org.id)
    assert client.post(f"/api/projects/{PID}/points-a-eclaircir").status_code == 200
    message = modele["appels"][0]
    assert "=== PIÈCE : RC-demo.pdf ===" in message and "=== PIÈCE : CCAP-demo.pdf ===" in message
    assert "DPGF-demo" not in message and "prix unitaire" not in message
    assert len(message) <= pe.BUDGET_CARACTERES + 2_000


def test_une_question_sur_le_prix_et_une_source_introuvable_sont_ecartees(client, db_session, test_org, modele):
    _projet(db_session, test_org.id)
    modele["sortie"] = [Q_PRIX, Q_FAUSSE_SOURCE, Q1]
    r = client.post(f"/api/projects/{PID}/points-a-eclaircir")
    assert [p["question"] for p in r.json()["points"]] == [Q1["question"]]


def test_un_dossier_sans_passage_ambigu_n_appelle_pas_le_modele(client, db_session, test_org, modele):
    _projet(db_session, test_org.id, docs=False)
    db_session.add(ProjectDocument(project_id=PID, type="rc", file_url="x", file_name="RC-demo.pdf", extracted_text="Texte administratif banal. " * 30))
    db_session.commit()
    r = client.post(f"/api/projects/{PID}/points-a-eclaircir")
    assert r.status_code == 200 and r.json()["points"] == [] and modele["appels"] == []
    assert _infos(db_session)["points_a_eclaircir"] == []                          # « préparé, rien à poser » : le bouton ne revient pas


def test_sans_aucune_piece_lisible_409(client, db_session, test_org, modele):
    _projet(db_session, test_org.id, docs=False)
    assert client.post(f"/api/projects/{PID}/points-a-eclaircir").status_code == 409 and modele["appels"] == []


def test_panne_du_modele_503_rien_n_est_enregistre_et_on_peut_recommencer(client, db_session, test_org, modele):
    _projet(db_session, test_org.id, infos={"objet": "x"})
    modele["erreur"] = RuntimeError("panne simulée")
    r = client.post(f"/api/projects/{PID}/points-a-eclaircir")
    assert r.status_code == 503 and "indisponible" in r.json()["detail"]
    assert _infos(db_session) == {"objet": "x"}
    modele["erreur"] = None
    assert client.post(f"/api/projects/{PID}/points-a-eclaircir").status_code == 200    # le verrou est bien rendu


def test_un_seul_appel_a_la_fois_par_projet(client, db_session, test_org, modele):
    import routers.points_eclaircir as route
    _projet(db_session, test_org.id)
    route._en_cours.add(PID)
    try:
        r = client.post(f"/api/projects/{PID}/points-a-eclaircir")
    finally:
        route._en_cours.discard(PID)
    assert r.status_code == 409 and "en préparation" in r.json()["detail"] and modele["appels"] == []


def test_plafond_de_dix_par_organisation_sur_24_heures(client, db_session, test_org, test_user, modele):
    import routers.points_eclaircir as route
    _projet(db_session, test_org.id)
    for _ in range(route.MAX_PAR_JOUR):
        db_session.add(AuditLog(organization_id=test_org.id, user_id=test_user.id, action=route.ACTION))
    db_session.commit()
    r = client.post(f"/api/projects/{PID}/points-a-eclaircir")
    assert r.status_code == 429 and "plafond" in r.json()["detail"] and modele["appels"] == []


def test_autre_organisation_404_pour_les_deux_routes(client, db_session, modele):
    db_session.add(Organization(id="org-autre", name="Autre entreprise (inventée)"))
    db_session.commit()
    _projet(db_session, "org-autre", pid="proj-autre")
    assert client.post("/api/projects/proj-autre/points-a-eclaircir").status_code == 404
    assert client.get("/api/projects/proj-autre/date-limite-questions").status_code == 404
    assert modele["appels"] == [] and _infos(db_session, "proj-autre") is None


def test_la_date_limite_des_questions_est_lue_sans_ia_et_calculee(client, db_session, test_org, modele):
    _projet(db_session, test_org.id, infos={"date_limite_reponse": "2027-03-22"}, docs=False)
    db_session.add(ProjectDocument(project_id=PID, type="rc", file_url="x", file_name="RC-demo.pdf",
                                   extracted_text="Les questions parviennent à l'acheteur au plus tard 10 jours avant la date limite de dépôt des plis. " * 2))
    db_session.commit()
    r = client.get(f"/api/projects/{PID}/date-limite-questions")
    assert r.status_code == 200
    corps = r.json()
    assert (corps["statut"], corps["date"], corps["regle"], corps["document"]) == ("trouvee", "2027-03-12", "relative", "RC-demo.pdf")
    assert "R2132-6" in corps["rappel"] and modele["appels"] == []


def test_date_limite_des_questions_absente_a_verifier(client, db_session, test_org, modele):
    _projet(db_session, test_org.id)
    corps = client.get(f"/api/projects/{PID}/date-limite-questions").json()
    assert corps["statut"] == "a_verifier" and corps["date"] is None and corps["motif"]


# ── Retour de l'essai réel (2/11) : extraits partiels, faits déjà lus, page absente, réponse de l'acheteur ─────

@pytest.mark.parametrize("question", [
    "Le contenu de l'article 4 est tronqué : pourriez-vous nous transmettre le texte complet ?",
    "Le passage relatif au phasage semble coupé : pourriez-vous le compléter ?",
    "Pourriez-vous fournir la suite de l'extrait concernant les installations de chantier ?",
    "Le texte du paragraphe est partiel : pourriez-vous préciser la fin de la phrase ?",
    "Le passage est illisible : pourriez-vous le renvoyer sous une autre forme ?",
])
def test_une_question_sur_un_texte_tronque_ou_un_extrait_est_ecartee(question):
    assert pe.normaliser([{"question": question, "pourquoi": "Flou."}]) == []
    assert pe.normaliser([{"question": "Pourriez-vous préciser le phasage des travaux ?", "pourquoi": "Le passage est tronqué."}]) == []


def test_la_consigne_dit_que_les_passages_sont_des_extraits_et_demande_un_francais_correct():
    consigne = pe._SYSTEM.replace("Ne signale", "ne signale")
    assert "EXTRAITS" in consigne and "ne signale jamais une coupure" in consigne
    assert "vouvoiement" in consigne and "français correct" in consigne


def test_une_question_sur_un_fait_deja_lu_est_ecartee_seulement_si_l_analyse_a_la_valeur():
    q_crit = {"question": "Pourriez-vous préciser les critères de jugement des offres et leur pondération ?", "pourquoi": "Non détaillés."}
    q_valid = {"question": "Pourriez-vous confirmer la durée de validité des offres ?", "pourquoi": "Non lue."}
    q_autre = {"question": "Pourriez-vous préciser le phasage retenu pour la salle voisine ?", "pourquoi": "Flou."}
    sans = pe.normaliser([q_crit, q_valid, q_autre])
    assert len(sans) == 3                                                    # rien de connu : toutes gardées
    faits = {"criteres": [{"nom": "Valeur technique", "poids": 60}], "validite_offres_jours": 120}
    assert [p["question"] for p in pe.normaliser([q_crit, q_valid, q_autre], faits=faits)] == [q_autre["question"]]
    assert len(pe.normaliser([q_crit, q_valid, q_autre], faits={"criteres": [{"nom": "Prix", "poids": 100}]})) == 2   # la validité n'est pas connue


def test_les_faits_deja_lus_partent_au_modele_avec_la_consigne_de_ne_pas_les_demander(client, db_session, test_org, modele):
    _projet(db_session, test_org.id)
    p = db_session.get(Project, PID)
    p.criteres_jugement = [{"nom": "Valeur technique", "poids": 60}, {"nom": "Autre critère inventé", "poids": 40}]
    p.infos_marche = {"validite_offres_jours": 120, "variantes_autorisees": False, "duree_marche": "8 mois (inventé)"}
    db_session.commit()
    modele["sortie"] = [{"question": "Pourriez-vous confirmer les critères de jugement retenus ?", "pourquoi": "x", "source_document": "RC-demo.pdf", "extrait": Q1["extrait"]}, Q1]
    r = client.post(f"/api/projects/{PID}/points-a-eclaircir")
    assert r.status_code == 200
    message = modele["appels"][0]
    assert "FAITS DÉJÀ LUS" in message and "Valeur technique 60 %" in message and "120 jours" in message and "8 mois (inventé)" in message
    assert [x["question"] for x in r.json()["points"]] == [Q1["question"]]


def test_une_question_sans_page_garde_sa_piece_comme_source_sans_page_inventee(client, db_session, test_org, modele):
    _projet(db_session, test_org.id)
    points = client.post(f"/api/projects/{PID}/points-a-eclaircir").json()["points"]
    assert points[0]["source_document"] == "RC-demo.pdf" and points[0]["source_page"] is None     # pièce sans PDF : pas de page, jamais « None » à l'écran


def test_la_lecture_filtre_les_points_deja_enregistres_sans_reecrire_la_base(client, db_session, test_org):
    """Les questions enregistrées avant les correctifs (tronqué, fait déjà lu, prix) s'affichent filtrées ; la base n'est pas touchée."""
    enregistres = [
        {"question": "Le contenu de l'article 4 est tronqué : pourriez-vous nous transmettre le texte complet ?", "pourquoi": "Coupé.", "source_document": "RC-demo.pdf", "source_page": 4, "extrait": "extrait"},
        {"question": "Pourriez-vous préciser les critères de jugement des offres ?", "pourquoi": "Non détaillés.", "source_document": "RC-demo.pdf", "source_page": 5, "extrait": "extrait"},
        {"question": "Pourriez-vous confirmer le montant estimé de l'opération ?", "pourquoi": "Budget.", "source_document": "RC-demo.pdf", "source_page": 6, "extrait": "extrait"},
        Q1,
    ]
    _projet(db_session, test_org.id, infos={"objet": "AO inventé", "points_a_eclaircir": enregistres})
    p = db_session.get(Project, PID)
    p.criteres_jugement = [{"nom": "Valeur technique", "poids": 100}]
    db_session.commit()

    corps = client.get(f"/api/projects/{PID}").json()
    assert [x["question"] for x in corps["infos_marche"]["points_a_eclaircir"]] == [Q1["question"]]
    assert corps["infos_marche"]["objet"] == "AO inventé"
    assert len(_infos(db_session)["points_a_eclaircir"]) == 4                     # la base garde tout : filtrage à la lecture seulement
    liste = client.get("/api/projects").json()
    assert len(next(x for x in liste if x["id"] == PID)["infos_marche"]["points_a_eclaircir"]) == 1


def test_la_lecture_d_une_analyse_ancienne_sans_points_ne_change_rien(client, db_session, test_org):
    _projet(db_session, test_org.id, infos={"objet": "AO inventé"})
    assert client.get(f"/api/projects/{PID}").json()["infos_marche"] == {"objet": "AO inventé"}
