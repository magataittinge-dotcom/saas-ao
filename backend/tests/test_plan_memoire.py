"""B1 — le plan du mémoire proposé sans IA (services/plan_memoire.py). Données inventées."""
import pytest

from services import plan_memoire as pm

CRITERES = [
    {"nom": "Valeur technique", "poids": 60, "sous_criteres": [
        {"nom": "Moyens humains et matériels affectés au chantier", "poids": 30},
        {"nom": "Gestion et valorisation des déchets", "poids": 20},
        {"nom": "Méthodologie d'exécution", "poids": 10},
    ]},
    {"nom": "Prix des prestations", "poids": 40, "sous_criteres": [{"nom": "Montant de l'offre", "poids": 40}]},
]


def test_parties_de_base_reprennent_le_modele_du_generateur():
    base = pm.parties_de_base()
    assert len(base) == 25
    assert base[0]["cle"] == "partie_a.implantation" and base[0]["titre"] == "Implantation géographique"
    assert base[-1]["cle"] == "partie_c.delai" and base[-1]["titre"] == "Délai de travaux"
    assert all(not p["titre"][0].isdigit() for p in base)       # la numérotation est calculée, pas stockée


def test_proposition_sans_dossier_donne_les_25_parties_en_a_b_c():
    plan = pm.proposer([], [])
    assert [p["partie"] for p in plan][:11] == ["partie_a"] * 11
    assert len(plan) == 25
    assert all(p["retiree"] is False and p["attendue"] is None for p in plan)
    assert all(p["fiche"] == {"references": None, "personnes": None, "materiel": None, "voulu": ""} for p in plan)


def test_rattachement_sous_criteres_par_les_themes_sans_texte_redige():
    plan = pm.proposer(CRITERES, [])
    r = pm.rattacher_criteres(plan, CRITERES)
    dechets = [s["nom"] for s in r["par_partie"].get("partie_b.dechets", [])]
    assert "Gestion et valorisation des déchets" in dechets
    humain = [s["nom"] for s in r["par_partie"].get("partie_c.effectifs", [])]
    assert "Moyens humains et matériels affectés au chantier" in humain
    assert r["total"] == 3 and r["servis"] == 3 and r["a_couvrir"] == []


def test_le_critere_prix_est_ecarte_avant_tout_calcul():
    r = pm.rattacher_criteres(pm.proposer(CRITERES, []), CRITERES)
    noms = [s["nom"] for liste in r["par_partie"].values() for s in liste] + [s["nom"] for s in r["a_couvrir"]]
    assert not any("Montant" in n or "Prix" in n for n in noms)
    assert r["total"] == 3


def test_retirer_une_partie_remet_ses_sous_criteres_a_couvrir():
    plan = pm.proposer(CRITERES, [])
    for p in plan:
        if p["cle"] in ("partie_b.dechets", "partie_c.mesures_environnementales"):
            p["retiree"] = True
    r = pm.rattacher_criteres(plan, CRITERES)
    assert [s["nom"] for s in r["a_couvrir"]] == ["Gestion et valorisation des déchets"]
    assert r["servis"] == 2


TEXTE_RC = (
    "Article 5. Le mémoire technique comprendra obligatoirement :\n"
    "- la présentation de l'organisation du chantier ;\n"
    "- les moyens humains et matériels affectés ;\n"
    "- le plan d'assurance qualité environnementale du site ;\n"
    "Article 6. Jugement des offres."
)


def test_parties_attendues_par_le_rc_avec_leur_source():
    att = pm.extraire_parties_attendues([{"texte": TEXTE_RC, "source": {"type": "champ", "document": "RC.pdf", "page": None}}])
    assert [a["libelle"] for a in att] == [
        "La présentation de l'organisation du chantier", "Les moyens humains et matériels affectés",
        "Le plan d'assurance qualité environnementale du site"]
    assert all(a["source"]["document"] == "RC.pdf" for a in att)
    assert len({a["id"] for a in att}) == 3


