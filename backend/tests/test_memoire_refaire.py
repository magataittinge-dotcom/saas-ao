"""E2 — « Refaire cette partie » : une sous-section régénérée, le reste du mémoire intact.

Aucun appel réel : le client Anthropic est simulé (générateur) ou le générateur est remplacé (routes).
Textes et entreprises inventés."""
import asyncio
import json
import threading
from types import SimpleNamespace

import pytest

from models.memoire import MemoireTechnique
from models.organization import Organization
from models.project import Project, ProjectDocument
from models.quota_consumption import QuotaConsumption
from services.ai.memoire_generator import MemoireGenerator, _MEMOIRE_SEGMENT_MODELS
from tests.test_memoire_generator_segments import (
    _build_side_effect, _FakeStream, _make_org, _run, _subkeys,
)

PID = "proj-refaire"
CHEMIN = f"/api/projects/{PID}/memoire/sections/partie_b/dechets"


# ── Le générateur : même préfixe, consigne limitée à la sous-section ─────────

def _refaire_kwargs():
    return dict(
        organization=_make_org(), memoire_config=None, project_name="Projet Test", maitre_ouvrage="MOA Test",
        selected_lot_name="Lot 02 - Étanchéité - Couverture",
        all_docs=[SimpleNamespace(type="cctp", file_name="cctp.pdf", extracted_text="Texte CCTP étanchéité.")],
        compliance_items=[], references=[], variables={}, criteres_jugement=[], reference_template_text=None,
        project_id=None, raison_sociale="ENTREPRISE TEST",
    )


@pytest.mark.asyncio
async def test_le_prefixe_est_identique_a_celui_de_la_generation(monkeypatch):
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)
    await _run(gen)
    appel_b = next(k for k in calls["kwargs"] if "« partie_b »" in k["messages"][0]["content"][-1]["text"])

    gen2 = MemoireGenerator()
    side_effect2, calls2 = _build_side_effect()
    monkeypatch.setattr(gen2.client.messages, "stream", side_effect2)
    texte, meta = await gen2.refaire_section("partie_b", "dechets", **_refaire_kwargs())

    assert len(calls2["kwargs"]) == 1                      # un seul appel
    k = calls2["kwargs"][0]
    # système + référentiels (cachés) et blocs « profil » et « marché » (cachés) : identiques à l'octet
    assert json.dumps(k["system"], sort_keys=True) == json.dumps(appel_b["system"], sort_keys=True)
    assert k["messages"][0]["content"][:2] == appel_b["messages"][0]["content"][:2]
    assert "temperature" not in k and k["max_tokens"] == 32000
    assert k["model"] == _MEMOIRE_SEGMENT_MODELS["partie_b"]
    assert not k["model"].startswith("claude-opus")
    # la consigne (dernier bloc, non caché) ne nomme que cette sous-section
    consigne = k["messages"][0]["content"][-1]["text"]
    assert "- dechets" in consigne
    for autre in _subkeys("partie_b"):
        if autre != "dechets":
            assert f"- {autre}\n" not in consigne and not consigne.rstrip().endswith(f"- {autre}")
    assert "« partie_a »" not in consigne and "« partie_c »" not in consigne
    # la sortie : le texte de cette sous-section seule
    assert texte == "contenu dechets"
    assert meta["segment"] == "partie_b"


@pytest.mark.asyncio
async def test_une_ligne_jetons_est_au_journal(monkeypatch, capsys):
    gen = MemoireGenerator()
    side_effect, _ = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)
    await gen.refaire_section("partie_c", "delai", **_refaire_kwargs())
    sortie = capsys.readouterr().out
    lignes = [l for l in sortie.splitlines() if l.startswith("jetons etape=memoire_refaire_partie_c_delai ")]
    assert len(lignes) == 1 and "modele=" in lignes[0] and "sortie=20" in lignes[0]


@pytest.mark.asyncio
async def test_le_modele_forcé_par_reglage_est_respecte(monkeypatch):
    from config import get_settings
    monkeypatch.setattr(get_settings(), "MEMOIRE_MODELE", "claude-sonnet-4-6", raising=False)
    gen = MemoireGenerator()
    side_effect, calls = _build_side_effect()
    monkeypatch.setattr(gen.client.messages, "stream", side_effect)
    await gen.refaire_section("partie_a", "historique", **_refaire_kwargs())
    assert calls["kwargs"][0]["model"] == "claude-sonnet-4-6"


