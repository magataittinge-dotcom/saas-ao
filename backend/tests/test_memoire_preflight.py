"""
Tests C9a — pre-flight preview avant génération de mémoire.

  • GET /projects/{id}/memoire/preflight : profil condensé + références
    classées par pertinence pour CE lot (5-8 pré-cochées) + rappel quota.
  • Overrides de profil LOCAUX au mémoire par défaut (le profil org reste
    intact) ; case « mettre à jour mon profil » → propagation MemoireConfig.
  • Sélection de références respectée par la génération.
"""
import pytest

from models.memoire import MemoireTechnique
from models.memoire_config import MemoireConfig
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption
from models.reference import Reference


_DUMMY_CONTENT = {"preambule": "x", "partie_a": {}, "partie_b": {}, "partie_c": {}}


def _join():
    """Génération détachée : attendre la fin du job avant les asserts."""
    import threading
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    """generate_memoire est limité à 3/min — sans ceci le 4e test du fichier
    prend un 429. Le décorateur slowapi consulte l'instance du module."""
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def _mock_generator(monkeypatch, captured: dict):
    import routers.memoire as memoire_mod

    async def _fake_generate(self, **kwargs):
        captured.update(kwargs)
        # Snapshot des ids AVANT fermeture de la session (les ORM refs seraient
        # détachées après la requête).
        captured["reference_ids_received"] = [r.id for r in kwargs.get("references", [])]
        return _DUMMY_CONTENT
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _fake_generate)


def _setup(db, org_id, pid="proj-c9a", lot_name="Lot 2 — Ravalement de façades"):
    """Projet type Gueux (lot façades) + profil + références variées."""
    p = Project(
        id=pid, organization_id=org_id, name="Groupe scolaire Gueux",
        selected_lot="lot2", selected_lot_name=lot_name,
    )
    db.add(p)
    db.add(ProjectDocument(
        project_id=pid, type="rc", file_url=f"/uploads/projects/{pid}/rc.pdf",
        file_name="RC.pdf", extracted_text="RC " * 50,
    ))
    db.add(MemoireConfig(
        organization_id=org_id,
        nom_entreprise="BATI FACADE SARL",
        gerant_nom="Karim Omarov",
        zone_intervention="Normandie",
        materiel="2 échafaudages MDS",
    ))
    # 3 références façades (pertinentes) + 7 hors sujet
    for i in range(3):
        db.add(Reference(
            organization_id=org_id, intitule=f"Ravalement façade école {i}",
            lot="Ravalement de façades", annee=2024 - i, montant_ht=100000 + i,
        ))
    for i in range(7):
        db.add(Reference(
            organization_id=org_id, intitule=f"Plomberie immeuble {i}",
            lot="Plomberie sanitaire", annee=2020, montant_ht=50000,
        ))
    db.commit()
    return p


# ─── GET preflight ───────────────────────────────────────────────────────────

def test_preflight_returns_profile_references_quota(client, db_session, test_org):
    test_org.plan = "pro"
    db_session.commit()
    _setup(db_session, test_org.id)
    for _ in range(12):
        db_session.add(QuotaConsumption(organization_id=test_org.id, kind="memoire"))
    db_session.commit()

    resp = client.get("/api/projects/proj-c9a/memoire/preflight")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Profil condensé (identité / moyens / équipe)
    assert body["profil"]["nom"] == "BATI FACADE SARL"
    assert body["profil"]["gerant_nom"] == "Karim Omarov"
    assert body["profil"]["materiel"] == "2 échafaudages MDS"

    # Références : les pertinentes (façades) d'abord et pré-cochées
    refs = body["references"]
    assert len(refs) == 10
    selected = [r for r in refs if r["selected"]]
    assert 5 <= len(selected) <= 8
    # Les 3 façades sont dans la sélection (pertinence lot)
    facades = [r for r in refs if "façade" in r["intitule"].lower() or "facade" in r["intitule"].lower()]
    assert all(r["selected"] for r in facades)
    # Classement : la première référence listée est une façade
    assert "avalement" in refs[0]["intitule"] or "façade" in refs[0]["intitule"]

    # Rappel quota : consommera 1 mémoire — X/40 ce mois
    assert body["quota"]["used"] == 12
    assert body["quota"]["limit"] == 40