def test_liste_a_lettres_et_phrase_sans_liste():
    t = "Le mémoire technique devra comporter : a) un planning détaillé ; b) la liste du matériel ; c) les références."
    assert [a["libelle"] for a in pm.extraire_parties_attendues([{"texte": t, "source": {}}])] == [
        "Un planning détaillé", "La liste du matériel", "Les références"]
    # pas de liste : rien n'est inventé
    assert pm.extraire_parties_attendues([{"texte": "Le mémoire technique comprendra des éléments.", "source": {}}]) == []
    assert pm.extraire_parties_attendues([{"texte": "Les candidats remettent un mémoire.", "source": {}}]) == []


def test_partie_attendue_rattachee_ou_ajoutee():
    att = pm.extraire_parties_attendues([{"texte": TEXTE_RC, "source": {"type": "champ", "document": "RC.pdf", "page": 7}}])
    plan = pm.proposer(CRITERES, att)
    ajouts = [p for p in plan if ".ajout_" in p["cle"]]
    # « plan d'assurance qualité environnementale » est rattaché à une partie existante ; « organisation du chantier » aussi ;
    # une attendue sans partie proche devient une partie nouvelle, avec sa source
    for a in ajouts:
        assert a["attendue"] in {x["id"] for x in att}
    inconnue = [{"id": "att_x", "libelle": "Zorglub quantique", "source": {"document": "RC.pdf", "page": 3}}]
    plan2 = pm.proposer([], inconnue)
    assert len(plan2) == 26
    nouvelle = plan2[-1]
    assert nouvelle["cle"].split(".")[1].startswith("ajout_") and nouvelle["titre"] == "Zorglub quantique"
    assert nouvelle["attendue"] == "att_x"


def test_validation_cles_connues_ordre_et_bornes():
    plan = pm.proposer([], [])
    ok = pm.valider(plan)
    assert len(ok) == 25
    with pytest.raises(ValueError):
        pm.valider(plan + [{**plan[0], "cle": "partie_a.inconnue"}])
    with pytest.raises(ValueError):
        pm.valider(plan + [dict(plan[0])])                     # clé en double
    with pytest.raises(ValueError):
        pm.valider([{**p, "retiree": True} for p in plan])     # au moins une partie gardée
    with pytest.raises(ValueError):
        pm.valider([{**plan[0], "cle": "partie_a.ajout_x"}])   # ajout_<n> : n entier
    assert pm.valider([{**plan[0], "cle": "partie_a.ajout_3", "titre": "  Une   partie  "}])[0]["titre"] == "Une partie"


def test_validation_regroupe_a_b_c_sans_melanger_les_parties():
    plan = pm.proposer([], [])
    melange = [plan[12], plan[0], plan[20], plan[1]]
    sortie = pm.valider(melange)
    assert [p["partie"] for p in sortie] == ["partie_a", "partie_a", "partie_b", "partie_c"]
    assert [p["cle"] for p in sortie][:2] == ["partie_a.implantation", "partie_a.historique"]


def test_un_seul_mot_en_commun_ne_rattache_pas_une_partie_annoncee():
    """« Suivi connecté du chantier » ne devient pas « Interlocuteur dédié » parce qu'ils partagent « suivi » : il faut un mot
    du titre de la partie ET du thème (ou deux mots du thème). Sinon, une partie nouvelle est proposée."""
    assert pm.attendue_la_plus_proche("Un dispositif de suivi connecté du chantier") is None
    assert pm.attendue_la_plus_proche("La gestion des déchets") == "partie_b.dechets"
    att = [{"id": "att_aaaaaaaaaa", "libelle": "Un dispositif de suivi connecté du chantier", "source": {"document": "RC.pdf", "page": 7}},
           {"id": "att_bbbbbbbbbb", "libelle": "La gestion des déchets", "source": {"document": "RC.pdf", "page": 7}}]
    plan = pm.proposer([], att)
    assert len(plan) == 26 and plan[-1]["attendue"] == "att_aaaaaaaaaa"
    v = pm.vue(plan, [], att, None)
    dechets = next(p for p in v["parties"] if p["cle"] == "partie_b.dechets")
    assert [a["id"] for a in dechets["attendues"]] == ["att_bbbbbbbbbb"] and dechets["source"]["page"] == 7


