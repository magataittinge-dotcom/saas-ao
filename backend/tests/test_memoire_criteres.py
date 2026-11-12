"""E1 — rattachement des sous-critères du RC aux parties du mémoire (déterministe, 0 appel IA).

Les critères et les textes ci-dessous sont inventés : aucun texte de DCE."""
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project
from services.memoire_criteres import rattacher

TEXTE_VIDE = {"preambule": "", "partie_a": {}, "partie_b": {}, "partie_c": {}}


def _memoire(**sections):
    """Un mémoire inventé : sections = {"partie_a.effectifs": "texte", ...}."""
    contenu = {"preambule": "Présentation.", "partie_a": {}, "partie_b": {}, "partie_c": {}}
    for cle, texte in sections.items():
        part, sous = cle.split(".")
        contenu[part][sous] = texte
    return contenu


def _criteres(*sous, poids=60, nom="Qualité de l'offre technique"):
    return [
        {"nom": "Prix des travaux", "poids": 40, "sous_criteres": []},
        {"nom": nom, "poids": poids, "sous_criteres": [{"nom": n, "poids": p} for n, p in sous]},
    ]


def _par_nom(resultat):
    return {s["nom"]: s for s in resultat["sous_criteres"]}


def test_un_sous_critere_est_rattache_aux_parties_qui_en_parlent():
    contenu = _memoire(**{
        "partie_a.roles_missions": "Le chef de chantier encadre l'équipe humaine affectée au marché.",
        "partie_c.effectifs": "Cinq compagnons et deux ouvriers qualifiés composent l'effectif du chantier.",
        "partie_b.dechets": "Les déchets sont triés en benne.",
    })
    res = rattacher(contenu, _criteres(("Moyens humains mobilisés", 15)))
    s = _par_nom(res)["Moyens humains mobilisés"]
    assert s["poids"] == 15
    assert s["critere"] == "Qualité de l'offre technique"
    assert "partie_a.roles_missions" in s["sections"]
    assert "partie_c.effectifs" in s["sections"]
    assert "partie_b.dechets" not in s["sections"]


def test_un_sous_critere_peut_couvrir_plusieurs_parties():
    contenu = _memoire(**{
        "partie_b.securite": "La prévention des risques et l'hygiène sont suivies chaque jour.",
        "partie_c.hygiene_securite": "Hygiène et sécurité : port des EPI, prévention des accidents.",
        "partie_c.mesures_environnementales": "Mesures environnementales : les nuisances de bruit et de poussière sont limitées.",
    })
    res = rattacher(contenu, _criteres(("Hygiène, sécurité et environnement", 10)))
    s = _par_nom(res)["Hygiène, sécurité et environnement"]
    assert set(s["sections"]) >= {"partie_b.securite", "partie_c.hygiene_securite",
                                  "partie_c.mesures_environnementales"}
    assert s["traite"] is True


def test_accents_casse_et_pluriels_sont_ignores():
    contenu = _memoire(**{"partie_b.dechets": "LES DÉCHET DE CHANTIER SONT TRIÉS ET ÉVACUÉS."})
    res = rattacher(contenu, _criteres(("Gestion des déchets", 5)))
    assert _par_nom(res)["Gestion des déchets"]["sections"] == ["partie_b.dechets"]


def test_un_sous_critere_sans_partie_est_a_couvrir():
    contenu = _memoire(**{"partie_b.dechets": "Les déchets sont triés en benne."})
    res = rattacher(contenu, _criteres(("Moyens humains mobilisés", 15), ("Gestion des déchets", 5)))
    assert [a["nom"] for a in res["a_couvrir"]] == ["Moyens humains mobilisés"]
    a = res["a_couvrir"][0]
    assert a["poids"] == 15 and a["critere"] == "Qualité de l'offre technique"
    assert _par_nom(res)["Moyens humains mobilisés"]["traite"] is False
    assert _par_nom(res)["Gestion des déchets"]["traite"] is True


def test_le_prix_n_entre_jamais_dans_le_rattachement():
    contenu = _memoire(**{"partie_a.activites": "Notre prix est le meilleur, nos coûts sont maîtrisés."})
    criteres = [
        {"nom": "Prix des prestations", "poids": 40, "sous_criteres": [
            {"nom": "Prix global et forfaitaire", "poids": 40}]},
        {"nom": "Valeur technique", "poids": 60, "sous_criteres": [
            {"nom": "Coût de la maintenance", "poids": 10},
            {"nom": "Tarifs des options", "poids": 5},
            {"nom": "Gestion des déchets", "poids": 5}]},
    ]
    res = rattacher(contenu, criteres)
    noms = {s["nom"] for s in res["sous_criteres"]}
    assert noms == {"Gestion des déchets"}
    assert [a["nom"] for a in res["a_couvrir"]] == ["Gestion des déchets"]