@pytest.mark.asyncio
async def test_une_sous_section_vide_est_une_erreur_pas_un_texte_vide(monkeypatch):
    from services.ai.memoire_generator import RefaireVide
    gen = MemoireGenerator()
    monkeypatch.setattr(gen.client.messages, "stream",
                        lambda **kw: _FakeStream(json.dumps({"partie_b": {"dechets": "  "}})))
    with pytest.raises(RefaireVide):
        await gen.refaire_section("partie_b", "dechets", **_refaire_kwargs())


@pytest.mark.asyncio
async def test_sous_section_inconnue_refusee():
    gen = MemoireGenerator()
    with pytest.raises(ValueError):
        await gen.refaire_section("partie_b", "inconnue", **_refaire_kwargs())


# ── Les routes ────────────────────────────────────────────────────────────────

CONTENU = {
    "preambule": "Préambule d'origine.",
    "partie_a": {"implantation": "Caen.", "historique": "Depuis 2008."},
    "partie_b": {"dechets": "Texte d'origine sur les déchets.", "securite": "Texte sur la sécurité."},
    "partie_c": {"delai": "Quatre mois."},
    "_generation_meta": {
        "models": {"partie_b": "claude-sonnet-5-5"},
        "segments": [
            {"segment": "preambule", "model": "claude-sonnet-5-5", "input_tokens": 100, "cache_read": 0,
             "cache_write": 80000, "output_tokens": 1500, "chars": 3000},
            {"segment": "partie_b", "model": "claude-sonnet-5-5", "input_tokens": 200, "cache_read": 80000,
             "cache_write": 0, "output_tokens": 9000, "chars": 20000},
        ],
    },
}


@pytest.fixture(autouse=True)
def _pas_de_limite(monkeypatch):
    import routers.memoire as memoire_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)


def _joindre():
    for t in threading.enumerate():
        if t.name.startswith("synorix-refaire-") or t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)


def _projet(db, org_id, pid=PID, avec_memoire=True, statut="en_cours"):
    db.get(Organization, org_id).plan = "pro"
    db.add(Project(id=pid, organization_id=org_id, name="AO refaire", selected_lot="lot1",
                   selected_lot_name="Lot 1 — Gros œuvre", current_step=5, status=statut,
                   processing_status="ready"))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement de consultation. " * 30))
    if avec_memoire:
        db.add(MemoireTechnique(project_id=pid, version=3, content_json=json.loads(json.dumps(CONTENU)),
                                variables={"nb_ouvriers": 4}, profile_overrides=None))
    db.commit()


def _contenu(db, pid=PID):
    db.expire_all()
    return db.query(MemoireTechnique).filter(MemoireTechnique.project_id == pid).first().content_json


def _faux_refaire(monkeypatch, texte="Texte refait sur les déchets.", attente=None, erreur=None):
    import routers.memoire as memoire_mod
    appels = []

    async def _faux(self, part, cle, **kwargs):
        appels.append((part, cle, kwargs))
        if attente is not None:
            await asyncio.to_thread(attente.wait, 20)
        if erreur is not None:
            raise erreur
        return texte, {"segment": part}
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "refaire_section", _faux)
    return appels