def test_numeros_d_ajout_uniques_dans_tout_le_plan():
    """Les ancres du mémoire sont « sec-ajout_<n> » : deux parties ajoutées ne portent jamais le même numéro."""
    att = [{"id": "att_aaaaaaaaaa", "libelle": "Zorglub quantique", "source": {}},
           {"id": "att_bbbbbbbbbb", "libelle": "Présentation de l'entreprise zorglub", "source": {}}]
    cles = [p["cle"] for p in pm.proposer([], att) if ".ajout_" in p["cle"]]
    assert len({c.split(".")[1] for c in cles}) == len(cles) == 2
    plan = pm.proposer([], [])
    with pytest.raises(ValueError):
        pm.valider(plan + [pm._partie("partie_a.ajout_1", "A"), pm._partie("partie_c.ajout_1", "C")])


def test_a_couvrir_propose_la_partie_la_plus_proche_par_theme_sinon_c():
    """Chaque sous-critère « À couvrir » dit dans quelle partie ajouter une partie : la plus proche par thème, sinon C."""
    criteres = [{"nom": "Valeur", "poids": 100, "sous_criteres": [
        {"nom": "Gestion et valorisation des déchets", "poids": 50}, {"nom": "Moyens humains", "poids": 30},
        {"nom": "Zorglub quantique", "poids": 20}]}]
    plan = pm.proposer([], [])
    for p in plan:
        p["retiree"] = p["cle"] not in ("partie_a.historique",)
    plan = pm.valider(plan)
    r = pm.rattacher_criteres(plan, criteres)
    par_nom = {c["nom"]: c["partie"] for c in r["a_couvrir"]}
    assert par_nom["Gestion et valorisation des déchets"] == "partie_b"
    assert par_nom["Moyens humains"] in ("partie_a", "partie_c")
    assert par_nom["Zorglub quantique"] == "partie_c"


# Défaut vu sur le dossier réel (mesure du 2/11) : puces « ◼ » (pas dans la liste des puces), éléments sur plusieurs lignes, et
# phrase d'annonce coupée par des retours à la ligne. Texte inventé, même forme.
TEXTE_PUCES_CARRES = (
    "Pièce n° 3 — Mémoire technique\nCe document est remis par le candidat.\nLe mémoire\ncomprend :\n"
    "◼ la présentation de l'entreprise et de son\nencadrement,\n◼ les moyens humains et\nmatériels affectés au chantier,\n"
    "◼ la méthodologie d'exécution des travaux.\nArticle 7. Jugement des offres."
)


def test_parties_annoncees_avec_puces_carrees_et_phrase_sur_plusieurs_lignes():
    att = pm.extraire_parties_attendues([{"texte": TEXTE_PUCES_CARRES, "source": {"document": "RC.pdf", "page": None}}])
    assert [a["libelle"] for a in att] == [
        "La présentation de l'entreprise et de son encadrement", "Les moyens humains et matériels affectés au chantier",
        "La méthodologie d'exécution des travaux"]


@pytest.mark.parametrize("puce", ["◼", "■", "▪", "●", "➢", "", "", "–", "•"])
def test_toutes_les_puces_usuelles_des_pdf(puce):
    t = f"Le mémoire technique comprend :\n{puce} un planning détaillé ;\n{puce} la liste du matériel.\nSuite."
    assert [a["libelle"] for a in pm.extraire_parties_attendues([{"texte": t, "source": {}}])] == ["Un planning détaillé", "La liste du matériel"]


def test_le_dernier_element_ne_avale_pas_le_paragraphe_suivant():
    t = ("Le mémoire technique comprend :\n- le planning détaillé,\n- la liste du matériel affecté au chantier. "
         "Les candidats veillent à respecter les prescriptions ci-dessus, qui sont rappelées dans tout le document remis.")
    assert [a["libelle"] for a in pm.extraire_parties_attendues([{"texte": t, "source": {}}])] == ["Le planning détaillé", "La liste du matériel affecté au chantier"]


def test_un_element_tres_long_est_coupe_a_la_fin_d_un_mot():
    long = "un descriptif détaillé des " + "moyens humains et matériels spécifiques " * 6
    att = pm.extraire_parties_attendues([{"texte": f"Le mémoire technique comprend :\n- {long.strip()},\n- le planning.\nSuite.", "source": {}}])
    titre = att[0]["libelle"]
    assert len(titre) <= pm.MAX_TITRE and titre.endswith("…") and not titre[:-1].endswith(" ")
    assert titre[:-1].split(" ")[-1] in ("humains", "et", "matériels", "spécifiques", "des", "moyens")     # mot entier
