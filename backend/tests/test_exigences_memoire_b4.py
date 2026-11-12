"""B4 (PLAN § 7.3, reste) — chaque exigence de contenu technique du règlement pointe vers le paragraphe du mémoire qui
la traite, sinon « À couvrir ». Fonction pure ``services.exigences_memoire.relier_exigences`` (même normalisation que
``memoire_criteres`` : accents, casse, pluriels, racines, mots d'usage courant), sans IA. Exigences et mémoire inventés."""
from models.compliance_item import ComplianceItem
from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project, ProjectDocument
from services.exigences_memoire import A_COUVRIR, TRAITEE, relier_exigences

MOTS_INTERDITS = ("manquant", "incomplet", "absent")

MEMOIRE = {
    "preambule": "Maçonnerie du Bocage répond au lot 2 du groupe scolaire.",
    "partie_a": {"organigramme": "Le chantier est dirigé par un conducteur de travaux.\n"
                                 "Un chef d'équipe encadre trois compagnons maçons qualifiés."},
    "partie_b": {"dechets": "Les déchets de chantier sont triés sur place dans des bennes séparées.\n"
                            "Les gravats inertes sont évacués vers une plateforme de recyclage agréée, avec bordereaux."},
    "partie_c": {"methodologie": "Le phasage des travaux suit l'ordre des bâtiments A puis B."},
}


def _e(i, texte, categorie="offre", document="RC.pdf", page=4):
    return {"id": i, "texte": texte, "categorie": categorie,
            "source": {"type": "exigence", "id": i, "document": document, "page": page}}


def test_une_exigence_traitee_pointe_vers_son_paragraphe():
    lignes = relier_exigences(MEMOIRE, [
        _e("e1", "Le candidat précisera les modalités de tri et d'évacuation des déchets et gravats."),
    ])
    assert len(lignes) == 1
    l = lignes[0]
    assert l["statut"] == TRAITEE and l["libelle"] == "Traitée"
    # deux paragraphes en traitent la moitié chacun : le premier, dans l'ordre du document
    assert l["ancre"] == "sec-dechets" and l["paragraphe"] == 0
    assert l["extrait"].startswith("Les déchets de chantier sont triés")
    assert l["source"] == {"type": "exigence", "id": "e1", "document": "RC.pdf", "page": 4}
    assert l["section"] == "Partie B · Gestion des déchets" or l["section"].startswith("Partie B")


def test_le_paragraphe_qui_en_traite_le_plus_l_emporte():
    lignes = relier_exigences(MEMOIRE, [_e("e8", "Évacuation des gravats inertes vers une filière de recyclage")])
    assert lignes[0]["statut"] == TRAITEE and lignes[0]["paragraphe"] == 1


def test_une_exigence_non_traitee_est_a_couvrir():
    lignes = relier_exigences(MEMOIRE, [
        _e("e2", "Le mémoire décrira les mesures de protection contre le bruit et la poussière pour les riverains."),
    ])
    l = lignes[0]
    assert l["statut"] == A_COUVRIR and l["libelle"] == "À couvrir"
    assert l["paragraphe"] is None and l["extrait"] is None
    assert all(m not in str(l).lower() for m in MOTS_INTERDITS)


def test_accents_casse_et_pluriels_ne_comptent_pas():
    lignes = relier_exigences(MEMOIRE, [_e("e3", "ENCADREMENT : CHEF D'EQUIPE ET COMPAGNONS MACONS")])
    assert lignes[0]["statut"] == TRAITEE and lignes[0]["ancre"] == "sec-organigramme"


def test_seules_les_exigences_de_contenu_technique_sont_reliees():
    lignes = relier_exigences(MEMOIRE, [
        _e("c1", "Le candidat fournira un extrait Kbis de moins de trois mois.", categorie="candidature"),
        _e("c2", "Le candidat joindra le DC1 et le DC2 signés.", categorie="offre"),
        _e("c3", "Le mémoire technique ne devra pas dépasser 20 pages au format A4.", categorie="offre"),
        _e("c4", "Le prix des prestations sera détaillé dans la DPGF.", categorie="criteres_notation"),
        _e("c5", "Les enduits seront conformes au DTU 26.1.", categorie="technique"),
        _e("c6", "Le candidat présentera la valeur technique de son offre.", categorie="criteres_notation"),
    ])
    # pièces, forme, prix (frontière chiffrage), exécution du CCTP, et exigence générale : rien n'est relié
    assert lignes == []