def test_refaire_ne_change_que_la_sous_section(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    appels = _faux_refaire(monkeypatch)
    avant = _contenu(db_session)

    r = client.post(CHEMIN + "/refaire")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "started"
    _joindre()

    apres = _contenu(db_session)
    assert apres["partie_b"]["dechets"] == "Texte refait sur les déchets."
    # le reste, octet pour octet
    attendu = json.loads(json.dumps(avant))
    attendu["partie_b"]["dechets"] = "Texte refait sur les déchets."
    assert json.dumps(apres, sort_keys=True) == json.dumps(attendu, sort_keys=True)
    # même contexte que la génération : le profil et les variables enregistrés avec le mémoire sont repris
    assert appels[0][0:2] == ("partie_b", "dechets")
    assert appels[0][2]["variables"] == {"nb_ouvriers": 4}
    # le projet est de nouveau disponible, l'étape n'a pas bougé
    db_session.expire_all()
    p = db_session.get(Project, PID)
    assert p.processing_status == "ready" and p.current_step == 5


def test_refaire_ne_decompte_aucune_unite(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    _faux_refaire(monkeypatch)
    assert client.post(CHEMIN + "/refaire").status_code == 200
    _joindre()
    assert db_session.query(QuotaConsumption).filter(
        QuotaConsumption.organization_id == test_org.id).count() == 0


def test_refaire_sans_memoire_est_refuse_clairement(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id, avec_memoire=False)
    _faux_refaire(monkeypatch)
    r = client.post(CHEMIN + "/refaire")
    assert r.status_code == 409
    assert "mémoire" in r.json()["detail"].lower()


def test_refaire_autre_organisation_404(client, db_session, test_org, monkeypatch):
    db_session.add(Organization(id="org-autre", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre")
    appels = _faux_refaire(monkeypatch)
    assert client.post(CHEMIN + "/refaire").status_code == 404
    assert client.get(CHEMIN + "/refaire/estimation").status_code == 404
    assert appels == []
    assert _contenu(db_session)["partie_b"]["dechets"] == CONTENU["partie_b"]["dechets"]


def test_refaire_sous_section_inconnue_404(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    appels = _faux_refaire(monkeypatch)
    assert client.post(f"/api/projects/{PID}/memoire/sections/partie_b/zzz/refaire").status_code == 404
    assert client.post(f"/api/projects/{PID}/memoire/sections/partie_z/dechets/refaire").status_code == 404
    assert appels == []


def test_un_seul_refaire_a_la_fois(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    libre = threading.Event()
    _faux_refaire(monkeypatch, attente=libre)
    assert client.post(CHEMIN + "/refaire").status_code == 200
    second = client.post(f"/api/projects/{PID}/memoire/sections/partie_b/securite/refaire")
    libre.set()
    assert second.status_code == 409
    _joindre()
    # et la génération complète est aussi refusée pendant un Refaire
    assert _contenu(db_session)["partie_b"]["securite"] == CONTENU["partie_b"]["securite"]


def test_refaire_refuse_pendant_une_generation(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    db_session.get(Project, PID).processing_status = "generating"
    db_session.commit()
    appels = _faux_refaire(monkeypatch)
    assert client.post(CHEMIN + "/refaire").status_code == 409
    assert appels == []


def test_refaire_refuse_sur_un_projet_cloture(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id, statut="gagné")
    assert client.post(CHEMIN + "/refaire").status_code == 409


def test_echec_du_modele_laisse_le_memoire_intact(client, db_session, test_org, monkeypatch):
    _projet(db_session, test_org.id)
    _faux_refaire(monkeypatch, erreur=RuntimeError("claude down"))
    assert client.post(CHEMIN + "/refaire").status_code == 200
    _joindre()
    assert json.dumps(_contenu(db_session), sort_keys=True) == json.dumps(CONTENU, sort_keys=True)
    db_session.expire_all()
    p = db_session.get(Project, PID)
    assert p.processing_status == "ready"          # le mémoire reste utilisable
    from services import pipeline_tracker
    etat = pipeline_tracker._store[PID]
    assert etat.status == "error" and "refaite" in etat.error_message and "tel quel" in etat.error_message


def test_refaire_ne_cree_pas_de_notification_ni_de_version(client, db_session, test_org, monkeypatch):
    from models.notification import Notification
    _projet(db_session, test_org.id)
    _faux_refaire(monkeypatch)
    client.post(CHEMIN + "/refaire")
    _joindre()
    db_session.expire_all()
    assert db_session.query(MemoireTechnique).first().version == 3
    assert db_session.query(Notification).count() == 0


# ── L'estimation du coût, avant de cliquer ───────────────────────────────────

def test_estimation_deterministe_depuis_les_jetons_reels(client, db_session, test_org):
    _projet(db_session, test_org.id)
    r = client.get(CHEMIN + "/refaire/estimation")
    assert r.status_code == 200, r.text
    e = r.json()
    # préfixe réel de la dernière génération : le plus grand préfixe des parties (200 + 80 000), écriture du cache à 125 % de l'entrée (2 $/M)
    assert e["jetons_prefixe"] == 80200
    assert e["base"] == "reel"
    assert e["modele"] == _MEMOIRE_SEGMENT_MODELS["partie_b"]
    attendu_usd = (80200 * 2.0 * 1.25 + e["jetons_sortie"] * 10.0) / 1_000_000
    assert e["cout_usd"] == pytest.approx(attendu_usd, rel=0.02)
    assert 0 < e["cout_eur"] < 1
    # même appel, même résultat
    assert client.get(CHEMIN + "/refaire/estimation").json() == e


def test_estimation_sans_jetons_enregistres_prend_la_valeur_typique(client, db_session, test_org):
    _projet(db_session, test_org.id)
    m = db_session.query(MemoireTechnique).first()
    m.content_json = {k: v for k, v in CONTENU.items() if k != "_generation_meta"}
    db_session.commit()
    e = client.get(CHEMIN + "/refaire/estimation").json()
    assert e["base"] == "typique" and e["jetons_prefixe"] > 0 and e["cout_eur"] > 0


def test_les_tarifs_sont_ranges_a_un_seul_endroit():
    import importlib.util
    import pathlib
    from services import couts_ia
    chemin = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "couts_journal.py"
    spec = importlib.util.spec_from_file_location("couts_journal", chemin)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert {"claude-sonnet-5-5", "claude-sonnet-4-6"} <= set(couts_ia.TARIFS)
    for modele, (entree, sortie) in mod.TARIFS.items():
        if modele in couts_ia.TARIFS:
            assert couts_ia.TARIFS[modele][:2] == (entree, sortie), modele


# ── Plafond de dépense : « Refaire » est un appel payant sans décompte d'unité ──

def test_refaire_plafonne_par_organisation_sur_24_heures(client, db_session, test_org, monkeypatch):
    """Revue de sécurité du 2/11 : sans plafond, 3 par minute suffisaient à enchaîner des appels payants."""
    from datetime import datetime, timedelta
    from models.audit_log import AuditLog
    import routers.memoire as memoire_mod
    _projet(db_session, test_org.id)
    appels = _faux_refaire(monkeypatch)
    for i in range(memoire_mod.REFAIRE_MAX_PAR_JOUR):
        db_session.add(AuditLog(organization_id=test_org.id, action="memoire.refaire_section",
                                target_type="project", target_id=f"autre-{i}",
                                created_at=datetime.utcnow() - timedelta(hours=1)))
    # une demande de plus de 24 heures ne compte plus
    db_session.add(AuditLog(organization_id=test_org.id, action="memoire.refaire_section",
                            target_type="project", target_id="vieux", created_at=datetime.utcnow() - timedelta(hours=25)))
    db_session.commit()
    r = client.post(CHEMIN + "/refaire")
    assert r.status_code == 429
    assert "demain" in r.json()["detail"] and "!" not in r.json()["detail"]
    assert appels == []
    db_session.expire_all()
    assert db_session.get(Project, PID).processing_status == "ready"


def test_la_demande_compte_des_le_depart(client, db_session, test_org, monkeypatch):
    """La ligne est écrite au départ, pas à la fin : des Refaire lancés en parallèle sur plusieurs projets
    sont tous comptés."""
    from models.audit_log import AuditLog
    _projet(db_session, test_org.id)
    libre = threading.Event()
    _faux_refaire(monkeypatch, attente=libre)
    assert client.post(CHEMIN + "/refaire").status_code == 200
    db_session.expire_all()
    n = db_session.query(AuditLog).filter(AuditLog.organization_id == test_org.id,
                                          AuditLog.action == "memoire.refaire_section").count()
    libre.set()
    _joindre()
    assert n == 1
    db_session.expire_all()
    assert db_session.query(AuditLog).filter(AuditLog.organization_id == test_org.id,
                                             AuditLog.action == "memoire.refaire_section").count() == 1