def test_preflight_cross_org_404(client, db_session, test_org):
    from models.organization import Organization
    db_session.add(Organization(id="org-c9a-other", name="Autre"))
    db_session.flush()
    _setup(db_session, "org-c9a-other", pid="proj-c9a-other")

    resp = client.get("/api/projects/proj-c9a-other/memoire/preflight")
    assert resp.status_code == 404


# ─── Overrides locaux : le profil org n'est PAS altéré ───────────────────────

def test_local_overrides_do_not_touch_org_profile(client, db_session, test_org, monkeypatch):
    test_org.plan = "pro"
    db_session.commit()
    _setup(db_session, test_org.id)
    captured: dict = {}
    _mock_generator(monkeypatch, captured)

    resp = client.post("/api/projects/proj-c9a/memoire/generate", json={
        "profile_overrides": {"materiel": "3 nacelles + échafaudage parapluie"},
    })
    assert resp.status_code == 200, resp.text
    _join()

    # Le generator a bien reçu l'override…
    assert captured["profile_overrides"] == {"materiel": "3 nacelles + échafaudage parapluie"}
    # …le profil org est INTACT…
    db_session.expire_all()
    cfg = db_session.query(MemoireConfig).filter(
        MemoireConfig.organization_id == test_org.id,
    ).first()
    assert cfg.materiel == "2 échafaudages MDS"
    # …et l'override est persisté SUR le mémoire (local).
    memoire = db_session.query(MemoireTechnique).filter(
        MemoireTechnique.project_id == "proj-c9a",
    ).first()
    assert memoire.profile_overrides == {"materiel": "3 nacelles + échafaudage parapluie"}


def test_update_profile_checkbox_propagates(client, db_session, test_org, monkeypatch):
    test_org.plan = "pro"
    db_session.commit()
    _setup(db_session, test_org.id)
    _mock_generator(monkeypatch, {})

    resp = client.post("/api/projects/proj-c9a/memoire/generate", json={
        "profile_overrides": {"materiel": "3 nacelles", "zone_intervention": "Grand Ouest"},
        "update_profile": True,
    })
    assert resp.status_code == 200, resp.text
    _join()

    db_session.expire_all()
    cfg = db_session.query(MemoireConfig).filter(
        MemoireConfig.organization_id == test_org.id,
    ).first()
    assert cfg.materiel == "3 nacelles"
    assert cfg.zone_intervention == "Grand Ouest"
    # Champ non touché → inchangé
    assert cfg.gerant_nom == "Karim Omarov"


def test_unknown_override_keys_rejected(client, db_session, test_org, monkeypatch):
    _setup(db_session, test_org.id)
    _mock_generator(monkeypatch, {})

    resp = client.post("/api/projects/proj-c9a/memoire/generate", json={
        "profile_overrides": {"plan": "business"},   # clé hors whitelist
    })
    assert resp.status_code == 422


# ─── Sélection de références respectée ───────────────────────────────────────

def test_reference_selection_respected(client, db_session, test_org, monkeypatch):
    test_org.plan = "pro"
    db_session.commit()
    _setup(db_session, test_org.id)
    captured: dict = {}
    _mock_generator(monkeypatch, captured)

    facade_ids = [
        r.id for r in db_session.query(Reference).filter(
            Reference.intitule.like("Ravalement%"),
        ).all()
    ]
    resp = client.post("/api/projects/proj-c9a/memoire/generate", json={
        "reference_ids": facade_ids,
    })
    assert resp.status_code == 200, resp.text
    _join()

    sent_ids = captured["reference_ids_received"]
    assert len(sent_ids) == 3
    assert set(sent_ids) == set(facade_ids)


def test_foreign_reference_ids_ignored(client, db_session, test_org, monkeypatch):
    """Des ids de références d'une autre org ne peuvent pas être injectés."""
    from models.organization import Organization
    db_session.add(Organization(id="org-c9a-evil", name="Evil"))
    db_session.flush()
    evil_ref = Reference(organization_id="org-c9a-evil", intitule="Ref volée")
    db_session.add(evil_ref)
    _setup(db_session, test_org.id)
    captured: dict = {}
    _mock_generator(monkeypatch, captured)

    resp = client.post("/api/projects/proj-c9a/memoire/generate", json={
        "reference_ids": [evil_ref.id],
    })
    # Aucune référence valide → génération quand même (sans références volées)
    assert resp.status_code == 200
    _join()
    assert captured["reference_ids_received"] == []
