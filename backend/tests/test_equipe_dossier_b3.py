"""B3 — « Votre équipe face au dossier » : les exigences qui citent une habilitation ou une qualification (CACES, SST,
AIPR, habilitation électrique, amiante, travail en hauteur, Qualibat, RGE) en face des habilitations et qualifications
du profil : « Dans votre profil » ou « À confirmer », chaque ligne avec ses sources. Simple recoupement de mots, aucune
règle juridique. Exigences, profils et entreprises inventés."""
from datetime import date

from models.compliance_item import ComplianceItem
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.project import Project
from models.qualification import Qualification
from models.team_member import TeamMember
from services.equipe_dossier import A_CONFIRMER, DANS_PROFIL, Profil, equipe_face_au_dossier, habilitations_citees

AUJOURDHUI = date(2026, 11, 12)
MOTS_INTERDITS = ("manquant", "incomplet", "absent")


def _e(i, texte, document="CCTP.pdf", page=3):
    return {"id": i, "texte": texte, "source": {"type": "exigence", "id": i, "document": document, "page": page}}


def _propres(lignes):
    for l in lignes:
        assert l["etat"] in ("Dans votre profil", "À confirmer")
        assert l["sources"] and all(s["type"] == "exigence" and s["id"] for s in l["sources"])
        assert all(m not in str(l).lower() for m in MOTS_INTERDITS) and "!" not in str(l)
    return lignes


# ─── Ce que citent les exigences ─────────────────────────────────────────────

def test_les_habilitations_citees_sont_reconnues_sans_accents_ni_casse():
    assert habilitations_citees("Le conducteur d'engin sera titulaire du CACES R482 catégorie B1.") == {"caces": {"R482"}}
    assert habilitations_citees("Présence d'au moins un sauveteur-secouriste du travail sur le chantier.") == {"sst": set()}
    assert habilitations_citees("Le personnel disposera de l'AIPR (opérateur).") == {"aipr": set()}
    assert habilitations_citees("Les électriciens disposeront d'une HABILITATION ÉLECTRIQUE adaptée.") == \
        {"habilitation_electrique": set()}
    assert habilitations_citees("Travaux en sous-section 4 : personnel formé au risque amiante.") == {"amiante_ss4": set()}
    assert habilitations_citees("Entreprise certifiée amiante sous-section 3.") == {"amiante_ss3": set()}
    assert habilitations_citees("Qualification Qualibat 2112 ou équivalent exigée.") == {"qualibat": {"2112"}}
    assert habilitations_citees("Entreprise titulaire du label RGE.") == {"rge": set()}
    assert habilitations_citees("Formation au travail en hauteur du personnel.") == {"travail_hauteur": set()}


def test_un_mot_voisin_ne_suffit_pas():
    # « amiante » sans formation ni sous-section, « hauteur » sans formation : un constat, pas une habilitation
    assert habilitations_citees("Le diagnostic amiante avant travaux est joint au DCE.") == {}
    assert habilitations_citees("La hauteur sous plafond est de 2,50 m.") == {}
    assert habilitations_citees("Le prix comprend la fourniture des matériaux.") == {}


# ─── En face du profil ───────────────────────────────────────────────────────

PROFIL = Profil(
    habilitations=[
        {"type": "sst", "nombre": 3, "libelle": None, "valide_jusqu": None},
        {"type": "caces", "nombre": 2, "libelle": "CACES R482 B1", "valide_jusqu": "2027-03-01"},
        {"type": "habilitation_electrique", "nombre": 1, "libelle": None, "valide_jusqu": "2025-01-31"},
    ],
    qualifications=[{"famille": "qualification", "intitule": "Qualibat 2111", "organisme": "Qualibat",
                     "perimetre": "2111 Maçonnerie et béton armé courants", "date_fin": None}],
    certifications_equipe=["AIPR opérateur, SST"],
)


def test_dans_votre_profil_ou_a_confirmer():
    lignes = _propres(equipe_face_au_dossier([
        _e("e1", "Un sauveteur secouriste du travail (SST) sera présent en permanence."),
        _e("e2", "Conducteurs d'engins titulaires du CACES R482."),
        _e("e3", "Le personnel est titulaire de l'AIPR."),
        _e("e4", "Les intervenants justifieront d'une habilitation électrique B1V."),
        _e("e5", "Qualification Qualibat 2112 ou équivalent."),
        _e("e6", "Les ouvriers seront formés au travail en hauteur."),
    ], PROFIL, AUJOURDHUI))
    etats = {l["cle"]: l["statut"] for l in lignes}
    assert etats == {"sst": DANS_PROFIL, "caces": DANS_PROFIL, "aipr": DANS_PROFIL,
                     "habilitation_electrique": A_CONFIRMER, "qualibat": A_CONFIRMER, "travail_hauteur": A_CONFIRMER}
    par = {l["cle"]: l for l in lignes}
    assert par["sst"]["profil"] == "3 personnes déclarées (SST)"
    assert "31/01/2025" in par["habilitation_electrique"]["detail"]          # date de validité passée
    assert "2112" in par["qualibat"]["detail"] and "2111" in par["qualibat"]["detail"]
    assert par["travail_hauteur"]["profil"] is None
    assert par["caces"]["sources"][0] == {"type": "exigence", "id": "e2", "document": "CCTP.pdf", "page": 3,
                                          "extrait": "Conducteurs d'engins titulaires du CACES R482."}
    assert par["sst"]["lien"] == "/company?rubrique=moyens"


