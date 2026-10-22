"""1.8 — Enregistrement du mémoire depuis l'éditeur : un mémoire complet est
enregistré tel quel ; un envoi partiel ou abîmé est refusé (422) et le mémoire
en base reste intact."""
from models.memoire import MemoireTechnique
from models.project import Project

PID = "proj-patch-memoire"

CONTENU = {
    "preambule": "Préambule.\n\n### Sous-titre",
    "partie_a": {"implantation": "Reims.", "references": "## 10. Références chantiers\n---"},
    "partie_b": {"dechets": "Tri sélectif.\n\n### Gestion de l'Environnement"},
    "partie_c": {"delai": "4 mois.\n\n"},
    "_generation_meta": {"warnings": []},
}


def _make(db, org_id):
    db.add(Project(id=PID, organization_id=org_id, name="AO patch", current_step=5))
    db.add(MemoireTechnique(project_id=PID, content_json=CONTENU, version=1))
    db.commit()


def _en_base(db):
    db.expire_all()
    return db.query(MemoireTechnique).filter(MemoireTechnique.project_id == PID).first().content_json


def test_patch_saves_content_exactly(client, db_session, test_org):
    _make(db_session, test_org.id)
    nouveau = {**CONTENU, "partie_b": {"dechets": "Tri sélectif, trois bennes."}}
    resp = client.patch(f"/api/projects/{PID}/memoire", json={"content_json": nouveau})
    assert resp.status_code == 200, resp.text
    assert _en_base(db_session) == nouveau


def test_patch_refuses_partial_content_and_keeps_memoire(client, db_session, test_org):
    _make(db_session, test_org.id)
    partiel = {"preambule": "Seulement le préambule."}
    resp = client.patch(f"/api/projects/{PID}/memoire", json={"content_json": partiel})
    assert resp.status_code == 422
    assert _en_base(db_session) == CONTENU


def test_patch_refuses_malformed_content(client, db_session, test_org):
    _make(db_session, test_org.id)
    for abime in ("texte brut", {**CONTENU, "preambule": 3}, {**CONTENU, "partie_a": {"implantation": None}},
                  {**CONTENU, "partie_c": ["liste"]}):
        resp = client.patch(f"/api/projects/{PID}/memoire", json={"content_json": abime})
        assert resp.status_code == 422, abime
    assert _en_base(db_session) == CONTENU
