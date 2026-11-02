"""E3 — « Rédigée » / « À refaire » : un seul état par partie, choisi par le patron.

Rien d'autre : ni statuts multiples, ni rôle, ni responsable, ni échéance. L'état vit dans le JSON du mémoire
(clé à part ``_etat_sections``, sans migration) et l'export ne le voit jamais."""
import io
import json
import threading

import pytest

from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project, ProjectDocument

PID = "proj-etat"
CHEMIN = f"/api/projects/{PID}/memoire/sections/partie_b/dechets"

CONTENU = {
    "preambule": "Préambule d'origine.",
    "partie_a": {"implantation": "Caen.", "historique": "Depuis 2008."},
    "partie_b": {"dechets": "Texte d'origine sur les déchets.", "securite": "Texte sur la sécurité."},
    "partie_c": {"delai": "Quatre mois."},
    "_generation_meta": {"warnings": []},
}


@pytest.fixture(autouse=True)
def _pas_de_limite(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def _projet(db, org_id, pid=PID, avec_memoire=True, contenu=None):
    db.get(Organization, org_id).plan = "pro"
    db.add(Project(id=pid, organization_id=org_id, name="AO état", selected_lot="lot1",
                   selected_lot_name="Lot 1", current_step=5, status="en_cours", processing_status="ready"))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement de consultation. " * 30))
    if avec_memoire:
        db.add(MemoireTechnique(project_id=pid, version=1, content_json=json.loads(json.dumps(contenu or CONTENU))))
    db.commit()


def _contenu(db):
    db.expire_all()
    return db.query(MemoireTechnique).first().content_json


def _joindre():
    for t in threading.enumerate():
        if t.name.startswith("synorix-refaire-"):
            t.join(timeout=30)


def test_marquer_a_refaire_puis_redigee(client, db_session, test_org):
    _projet(db_session, test_org.id)
    r = client.put(CHEMIN + "/etat", json={"etat": "a_refaire"})
    assert r.status_code == 200, r.text
    assert r.json() == {"etats": {"partie_b.dechets": "a_refaire"}}
    c = _contenu(db_session)
    assert c["_etat_sections"] == {"partie_b.dechets": "a_refaire"}
    # le texte et le reste du mémoire n'ont pas bougé
    sans_etat = {k: v for k, v in c.items() if k != "_etat_sections"}
    assert json.dumps(sans_etat, sort_keys=True) == json.dumps(CONTENU, sort_keys=True)

    r = client.put(CHEMIN + "/etat", json={"etat": "redigee"})
    assert r.json() == {"etats": {}}
    assert not _contenu(db_session).get("_etat_sections")


def test_deux_etats_seulement(client, db_session, test_org):
    _projet(db_session, test_org.id)
    for etat in ("en_cours", "valide", "relu", "", None, "A_REFAIRE"):
        assert client.put(CHEMIN + "/etat", json={"etat": etat}).status_code == 422, etat
    # aucun champ de gestion
    r = client.put(CHEMIN + "/etat", json={"etat": "a_refaire", "responsable": "Camille", "echeance": "2026-11-10"})
    assert r.status_code in (200, 422)
    assert "responsable" not in json.dumps(_contenu(db_session)) and "echeance" not in json.dumps(_contenu(db_session))


def test_etat_autre_organisation_404_et_inconnue_404(client, db_session, test_org):
    db_session.add(Organization(id="org-autre", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre")
    assert client.put(CHEMIN + "/etat", json={"etat": "a_refaire"}).status_code == 404
    assert "_etat_sections" not in _contenu(db_session)


def test_etat_section_inconnue_404_et_sans_memoire_409(client, db_session, test_org):
    _projet(db_session, test_org.id, avec_memoire=False)
    assert client.put(CHEMIN + "/etat", json={"etat": "a_refaire"}).status_code == 409
    assert client.put(f"/api/projects/{PID}/memoire/sections/partie_b/zzz/etat",
                      json={"etat": "a_refaire"}).status_code == 404


def test_l_etat_est_rendu_avec_le_memoire(client, db_session, test_org):
    _projet(db_session, test_org.id)
    client.put(CHEMIN + "/etat", json={"etat": "a_refaire"})
    corps = client.get(f"/api/projects/{PID}/memoire").json()
    assert corps["content_json"]["_etat_sections"] == {"partie_b.dechets": "a_refaire"}


def test_l_enregistrement_de_l_editeur_ne_touche_pas_aux_etats(client, db_session, test_org):
    _projet(db_session, test_org.id)
    client.put(CHEMIN + "/etat", json={"etat": "a_refaire"})
    # l'éditeur renvoie son contenu complet, sans (ou avec un autre) état : l'état choisi par le patron reste
    nouveau = {**CONTENU, "partie_a": {"implantation": "Rouen.", "historique": "Depuis 2008."}}
    assert client.patch(f"/api/projects/{PID}/memoire", json={"content_json": nouveau}).status_code == 200
    c = _contenu(db_session)
    assert c["partie_a"]["implantation"] == "Rouen."
    assert c["_etat_sections"] == {"partie_b.dechets": "a_refaire"}
    avec_autre = {**nouveau, "_etat_sections": {"partie_a.historique": "a_refaire"}}
    assert client.patch(f"/api/projects/{PID}/memoire", json={"content_json": avec_autre}).status_code == 200
    assert _contenu(db_session)["_etat_sections"] == {"partie_b.dechets": "a_refaire"}


def test_une_partie_refaite_redevient_redigee(client, db_session, test_org, monkeypatch):
    import routers.memoire as memoire_mod
    _projet(db_session, test_org.id)
    client.put(CHEMIN + "/etat", json={"etat": "a_refaire"})
    client.put(f"/api/projects/{PID}/memoire/sections/partie_b/securite/etat", json={"etat": "a_refaire"})

    async def _faux(self, part, cle, **kw):
        return "Texte refait.", {"segment": part}
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "refaire_section", _faux)
    assert client.post(CHEMIN + "/refaire").status_code == 200
    _joindre()
    c = _contenu(db_session)
    assert c["partie_b"]["dechets"] == "Texte refait."
    assert c["_etat_sections"] == {"partie_b.securite": "a_refaire"}      # l'autre partie reste « À refaire »


def test_un_refaire_en_echec_garde_l_etat(client, db_session, test_org, monkeypatch):
    import routers.memoire as memoire_mod
    _projet(db_session, test_org.id)
    client.put(CHEMIN + "/etat", json={"etat": "a_refaire"})

    async def _boom(self, part, cle, **kw):
        raise RuntimeError("claude down")
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "refaire_section", _boom)
    client.post(CHEMIN + "/refaire")
    _joindre()
    assert _contenu(db_session)["_etat_sections"] == {"partie_b.dechets": "a_refaire"}


def test_l_export_word_ne_change_pas(client, db_session, test_org):
    """Le Word construit avec les états est identique à celui construit sans eux : même texte, aucune trace."""
    from docx import Document
    from services.docx_exporter import build_memoire_docx

    def texte(contenu):
        d = Document(io.BytesIO(build_memoire_docx(contenu, "Projet", "Entreprise")))
        paragraphes = [p.text for p in d.paragraphs]
        tableaux = [[c.text for ligne in t.rows for c in ligne.cells] for t in d.tables]
        return paragraphes, tableaux, d.element.xml

    sans = texte(CONTENU)
    avec = texte({**CONTENU, "_etat_sections": {"partie_b.dechets": "a_refaire"}})
    assert avec[0] == sans[0] and avec[1] == sans[1]
    assert "a_refaire" not in avec[2] and "_etat_sections" not in avec[2]


def test_l_export_zip_et_la_page_export_ignorent_les_etats(client, db_session, test_org):
    _projet(db_session, test_org.id)
    client.put(CHEMIN + "/etat", json={"etat": "a_refaire"})
    docx = client.get(f"/api/projects/{PID}/memoire/export-docx")
    assert docx.status_code == 200
    assert b"a_refaire" not in docx.content
