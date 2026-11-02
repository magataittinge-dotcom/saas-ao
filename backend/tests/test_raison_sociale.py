"""Raison sociale : champ vide tant que le SIRET n'est pas validé, jamais le nom du compte
(décision 2 du 2/11, défauts C8 et R20). Aucun appel réseau ni modèle."""
import io
import json
import zipfile
from types import SimpleNamespace

import pytest

from models.organization import Organization
from models.user import User
from services.raison_sociale import (
    noms_du_compte, nom_entreprise_effectif, organisation_publique, raison_sociale_de, raison_sociale_effective,
)


# ── La règle de lecture : les 4 cas ───────────────────────────────────────────

COMPTE = ["Maga Taittinge", "maga.taittinge"]


def test_regle_siret_valide_garde_le_nom_meme_sil_ressemble_au_compte():
    assert raison_sociale_effective("Maga Taittinge", True, COMPTE) == "Maga Taittinge"


def test_regle_nom_du_compte_sans_siret_valide_est_vide():
    assert raison_sociale_effective("maga.taittinge", False, COMPTE) == ""
    assert raison_sociale_effective("MAGA  TAITTINGE", False, COMPTE) == ""
    assert raison_sociale_effective("Ozcan Essai", False, ["Ozcan Essai"]) == ""


def test_regle_nom_saisi_ou_venu_de_sirene_reste_affiche():
    assert raison_sociale_effective("Bâti Façade SARL", False, COMPTE) == "Bâti Façade SARL"
    assert raison_sociale_effective("  Bâti Façade SARL ", True, COMPTE) == "Bâti Façade SARL"


def test_regle_nom_vide_ou_absent_reste_vide():
    assert raison_sociale_effective("", False, COMPTE) == ""
    assert raison_sociale_effective(None, True, COMPTE) == ""
    assert raison_sociale_effective("   ", True, COMPTE) == ""


def test_noms_du_compte_nom_et_partie_locale_de_lemail():
    u = SimpleNamespace(name="Éloïse Durand", email="eloise.durand@exemple.test")
    assert noms_du_compte([u]) == ["Éloïse Durand", "eloise.durand"]
    assert raison_sociale_effective("eloise durand", False, noms_du_compte([u])) == ""


# ── Lecture depuis la base (aucune écriture) ──────────────────────────────────

def _org_et_compte(db, *, nom, verifie=False, org_id="org-rs", user_nom="Maga Taittinge",
                   email=None):
    org = Organization(id=org_id, name=nom, siret_verified=verifie)
    db.add(org)
    email = email or f"maga.taittinge.{org_id}@exemple.test"
    db.add(User(id=f"u-{org_id}", email=email, name=user_nom, organization_id=org_id))
    db.commit()
    return org


def test_lecture_en_base_masque_sans_ecrire(db_session):
    org = _org_et_compte(db_session, nom="maga.taittinge")
    assert raison_sociale_de(org, db_session) == ""
    assert raison_sociale_de(org) == ""            # session prise sur l'objet
    db_session.refresh(org)
    assert org.name == "maga.taittinge"             # rien n'est écrit
    assert organisation_publique(org, db_session)["name"] == ""


def test_lecture_en_base_siret_valide_ou_nom_saisi(db_session):
    verifiee = _org_et_compte(db_session, nom="Maga Taittinge", verifie=True, org_id="org-v")
    assert raison_sociale_de(verifiee, db_session) == "Maga Taittinge"
    saisie = _org_et_compte(db_session, nom="Taittinge Maçonnerie", org_id="org-s")
    assert raison_sociale_de(saisie, db_session) == "Taittinge Maçonnerie"


# ── Création de compte : l'organisation naît sans raison sociale ──────────────

def test_creation_de_compte_nom_vide(db_session, monkeypatch):
    import routers.auth as auth_mod

    monkeypatch.setattr(auth_mod, "_fetch_clerk_user", lambda _id: {
        "email_addresses": [{"email_address": "maga.taittinge@exemple.test"}],
        "first_name": "Maga", "last_name": "Taittinge",
    })
    user = auth_mod._sync_clerk_user("clerk-nouveau", db_session)
    org = db_session.query(Organization).filter(Organization.id == user.organization_id).one()
    assert org.name == ""
    assert user.name == "Maga Taittinge"            # le compte garde son nom, pas l'entreprise
    assert raison_sociale_de(org, db_session) == ""


def test_creation_de_compte_sans_prenom_ni_nom(db_session, monkeypatch):
    import routers.auth as auth_mod

    monkeypatch.setattr(auth_mod, "_fetch_clerk_user", lambda _id: {
        "email_addresses": [{"email_address": "ozcan.essai@exemple.test"}],
    })
    user = auth_mod._sync_clerk_user("clerk-sans-nom", db_session)
    org = db_session.query(Organization).filter(Organization.id == user.organization_id).one()
    assert org.name == ""