def test_une_recommandation_caces_non_declaree_est_a_confirmer():
    lignes = equipe_face_au_dossier([_e("e7", "Grutier titulaire du CACES R490.")], PROFIL, AUJOURDHUI)
    assert lignes[0]["statut"] == A_CONFIRMER and "R490" in lignes[0]["detail"]


def test_plusieurs_exigences_une_ligne_par_habilitation_dans_l_ordre():
    lignes = equipe_face_au_dossier([
        _e("e8", "Présence d'un SST.", page=2),
        _e("e9", "Les engins seront conduits par du personnel titulaire du CACES.", page=4),
        _e("e10", "Rappel : un sauveteur secouriste du travail par équipe.", page=7),
    ], PROFIL, AUJOURDHUI)
    assert [l["cle"] for l in lignes] == ["sst", "caces"]
    assert [s["id"] for s in lignes[0]["sources"]] == ["e8", "e10"]


def test_un_dossier_sans_habilitation_ne_rend_rien():
    assert equipe_face_au_dossier([_e("e11", "Les enduits seront conformes au DTU 26.1.")], PROFIL, AUJOURDHUI) == []


def test_un_profil_vide_rend_tout_a_confirmer():
    lignes = equipe_face_au_dossier([_e("e12", "Personnel SST et AIPR.")], Profil(), AUJOURDHUI)
    assert {l["statut"] for l in lignes} == {A_CONFIRMER} and len(lignes) == 2


# ─── Route, et cloisonnement entre organisations ─────────────────────────────

def _dossier(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="AO B3"))
    db.add(ComplianceItem(id=f"{pid}-1", project_id=pid, category="technique", source_document="CCTP.pdf",
                          source_page=12, exigence_text="Un sauveteur secouriste du travail (SST) sera présent."))
    db.add(ComplianceItem(id=f"{pid}-2", project_id=pid, category="candidature", source_document="RC.pdf",
                          source_page=5, exigence_text="Qualification Qualibat 2111 ou équivalent."))
    db.commit()
    return f"/api/projects/{pid}/equipe"


def test_la_route_lit_le_profil_de_l_organisation(client, db_session, test_org):
    db_session.add(MemoireConfig(organization_id=test_org.id,
                                 habilitations=[{"type": "sst", "nombre": 2, "libelle": None, "valide_jusqu": None}]))
    db_session.add(Qualification(organization_id=test_org.id, famille="qualification", intitule="Qualibat 2111"))
    # une AUTRE organisation déclare tout : cela ne compte jamais pour test_org
    db_session.add(Organization(id="org-b3-autre", name="Autre"))
    db_session.commit()
    db_session.add(Qualification(organization_id="org-b3-autre", famille="qualification", intitule="Qualibat 2111"))
    db_session.add(TeamMember(organization_id="org-b3-autre", name="X", role="Chef", certifications="SST"))
    db_session.commit()
    r = client.get(_dossier(db_session, test_org.id, "p-b3"))
    assert r.status_code == 200, r.text
    corps = r.json()
    assert [(l["cle"], l["statut"]) for l in corps["lignes"]] == [("sst", DANS_PROFIL), ("qualibat", DANS_PROFIL)]
    assert corps["dans_profil"] == 2 and corps["a_confirmer"] == 0


def test_le_profil_d_une_autre_organisation_ne_compte_pas(client, db_session, test_org):
    db_session.add(Organization(id="org-b3-b", name="B"))
    db_session.commit()
    db_session.add(Qualification(organization_id="org-b3-b", famille="qualification", intitule="Qualibat 2111"))
    db_session.add(MemoireConfig(organization_id="org-b3-b",
                                 habilitations=[{"type": "sst", "nombre": 9, "libelle": None, "valide_jusqu": None}]))
    db_session.commit()
    corps = client.get(_dossier(db_session, test_org.id, "p-b3b")).json()
    assert {l["statut"] for l in corps["lignes"]} == {A_CONFIRMER}


def test_le_dossier_d_une_autre_organisation_reste_invisible(client, db_session):
    db_session.add(Organization(id="org-b3-c", name="C"))
    db_session.commit()
    r = client.get(_dossier(db_session, "org-b3-c", "p-b3c"))
    assert r.status_code == 404 and "secouriste" not in r.text
