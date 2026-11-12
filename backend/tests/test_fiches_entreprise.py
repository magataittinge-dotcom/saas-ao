"""Fiches « Mon entreprise » (T1) : données assemblées, bordereau, isolation entre entreprises.

Toutes les données sont inventées. Les routes ne prennent jamais d'identifiant d'entreprise : l'isolation se
prouve en appelant les mêmes routes avec l'utilisateur d'une AUTRE entreprise et en vérifiant qu'il ne lit,
ne modifie et ne reçoit que les siennes.
"""
from datetime import date, timedelta

import pytest
from fastapi import Request

from database import SessionLocal, get_db
from main import app
from models.document import Document
from models.fiche_entreprise import FicheEntreprise
from models.memoire_config import MemoireConfig
from models.organization import Organization
from models.reference import Reference
from models.team_member import TeamMember
from models.user import User
from routers.auth import get_auth_user, get_auth_user_short

BASE = "/api/entreprise/fiches"


def _se_connecter_comme(user_id: str, org_id: str):
    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _user(request: Request):
        request.state.rl_key = f"org:{org_id}"
        s = SessionLocal()
        try:
            return s.query(User).filter(User.id == user_id).first()
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_auth_user] = _user
    app.dependency_overrides[get_auth_user_short] = _user


@pytest.fixture
def deux_entreprises(db_session, test_org, test_user):
    """Org A (celle de `client`) et org B, chacune avec ses données inventées."""
    a, b = test_org, Organization(id="org-b", name="Bâtiments Dupré SARL", siret="12345678900011",
                                  address="4 rue des Tilleuls, 51000 Châlons")
    a.name, a.siret, a.address = "Maçonnerie Lambert SAS", "98765432100022", "12 avenue du Port, 51100 Reims"
    ub = User(id="user-b", email="b@example.com", name="Utilisateur B", organization_id=b.id)
    db_session.add_all([b, ub])
    db_session.add(MemoireConfig(
        organization_id=a.id, nom_entreprise="Lambert Maçonnerie", zone_intervention="Marne et Aube",
        activites="Gros œuvre et rénovation", moyens_informatiques="Logiciel de métrés, tablettes de chantier",
        chiffre_affaires=[{"annee": "2025", "montant": "1 200 000"}, {"annee": "2024", "montant": "980 000"}],
        postes_cles=[{"poste": "Conducteur de travaux", "nom": "Camille Martin", "role": ""}],
    ))
    db_session.add(MemoireConfig(organization_id=b.id, zone_intervention="Secret de B", activites="Secret B"))
    db_session.add_all([
        Reference(organization_id=a.id, intitule="Groupe scolaire Jean Moulin", adresse="Reims", annee=2025,
                  maitre_ouvrage="Ville de Reims", montant_ht=450000.0),
        Reference(organization_id=a.id, intitule="Résidence Les Lilas", adresse="Épernay", annee=2024,
                  maitre_ouvrage="Habitat Marne", montant_ht=250000.0),
        Reference(organization_id=b.id, intitule="Chantier confidentiel de B", maitre_ouvrage="Client de B",
                  montant_ht=999999.0, annee=2025),
    ])
    db_session.add(Document(organization_id=a.id, type="kbis", file_url="/uploads/x/kbis.pdf",
                            file_name="kbis.pdf", status="valid", expiry_date=date.today() + timedelta(days=200)))
    db_session.add(Document(organization_id=b.id, type="urssaf", file_url="/uploads/y/u.pdf",
                            file_name="u.pdf", status="valid"))
    db_session.add(TeamMember(organization_id=b.id, name="Salarié de B", role="Chef de chantier"))
    db_session.commit()
    return a, b


def _comme_b():
    _se_connecter_comme("user-b", "org-b")


# ─── GET ───────────────────────────────────────────────────────────────────────

def test_rubrique_inconnue_404(client, deux_entreprises):
    assert client.get(f"{BASE}/inconnue").status_code == 404
    assert client.put(f"{BASE}/inconnue", json={}).status_code == 404


