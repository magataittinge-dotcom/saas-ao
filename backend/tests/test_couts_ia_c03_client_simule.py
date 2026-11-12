"""C-03 (audit données, solidité, coûts) — l'analyse inscrit sa dépense réelle dans `couts_ia`, prouvé au niveau du
client du SDK (simulé) et non plus seulement en remplaçant `_run_pass_chunked`.

Une analyse de deux lots, chaque passe en trois tranches (neuf appels au client simulé) :
1. les appels au client sont identiques, un à un, avec et sans l'inscription de la dépense (aucun prompt, modèle,
   paramètre ni appel changé) ;
2. `couts_ia` reçoit la somme des neuf usages, au coût de `couts_ia.calculer`, et la réservation du forfait est réglée ;
3. budget du jour : sans inscription (état de l'audit), la dépense d'une analyse disparaît du budget quand la
   réservation expire (120 min) ; avec, la dépense réelle compte 24 h.
Aucun appel réel."""
import json
import threading
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from models.depot_entreprise import CoutIA
from services import budget_ia, couts_ia

USAGE = {"input_tokens": 1_000, "output_tokens": 2_000, "cache_read_input_tokens": 30_000,
         "cache_creation_input_tokens": 4_000}
REPONSE = json.dumps({"requirements": [], "criteres_jugement": [], "infos_marche": {}})


class _Flux:
    def __init__(self):
        self.text_stream = iter([REPONSE])

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return SimpleNamespace(stop_reason="end_turn", usage=SimpleNamespace(**USAGE))


class FauxClient:
    """Le client du SDK : enregistre chaque appel (tous ses paramètres) et rend un flux et un usage fixes."""

    def __init__(self):
        self.appels: list[str] = []
        self._garde = threading.Lock()
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **params):
        with self._garde:
            self.appels.append(json.dumps(params, sort_keys=True, ensure_ascii=False, default=str))
        return _Flux()


def _projet(db, org_id, pid):
    from models.project import Project, ProjectDocument
    db.add(Project(id=pid, organization_id=org_id, name="X", deadline=date.today(),
                   lots_detectes=[{"id": "lot1", "nom": "Lot 01"}, {"id": "lot2", "nom": "Lot 02"}]))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement inventé pour le test. " * 40))
    for n in ("1", "2"):
        db.add(ProjectDocument(project_id=pid, type="cctp", file_url="x", file_name=f"cctp lot 0{n}.pdf",
                               extracted_text=f"CCTP inventé du lot {n}. " * 40, related_lots=[n]))
    db.commit()


def _attendre():
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=60)


def _vieillir(db, org_id, minutes):
    for ligne in db.query(CoutIA).filter(CoutIA.organization_id == org_id).all():
        ligne.created_at = ligne.created_at - timedelta(minutes=minutes)
    db.commit()


@pytest.fixture
def client_simule(db_session, test_org, monkeypatch):
    from models.organization import Organization
    from services.ai import checklist_matcher, dce_analyzer

    faux = FauxClient()
    monkeypatch.setattr(dce_analyzer.anthropic, "Anthropic", lambda **kw: faux)
    monkeypatch.setattr(dce_analyzer.settings, "SYNORIX_ANALYSE_DEMO", False, raising=False)
    # Trois tranches par passe : neuf appels (passe 1, puis deux lots en parallèle, chacun en trois tranches).
    monkeypatch.setattr(dce_analyzer, "_build_call_texts", lambda t: [t + " [1]", t + " [2]", t + " [3]"])

    async def _rien(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)
    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.commit()
    return faux