# ── API : /auth/me et /organizations/me renvoient la règle ────────────────────

def test_api_me_et_organisation_vides(client, db_session, test_org, test_user):
    test_org.name = "test"          # partie locale de test@example.com
    db_session.commit()
    assert client.get("/api/auth/me").json()["organization"]["name"] == ""
    assert client.get("/api/organizations/me").json()["name"] == ""
    db_session.refresh(test_org)
    assert test_org.name == "test"


def test_api_nom_saisi_reste_affiche(client, db_session, test_org):
    r = client.patch("/api/organizations/me", json={"name": "Bâti Façade SARL"})
    assert r.status_code == 200
    assert r.json()["name"] == "Bâti Façade SARL"
    assert client.get("/api/auth/me").json()["organization"]["name"] == "Bâti Façade SARL"


# ── Fiches : jamais le nom du compte ──────────────────────────────────────────

def test_fiche_sans_nom_du_compte(db_session):
    from services.fiches_donnees import _societe

    org = _org_et_compte(db_session, nom="maga.taittinge", org_id="org-fiche-rs")
    assert _societe(org, None, db_session)["nom"] == ""
    org.name = "Bâti SARL"
    assert _societe(org, None, db_session)["nom"] == "Bâti SARL"


# ── Page de garde : « À compléter », comptée ──────────────────────────────────

CONTENU = {"preambule": "Texte.", "partie_a": {}, "partie_b": {}, "partie_c": {}}


def _xml(octets: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(octets)) as z:
        return z.read("word/document.xml").decode("utf-8")


def test_page_de_garde_sans_raison_sociale_a_completer_et_compte():
    from services.docx_exporter import build_memoire_docx_ex, compter_passages_a_completer

    sans = build_memoire_docx_ex(CONTENU, "Groupe scolaire", "")
    assert "À compléter : raison sociale" in _xml(sans.octets)
    assert sans.nombre == 1
    assert [p.libelle for p in sans.a_completer] == ["raison sociale"]

    avec = build_memoire_docx_ex(CONTENU, "Groupe scolaire", "Bâti SARL")
    assert "raison sociale" not in _xml(avec.octets)
    assert avec.nombre == 0

    assert compter_passages_a_completer(CONTENU) == 0
    assert compter_passages_a_completer(CONTENU, raison_sociale_vide=True) == 1


# ── Mémoire : le modèle ne reçoit jamais le nom du compte ─────────────────────

def _org_generateur(nom):
    return SimpleNamespace(
        id="org", name=nom, siret=None, address=None, historique=None, activites=None, organigramme=None,
        moyens_informatiques=None, vehicules=None, materiel=None, fournisseurs=None,
    )


def test_company_block_sans_nom_et_consigne_notre_entreprise(monkeypatch):
    import asyncio
    from tests.test_memoire_generator_segments import _build_side_effect
    from services.ai.memoire_generator import MemoireGenerator

    gen = MemoireGenerator()
    effet, appels = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", effet)

    async def lancer(**kw):
        return await gen.generate(
            organization=_org_generateur("maga.taittinge"), memoire_config=None, project_name="Projet",
            maitre_ouvrage="MOA", selected_lot_name="Lot 02", all_docs=[], compliance_items=[],
            references=[], variables={}, criteres_jugement=[], reference_template_text=None,
            project_id=None, **kw)

    asyncio.run(lancer())          # sans raison sociale transmise
    texte = json.dumps(appels["kwargs"], ensure_ascii=False)
    assert "maga.taittinge" not in texte
    assert '"nom"' not in texte.split("PROFIL ENTREPRISE")[1].split("RÉFÉRENCES CHANTIERS")[0]
    assert "notre entreprise" in texte
    assert "jamais de crochets" in texte

    appels["kwargs"].clear()
    asyncio.run(lancer(raison_sociale="Bâti Façade SARL"))
    texte = json.dumps(appels["kwargs"], ensure_ascii=False)
    assert "Bâti Façade SARL" in texte
    assert "jamais de crochets" not in texte


# ── Le nom saisi dans le profil du mémoire prime, comme à la génération ───────

def test_nom_entreprise_effectif_profil_du_memoire_prime(db_session):
    from models.memoire_config import MemoireConfig

    org = _org_et_compte(db_session, nom="maga.taittinge", org_id="org-cfg")
    assert nom_entreprise_effectif(org, db_session) == ""
    db_session.add(MemoireConfig(organization_id="org-cfg", nom_entreprise="  Bâti Façade SARL "))
    db_session.commit()
    assert nom_entreprise_effectif(org, db_session) == "Bâti Façade SARL"
    assert raison_sociale_de(org, db_session) == ""      # la règle sur l'organisation seule n'a pas changé