def test_get_moyens_donnees_et_defauts(client, deux_entreprises):
    r = client.get(f"{BASE}/moyens")
    assert r.status_code == 200
    j = r.json()
    assert j["bordereau"]["titre"] == "MOYENS DE L'ENTREPRISE"
    assert j["bordereau"]["couleur"] == "#008cf8"
    assert j["bordereau"]["enregistre"] is False
    assert j["bordereau"]["sous_titre"].startswith("Dossier entreprise · ")
    d = j["donnees"]
    assert d["societe"]["nom"] == "Lambert Maçonnerie"          # la surcharge du profil prime
    assert d["pied"].startswith("Lambert Maçonnerie")
    assert "SIRET 98765432100022" in d["pied"] and "Reims" in d["pied"]
    # une tuile sans valeur disparaît (ni « — » ni zéro) : seule « personne clé » a un chiffre ici
    assert d["tuiles"] == [{"libelle": "personne clé", "valeur": "1"}]          # accordé au singulier (point 4)
    assert [s["id"] for s in d["sections"]] == ["01", "02", "03", "04", "05", "06", "07"]
    sec = {s["id"]: s for s in d["sections"]}
    assert sec["02"]["texte"].startswith("Logiciel de métrés")
    assert any(l["valeur"] == "Conducteur de travaux — Camille Martin" for l in sec["01"]["lignes"])
    assert any("Extrait Kbis" in l["libelle"] for l in sec["07"]["lignes"])
    assert {l["libelle"]: l["valeur"] for l in d["lignes_cles"]}["Zone d'intervention"] == "Marne et Aube"
    assert j["palette"]["bandeau"].startswith("#")


def test_get_certifications_tableau_et_total(client, deux_entreprises):
    j = client.get(f"{BASE}/certifications").json()
    ref = j["donnees"]["references"]
    assert [l["chantier"] for l in ref["lignes"]] == ["Groupe scolaire Jean Moulin", "Résidence Les Lilas"]
    assert ref["total"]["chantiers"] == 2
    assert ref["total"]["montant"] == "700 000 € HT"
    assert "hors taxes" in ref["note"]
    # Aucune donnée de l'autre entreprise.
    assert "confidentiel" not in str(j) and "Client de B" not in str(j)


def test_get_identite_chiffres(client, deux_entreprises):
    d = client.get(f"{BASE}/identite").json()["donnees"]
    chiffres = {s["id"]: s for s in d["sections"]}["03"]["lignes"]
    assert [l["libelle"] for l in chiffres[:2]] == ["2025", "2024"]
    assert "1 200 000 € HT" in chiffres[0]["valeur"]
    assert any(t["libelle"] == "chantiers référencés" and t["valeur"] == "2" for t in d["tuiles"])


def test_libelles_jamais_negatifs(client, deux_entreprises, db_session):
    """Une entreprise sans aucune donnée : ni « manquant », ni « incomplet », ni « absent »."""
    db_session.add(Organization(id="org-vide", name="Entreprise Vide"))
    db_session.add(User(id="user-vide", email="v@example.com", name="V", organization_id="org-vide"))
    db_session.commit()
    _se_connecter_comme("user-vide", "org-vide")
    for rubrique in ("identite", "moyens", "certifications"):
        texte = client.get(f"{BASE}/{rubrique}").text.lower()
        for mot in ("manquant", "incomplet", "absent"):
            assert mot not in texte, (rubrique, mot)


# ─── PUT ───────────────────────────────────────────────────────────────────────

def test_put_bordereau_puis_get(client, deux_entreprises):
    corps = {
        "titre": "Nos moyens", "sous_titre": "Édition de novembre", "contact": "contact@lambert.example · 03 26 00 00 00",
        "couleur": "#AA3300",
        "lignes_libres": [{"section": "03", "libelle": "Grue mobile", "valeur": "1 de 30 tonnes"}],
    }
    r = client.put(f"{BASE}/moyens", json=corps)
    assert r.status_code == 200
    b = client.get(f"{BASE}/moyens").json()["bordereau"]
    assert b["titre"] == "Nos moyens" and b["couleur"] == "#aa3300" and b["enregistre"] is True
    assert b["lignes_libres"] == [{"section": "03", "libelle": "Grue mobile", "valeur": "1 de 30 tonnes"}]
    # Un champ vidé revient à la valeur par défaut.
    client.put(f"{BASE}/moyens", json={"titre": "", "couleur": None})
    b = client.get(f"{BASE}/moyens").json()["bordereau"]
    assert b["titre"] == "MOYENS DE L'ENTREPRISE" and b["couleur"] == "#008cf8" and b["lignes_libres"] == []


def test_put_enregistre_par_rubrique(client, deux_entreprises, db_session):
    client.put(f"{BASE}/moyens", json={"titre": "Moyens"})
    client.put(f"{BASE}/certifications", json={"titre": "Références"})
    lignes = db_session.query(FicheEntreprise).order_by(FicheEntreprise.rubrique).all()
    assert [(l.rubrique, l.titre) for l in lignes] == [("certifications", "Références"), ("moyens", "Moyens")]
    client.put(f"{BASE}/moyens", json={"titre": "Moyens bis"})           # mise à jour, pas de doublon
    assert db_session.query(FicheEntreprise).filter_by(rubrique="moyens").count() == 1