def test_un_placeholder_ne_couvre_rien():
    contenu = _memoire(**{"partie_b.dechets": "[SECTION À RÉGÉNÉRER : partie_b.dechets] déchets"})
    res = rattacher(contenu, _criteres(("Gestion des déchets", 5)))
    assert _par_nom(res)["Gestion des déchets"]["traite"] is False


def test_un_critere_general_sans_detail_n_est_pas_a_couvrir():
    # « Valeur technique » seul : il se lit sur l'ensemble du mémoire, pas dans une partie.
    criteres = [{"nom": "Prix", "poids": 40, "sous_criteres": []},
                {"nom": "Valeur technique", "poids": 60, "sous_criteres": []}]
    res = rattacher(_memoire(**{"partie_a.activites": "Nos activités."}), criteres)
    assert res["sous_criteres"] == [] and res["a_couvrir"] == []


def test_un_critere_precis_sans_sous_critere_est_une_unite():
    criteres = [{"nom": "Prix", "poids": 40, "sous_criteres": []},
                {"nom": "Délai d'exécution", "poids": 20, "sous_criteres": []},
                {"nom": "Valeur technique", "poids": 40, "sous_criteres": []}]
    contenu = _memoire(**{"partie_c.delai": "Le délai de travaux est de quatre mois, calendrier joint."})
    res = rattacher(contenu, criteres)
    s = _par_nom(res)["Délai d'exécution"]
    assert s["poids"] == 20 and s["critere"] == "Délai d'exécution"
    assert "partie_c.delai" in s["sections"]


def test_entrees_absentes_ou_abimees():
    assert rattacher(TEXTE_VIDE, None) == {"sous_criteres": [], "a_couvrir": []}
    assert rattacher(TEXTE_VIDE, []) == {"sous_criteres": [], "a_couvrir": []}
    abime = [None, "x", {"nom": None}, {"nom": "Technique", "poids": "?", "sous_criteres": "non"},
             {"nom": "Technique", "poids": 50, "sous_criteres": [None, {"nom": "Déchets", "poids": None}]}]
    res = rattacher({"partie_a": None}, abime)
    assert isinstance(res["sous_criteres"], list)


def test_un_mot_courant_ne_rattache_pas_a_tout():
    # « ouvrages » est dans tous les textes de BTP : seul, il ne désigne aucune partie.
    contenu = _memoire(**{"partie_a.historique": "Nous réalisons des ouvrages depuis 1990."})
    res = rattacher(contenu, _criteres(("Gestion des ouvrages", 10)))
    assert _par_nom(res)["Gestion des ouvrages"]["sections"] == []


# ── Route GET /memoire/criteres ───────────────────────────────────────────────

PID = "proj-crit-e1"


def _projet(db, org_id, pid=PID, avec_memoire=True):
    db.add(Project(id=pid, organization_id=org_id, name="AO critères", current_step=5,
                   criteres_jugement=_criteres(("Gestion des déchets", 5), ("Moyens humains mobilisés", 15))))
    if avec_memoire:
        db.add(MemoireTechnique(project_id=pid, version=1, content_json=_memoire(
            **{"partie_b.dechets": "Les déchets sont triés en benne."})))
    db.commit()


def test_route_rend_le_rattachement(client, db_session, test_org):
    _projet(db_session, test_org.id)
    r = client.get(f"/api/projects/{PID}/memoire/criteres")
    assert r.status_code == 200, r.text
    corps = r.json()
    assert [a["nom"] for a in corps["a_couvrir"]] == ["Moyens humains mobilisés"]
    assert _par_nom(corps)["Gestion des déchets"]["sections"] == ["partie_b.dechets"]


def test_route_sans_memoire_200_et_rien_a_rattacher(client, db_session, test_org):
    """RESTES-3 (PERF § 5) — pas encore de mémoire : un état normal, pas une erreur. 200 et des listes vides (rien n'est
    « À couvrir » tant que rien n'est rédigé) : Rédiger lance cette lecture en même temps que le mémoire."""
    _projet(db_session, test_org.id, avec_memoire=False)
    r = client.get(f"/api/projects/{PID}/memoire/criteres")
    assert r.status_code == 200, r.text
    assert r.json() == {"sous_criteres": [], "a_couvrir": []}


def test_route_autre_organisation_404(client, db_session, test_org):
    db_session.add(Organization(id="org-autre", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre")
    assert client.get(f"/api/projects/{PID}/memoire/criteres").status_code == 404