def test_une_exigence_sans_source_n_est_pas_montree():
    lignes = relier_exigences(MEMOIRE, [{"id": "s1", "texte": "Tri des déchets et gravats", "categorie": "offre",
                                         "source": None}])
    assert lignes == []


def test_un_memoire_vide_rend_tout_a_couvrir_sans_ancre():
    lignes = relier_exigences({}, [_e("e4", "Modalités de tri des déchets et gravats")])
    assert lignes[0]["statut"] == A_COUVRIR and lignes[0]["ancre"] is None


def test_ordre_du_reglement_et_sans_doublon():
    lignes = relier_exigences(MEMOIRE, [
        _e("e5", "Tri des déchets et évacuation des gravats", page=5),
        _e("e6", "Tri des déchets et évacuation des gravats", page=6),
        _e("e7", "Encadrement : chef d'équipe et compagnons", page=7),
    ])
    assert [l["id"] for l in lignes] == ["e5", "e7"]


# ─── Route « Relire mon mémoire » ────────────────────────────────────────────

def _projet(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="AO B4"))
    db.add(ProjectDocument(id=f"{pid}-rc", project_id=pid, type="rc", file_url="/uploads/rc.pdf", file_name="RC.pdf"))
    db.add(ProjectDocument(id=f"{pid}-cctp", project_id=pid, type="cctp", file_url="/uploads/c.pdf",
                           file_name="CCTP.pdf"))
    db.add(MemoireTechnique(project_id=pid, content_json=MEMOIRE))
    db.add_all([
        ComplianceItem(id=f"{pid}-1", project_id=pid, category="offre", source_document="RC.pdf", source_page=4,
                       exigence_text="Le candidat précisera les modalités de tri et d'évacuation des déchets et gravats."),
        ComplianceItem(id=f"{pid}-2", project_id=pid, category="offre", source_document="RC.pdf", source_page=4,
                       exigence_text="Le mémoire décrira les mesures contre le bruit et la poussière pour les riverains."),
        # une exigence du CCTP n'est pas une exigence du règlement : non reliée
        ComplianceItem(id=f"{pid}-3", project_id=pid, category="offre", source_document="CCTP.pdf", source_page=2,
                       exigence_text="Le titulaire assurera la protection des riverains contre le bruit."),
    ])
    db.commit()
    return f"/api/projects/{pid}/memoire/relecture"


def test_la_relecture_rend_les_exigences_reliees(client, db_session, test_org):
    r = client.get(_projet(db_session, test_org.id, "p-b4"))
    assert r.status_code == 200, r.text
    bloc = r.json()["exigences"]
    assert bloc["traitees"] == 1 and bloc["a_couvrir"] == 1
    assert [l["id"] for l in bloc["lignes"]] == ["p-b4-1", "p-b4-2"]
    assert bloc["lignes"][0]["ancre"] == "sec-dechets"
    # les lignes historiques de la relecture ne changent pas de forme
    assert "lignes" in r.json() and "nombre" in r.json()


def test_la_relecture_d_une_autre_organisation_reste_invisible(client, db_session):
    db_session.add(Organization(id="org-b4-autre", name="Autre"))
    db_session.commit()
    r = client.get(_projet(db_session, "org-b4-autre", "p-b4-autre"))
    assert r.status_code == 404 and "riverains" not in r.text


def test_une_exigence_qui_enumere_est_traitee_element_par_element():
    lignes = relier_exigences(MEMOIRE, [_e(
        "e9", "Le mémoire comprendra : l'encadrement du chantier par un chef d'équipe, le tri des déchets et "
              "gravats, les protections contre le bruit des riverains (10 pts)")])
    l = lignes[0]
    assert [x["statut"] for x in l["elements"]] == [TRAITEE, TRAITEE, A_COUVRIR]
    assert l["statut"] == A_COUVRIR and l["libelle"] == "À couvrir"   # un élément à couvrir suffit
    assert l["elements"][0]["ancre"] == "sec-organigramme" and l["elements"][1]["ancre"] == "sec-dechets"
    assert l["elements"][2]["texte"].startswith("les protections contre le bruit")