@pytest.mark.parametrize("corps", [
    {"couleur": "rouge"}, {"couleur": "#12345"}, {"couleur": "#12345g"}, {"couleur": "javascript:alert(1)"},
    {"titre": "x" * 121}, {"sous_titre": "x" * 201}, {"contact": "x" * 201},
    {"lignes_libres": [{"section": "01", "libelle": "", "valeur": "v"}]},
    {"lignes_libres": [{"section": "01", "libelle": "x" * 81, "valeur": "v"}]},
    {"lignes_libres": [{"section": "01", "libelle": "l", "valeur": "x" * 301}]},
    {"lignes_libres": [{"section": "01", "libelle": "l", "valeur": "v"}] * 31},
])
def test_put_validation(client, deux_entreprises, corps):
    assert client.put(f"{BASE}/moyens", json=corps).status_code == 422


def test_put_section_inconnue_pour_la_rubrique(client, deux_entreprises):
    ok = client.put(f"{BASE}/moyens", json={"lignes_libres": [{"section": "07", "libelle": "a", "valeur": "b"}]})
    assert ok.status_code == 200
    ko = client.put(f"{BASE}/certifications", json={"lignes_libres": [{"section": "07", "libelle": "a", "valeur": "b"}]})
    assert ko.status_code == 422


def test_put_nettoie_les_caracteres_de_controle(client, deux_entreprises):
    client.put(f"{BASE}/moyens", json={"titre": "Moy\x00ens\x07", "lignes_libres": [
        {"section": "01", "libelle": "A\x0bB", "valeur": "v\x1f"}]})
    b = client.get(f"{BASE}/moyens").json()["bordereau"]
    assert b["titre"] == "Moyens" and b["lignes_libres"][0]["libelle"] == "AB"


# ─── Isolation entre entreprises ───────────────────────────────────────────────

def test_cross_org_lecture_donnees(client, deux_entreprises):
    """B lit SES données, jamais celles de A — et A jamais celles de B."""
    _comme_b()
    j = client.get(f"{BASE}/moyens").json()
    assert j["donnees"]["societe"]["nom"] == "Bâtiments Dupré SARL"
    texte = str(j)
    assert "Secret de B" in texte and "Lambert" not in texte and "Camille Martin" not in texte
    cert = str(client.get(f"{BASE}/certifications").json())
    assert "confidentiel" in cert and "Groupe scolaire" not in cert and "Reims" not in cert.replace("Châlons", "")


def test_cross_org_le_bordereau_de_a_reste_a_a(client, deux_entreprises, db_session):
    client.put(f"{BASE}/moyens", json={"titre": "TITRE DE A", "contact": "a@secret.example",
                                       "lignes_libres": [{"section": "01", "libelle": "Ligne A", "valeur": "x"}]})
    _comme_b()
    b = client.get(f"{BASE}/moyens").json()["bordereau"]
    assert b["titre"] == "MOYENS DE L'ENTREPRISE" and b["enregistre"] is False
    assert b["lignes_libres"] == [] and "secret" not in b["contact"]
    # B enregistre le sien : celui de A n'est ni écrasé ni lu.
    client.put(f"{BASE}/moyens", json={"titre": "TITRE DE B"})
    rangees = {(f.organization_id, f.titre) for f in db_session.query(FicheEntreprise).all()}
    assert rangees == {("org-test-1", "TITRE DE A"), ("org-b", "TITRE DE B")}


def test_le_corps_ne_peut_pas_viser_une_autre_entreprise(client, deux_entreprises, db_session):
    """Un `organization_id` glissé dans le corps est ignoré : la fiche est celle de l'utilisateur."""
    client.put(f"{BASE}/moyens", json={"titre": "T", "organization_id": "org-b", "id": "forge"})
    f = db_session.query(FicheEntreprise).one()
    assert f.organization_id == "org-test-1" and f.id != "forge"


def test_une_ligne_par_entreprise_et_rubrique(db_session, deux_entreprises):
    db_session.add(FicheEntreprise(organization_id="org-b", rubrique="moyens"))
    db_session.commit()
    db_session.add(FicheEntreprise(organization_id="org-b", rubrique="moyens"))
    with pytest.raises(Exception):
        db_session.commit()
    db_session.rollback()


def test_suppression_du_compte_efface_les_fiches(client, deux_entreprises, db_session):
    client.put(f"{BASE}/moyens", json={"titre": "T"})
    assert client.delete("/api/users/me").status_code == 200
    assert db_session.query(FicheEntreprise).filter_by(organization_id="org-test-1").count() == 0