def test_analyse_au_client_simule_memes_appels_et_cout_inscrit(client, db_session, test_org, client_simule,
                                                                monkeypatch):
    from routers import analysis

    org = test_org.id
    # ── Avant : le travail SANS l'inscription de la dépense (l'état décrit par l'audit). ──
    enveloppe = analysis._run_analysis_job

    def sans_inscription(*args, **kwargs):
        kwargs.pop("reservation", None)
        return analysis._run_analysis_job_corps(*args, **kwargs)
    monkeypatch.setattr(analysis, "_run_analysis_job", sans_inscription)
    _projet(db_session, org, "p-avant")
    r = client.post("/api/projects/p-avant/analyze", json={"lots": ["lot1", "lot2"]})
    assert r.status_code in (200, 202), r.text
    _attendre()
    appels_avant = sorted(client_simule.appels)
    assert len(appels_avant) == 9

    db_session.expire_all()
    assert db_session.query(CoutIA).filter(CoutIA.usage == "analyse").count() == 0
    forfait = budget_ia.forfait("analyse")
    assert budget_ia.depense_24h(db_session, org) == pytest.approx(forfait)          # la réservation seule
    _vieillir(db_session, org, 121)
    budget_avant_apres_2h = budget_ia.depense_24h(db_session, org)
    assert budget_avant_apres_2h == 0.0          # au-delà de 120 min, le budget ne voit plus rien de l'analyse
    db_session.query(CoutIA).filter(CoutIA.organization_id == org).delete()
    db_session.commit()

    # ── Après : le travail tel qu'il part de la route (enveloppe S-01). ──
    monkeypatch.setattr(analysis, "_run_analysis_job", enveloppe)
    client_simule.appels.clear()
    _projet(db_session, org, "p-apres")
    r = client.post("/api/projects/p-apres/analyze", json={"lots": ["lot1", "lot2"]})
    assert r.status_code in (200, 202), r.text
    _attendre()
    appels_apres = sorted(client_simule.appels)

    # 1. Mêmes appels au client, un à un (modèle, max_tokens, temperature, system, messages).
    assert appels_apres == appels_avant

    # 2. La dépense réelle est inscrite, la réservation réglée.
    db_session.expire_all()
    lignes = db_session.query(CoutIA).filter(CoutIA.organization_id == org).all()
    assert [lg.usage for lg in lignes] == ["analyse"], [lg.usage for lg in lignes]
    ligne = lignes[0]
    assert ligne.reference == "p-apres" and ligne.modele == couts_ia.SONNET_4_6
    assert (ligne.jetons_entree, ligne.jetons_sortie, ligne.jetons_cache_lecture, ligne.jetons_cache_ecriture) == (
        9 * USAGE["input_tokens"], 9 * USAGE["output_tokens"], 9 * USAGE["cache_read_input_tokens"],
        9 * USAGE["cache_creation_input_tokens"])
    usd_un, eur_un = couts_ia.calculer(couts_ia.SONNET_4_6, USAGE)
    assert ligne.cout_usd == pytest.approx(9 * usd_un, abs=1e-5)
    assert ligne.cout_eur == pytest.approx(9 * eur_un, abs=1e-5)

    # 3. Budget du jour : la dépense réelle compte, et compte encore après 120 min.
    assert budget_ia.depense_24h(db_session, org) == pytest.approx(9 * eur_un, abs=1e-5)
    _vieillir(db_session, org, 121)
    assert budget_ia.depense_24h(db_session, org) == pytest.approx(9 * eur_un, abs=1e-5)
    _vieillir(db_session, org, 24 * 60)
    assert budget_ia.depense_24h(db_session, org) == 0.0


def test_analyse_en_echec_apres_des_appels_payes_inscrit_ce_qui_a_ete_paye(client, db_session, test_org,
                                                                             client_simule):
    """Le client répond aux trois tranches de la passe 1, puis tombe (panne inattendue) : l'analyse échoue, les trois
    appels payés sont inscrits et la réservation est réglée."""
    org = test_org.id
    reel = client_simule._stream

    def puis_panne(**params):
        if len(client_simule.appels) >= 3:
            raise RuntimeError("panne simulée après trois appels payés")
        return reel(**params)
    client_simule.messages.stream = puis_panne
    _projet(db_session, org, "p-echec")
    r = client.post("/api/projects/p-echec/analyze", json={"lots": ["lot1", "lot2"]})
    assert r.status_code in (200, 202), r.text
    _attendre()
    assert len(client_simule.appels) == 3
    db_session.expire_all()
    from models.project import Project
    assert db_session.get(Project, "p-echec").status not in ("analyzing", "analyzed")
    lignes = db_session.query(CoutIA).filter(CoutIA.organization_id == org).all()
    assert [lg.usage for lg in lignes] == ["analyse"]                   # plus de réservation, la dépense payée
    assert lignes[0].jetons_sortie == 3 * USAGE["output_tokens"]
    usd_un, _ = couts_ia.calculer(couts_ia.SONNET_4_6, USAGE)
    assert lignes[0].cout_usd == pytest.approx(3 * usd_un, abs=1e-5)
