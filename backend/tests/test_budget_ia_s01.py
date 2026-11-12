"""S-01, filet général — un budget d'IA en euros par organisation et par jour, calculé sur `couts_ia`.

1. Point commun : chaque route qui lance un appel au modèle porte la dépendance `exiger_budget_ia` (liste fermée,
   comparée aux routes réelles de l'application) ; au-delà du budget, chacune répond 429 avant tout travail.
2. Les lectures des dépôts et le filet des lots sont reportés (`depot_budget.raison_de_report`), pas refusés.
3. Le filet n'est pas aveugle : l'analyse et le mémoire inscrivent leurs jetons dans `couts_ia`, au même coût que
   `scripts/couts_journal.py` sur les mêmes comptes de jetons (inventés).
Aucun appel réel."""
import importlib.util
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from main import app
from models.depot_entreprise import CoutIA
from services import budget_ia, couts_ia, jetons

MSG = "Plafond du jour atteint. Il se remet à zéro demain."

# Toutes les routes de l'API qui déclenchent un appel payant (modèle Anthropic ou Voyage). Preuve de complétude :
# `grep -rn "MemoireImporter\|structure_profile_text\|rewrite_passage\|MemoireGenerator\|DCEAnalyzer\|pe.MODELE\|
# retrieve(" backend/routers` (rapport CORRECTIFS-SECURITE). Les dépôts de Mon entreprise et le filet des lots passent
# par `depot_budget.raison_de_report` (test plus bas).
ROUTES_IA = {
    ("POST", "/api/projects/{project_id}/analyze"),
    ("POST", "/api/projects/{project_id}/memoire/generate"),
    ("POST", "/api/projects/{project_id}/memoire/sections/{part}/{cle}/refaire"),
    ("POST", "/api/projects/{project_id}/memoire/rewrite-passage"),
    ("POST", "/api/projects/{project_id}/points-a-eclaircir"),
    ("POST", "/api/memoire-config/structure-text"),
    ("POST", "/api/memoire-config/import"),
    ("GET", "/api/rag/retrieve"),
    # Fonctions C1 à C4, éteintes par défaut (services/fonctions_ia.py) : allumées, elles portent le même filet.
    ("POST", "/api/projects/{project_id}/memoire/proposer-paragraphe"),
    ("POST", "/api/projects/{project_id}/memoire/reecrire-trois"),
    ("POST", "/api/projects/{project_id}/plan-memoire/proposer-voulu"),
    ("POST", "/api/entreprise/style"),
}


def _routes():
    # FastAPI ≥ 0.137 : `app.routes` est un arbre ; liste aplatie des routes.
    from fastapi.routing import iter_route_contexts
    return [c for c in iter_route_contexts(app.routes) if c.methods]


def _routes_gardees() -> set:
    gardees = set()
    for c in _routes():
        dependant = getattr(c, "dependant", None) or getattr(c.route, "dependant", None)
        if dependant and any(d.call is budget_ia.exiger_budget_ia for d in dependant.dependencies):
            gardees |= {(m, c.path) for m in c.methods - {"HEAD"}}
    return gardees


def test_chaque_route_d_ia_porte_le_filet():
    presentes = {(m, c.path) for c in _routes() for m in c.methods}
    attendues = {r for r in ROUTES_IA if r in presentes}   # une route retirée (S-07) n'a plus besoin du filet
    assert len(attendues) >= 7 and _routes_gardees() == attendues


@pytest.fixture
def budget_depense(db_session, test_org):
    db_session.add(CoutIA(organization_id=test_org.id, usage="analyse", modele=couts_ia.SONNET_4_6,
                          cout_usd=70.0, cout_eur=60.0, created_at=datetime.utcnow() - timedelta(hours=2)))
    db_session.commit()


@pytest.mark.parametrize("methode,chemin", sorted(ROUTES_IA))
def test_au_dela_du_budget_chaque_route_repond_429(client, budget_depense, methode, chemin, monkeypatch):
    from services.fonctions_ia import INTERRUPTEURS
    for variable in INTERRUPTEURS.values():          # les fonctions éteintes répondent 404 avant le filet
        monkeypatch.setenv(variable, "1")
    url = chemin.replace("{project_id}", "p-x").replace("{part}", "partie").replace("{cle}", "cle")
    r = client.request(methode, url, params={"q": "x"} if methode == "GET" else None)
    if r.status_code == 404 and methode == "GET":
        pytest.skip("route retirée du routeur public (S-07)")
    assert r.status_code == 429 and r.json()["detail"] == MSG


def test_sous_le_budget_rien_ne_change(client, db_session, test_org, monkeypatch):
    import services.ai.profile_structurer as ps
    monkeypatch.setattr(ps, "_call_haiku", lambda t: ({"materiel": "x"}, {"input_tokens": 10, "output_tokens": 10}))
    db_session.add(CoutIA(organization_id=test_org.id, usage="analyse", modele=couts_ia.SONNET_4_6,
                          cout_usd=1.0, cout_eur=59.0))
    # Une dépense d'avant-hier et celle d'une autre organisation ne comptent pas.
    db_session.add(CoutIA(organization_id=test_org.id, usage="analyse", modele=couts_ia.SONNET_4_6,
                          cout_usd=1.0, cout_eur=500.0, created_at=datetime.utcnow() - timedelta(hours=25)))
    db_session.add(CoutIA(organization_id="autre-org", usage="analyse", modele=couts_ia.SONNET_4_6,
                          cout_usd=1.0, cout_eur=500.0))
    db_session.commit()
    assert client.post("/api/memoire-config/structure-text", json={"text": "Trois camions benne. " * 10}).status_code == 200


def test_budget_reglable_et_zero_coupe_le_filet(client, budget_depense, monkeypatch):
    import services.ai.profile_structurer as ps
    monkeypatch.setattr(ps, "_call_haiku", lambda t: ({"materiel": "x"}, {"input_tokens": 10, "output_tokens": 10}))
    monkeypatch.setenv("BUDGET_IA_JOUR_EUR", "0")
    assert client.post("/api/memoire-config/structure-text", json={"text": "Trois camions benne. " * 10}).status_code == 200
    monkeypatch.setenv("BUDGET_IA_JOUR_EUR", "100")
    assert client.post("/api/memoire-config/structure-text", json={"text": "Trois camions benne. " * 10}).status_code == 200


def test_depots_et_filet_des_lots_reportes(db_session, test_org, budget_depense):
    from services import depot_budget
    assert depot_budget.raison_de_report(db_session, test_org.id, avec_file=False) == "jour"
    assert depot_budget.raison_de_report(db_session, "autre-org", avec_file=False) is None


# ── 3. L'analyse et le mémoire inscrivent leur dépense ─────────────────────────────────────────────────────────────

def _cout_du_script(modele: str, usage: dict) -> float:
    racine = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("couts_journal", racine / "scripts" / "couts_journal.py")
    cj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cj)
    ligne = jetons.ligne_jetons("essai", modele, usage)
    t = cj.additionner([ligne])[modele]
    return cj.cout_usd(modele, t["e"], t["cl"], t["ce"], t["s"])


USAGE_INVENTE = {"input_tokens": 12_345, "output_tokens": 6_789, "cache_read_input_tokens": 50_000,
                 "cache_creation_input_tokens": 23_456}


def test_la_collecte_suit_les_fils_du_pool():
    from concurrent.futures import ThreadPoolExecutor
    with jetons.collecter() as collecte:
        with ThreadPoolExecutor(max_workers=3) as pool:
            for f in [pool.submit(jetons.transmettre(jetons.ligne_jetons), f"t{i}", couts_ia.SONNET_4_6, USAGE_INVENTE)
                      for i in range(5)]:
                f.result()
    assert len(collecte) == 5
    jetons.ligne_jetons("hors_collecte", couts_ia.SONNET_4_6, USAGE_INVENTE)
    assert len(collecte) == 5


def test_les_tranches_de_l_analyse_sont_collectees(monkeypatch):
    from services.ai import dce_analyzer

    def faux_appel(self, texte, system, etiquette, skills, project_id, progress_cb=None, suffixe=""):
        jetons.ligne_jetons(etiquette, "claude-sonnet-4-6", USAGE_INVENTE)
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_sync_call", faux_appel)
    monkeypatch.setattr(dce_analyzer, "_build_call_texts", lambda t: ["a", "b", "c", "d"])
    analyseur = dce_analyzer.DCEAnalyzer.__new__(dce_analyzer.DCEAnalyzer)
    with jetons.collecter() as collecte:
        analyseur._run_pass_chunked("texte", "système", "passe2-lot1", [], None, "", "")
    assert len(collecte) == 4


def _attendre(prefixe: str):
    for t in threading.enumerate():
        if t.name.startswith(prefixe):
            t.join(timeout=30)


def test_une_analyse_inscrit_son_cout_comme_le_script(client, db_session, test_org, monkeypatch):
    from models.organization import Organization
    from models.project import Project, ProjectDocument
    from services.ai import checklist_matcher, dce_analyzer

    def faux_passe(self, pass_text, system_prompt, label, *a, **kw):
        jetons.ligne_jetons(label, "claude-sonnet-4-6", USAGE_INVENTE)
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

    async def _rien(self, *a, **kw):
        return []
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", faux_passe)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)
    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.add(Project(id="p-cout", organization_id=test_org.id, name="X", deadline=date.today(),
                           lots_detectes=[{"id": "lot1", "nom": "Lot 01"}, {"id": "lot2", "nom": "Lot 02"}]))
    db_session.add(ProjectDocument(project_id="p-cout", type="rc", file_url="x", file_name="rc.pdf",
                                   extracted_text="Règlement inventé pour le test. " * 40))
    for n in ("1", "2"):
        db_session.add(ProjectDocument(project_id="p-cout", type="cctp", file_url="x", file_name=f"cctp lot 0{n}.pdf",
                                       extracted_text=f"CCTP inventé du lot {n}. " * 40, related_lots=[n]))
    db_session.commit()
    r = client.post("/api/projects/p-cout/analyze", json={"lots": ["lot1", "lot2"]})
    assert r.status_code in (200, 202), r.text
    _attendre("synorix-analysis-")
    db_session.expire_all()
    ligne = db_session.query(CoutIA).filter(CoutIA.usage == "analyse").one()   # une ligne par modèle
    assert ligne.organization_id == test_org.id and ligne.reference == "p-cout"
    assert ligne.jetons_entree == 3 * USAGE_INVENTE["input_tokens"]           # passe 1 + deux lots, dont le pool
    assert ligne.cout_usd == pytest.approx(3 * _cout_du_script("claude-sonnet-4-6", USAGE_INVENTE), abs=1e-6)


def test_un_memoire_inscrit_son_cout_meme_en_echec(db_session, test_org, monkeypatch):
    from routers import memoire as mm

    def faux_corps(project_id, org_id, *a):
        jetons.ligne_jetons("memoire_partie1", couts_ia.SONNET_5_5, USAGE_INVENTE)
        jetons.ligne_jetons("memoire_partie2", couts_ia.SONNET_5_5, USAGE_INVENTE)
        raise RuntimeError("panne simulée après deux appels payés")
    monkeypatch.setattr(mm, "_run_memoire_job_corps", faux_corps)
    with pytest.raises(RuntimeError):
        mm._run_memoire_job("p-m", test_org.id, "u", {}, None, None)
    ligne = db_session.query(CoutIA).filter(CoutIA.usage == "memoire").one()
    assert ligne.reference == "p-m" and ligne.jetons_sortie == 2 * USAGE_INVENTE["output_tokens"]
    assert ligne.cout_usd == pytest.approx(2 * _cout_du_script(couts_ia.SONNET_5_5, USAGE_INVENTE), abs=1e-6)


# ── 4. Réservation au lancement (revue du coordinateur) : les travaux en cours comptent ────────────────────────────

def _projet(db, org_id, pid):
    from models.project import Project, ProjectDocument
    db.add(Project(id=pid, organization_id=org_id, name="X", deadline=date.today(), selected_lot="lot1",
                   selected_lot_name="Lot 1", current_step=5, lots_detectes=[{"id": "lot1", "nom": "Lot 01"}]))
    db.add(ProjectDocument(project_id=pid, type="rc", file_url="x", file_name="rc.pdf",
                           extracted_text="Règlement inventé pour le test. " * 40))
    db.add(ProjectDocument(project_id=pid, type="cctp", file_url="x", file_name="cctp lot 01.pdf",
                           extracted_text="CCTP inventé du lot 1. " * 40, related_lots=["1"]))


@pytest.fixture
def pres_du_plafond(db_session, test_org, monkeypatch):
    """55 € déjà dépensés sur 60 ; forfaits par défaut (analyse 3 €, mémoire 1,5 €)."""
    from models.organization import Organization
    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.add(CoutIA(organization_id=test_org.id, usage="import_memoire", modele=couts_ia.SONNET_4_6,
                          cout_usd=60.0, cout_eur=55.0))
    db_session.commit()


def _reservations(db, org_id):
    db.expire_all()
    return db.query(CoutIA).filter(CoutIA.organization_id == org_id, CoutIA.usage == "reservation").all()


def test_analyses_d_affilee_la_troisieme_est_refusee_avant_tout_appel(client, db_session, test_org, pres_du_plafond,
                                                                     monkeypatch):
    from services.ai import checklist_matcher, dce_analyzer
    feu = threading.Event()
    appels = []

    def passe_bloquee(self, pass_text, system_prompt, label, project_id=None, *a, **kw):
        appels.append(project_id)
        feu.wait(20)
        jetons.ligne_jetons(label, "claude-sonnet-4-6", {"input_tokens": 1000, "output_tokens": 100})
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

    async def _rien(self, *a, **kw):
        return []
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", passe_bloquee)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _rien)
    for pid in ("p-a1", "p-a2", "p-a3"):
        _projet(db_session, test_org.id, pid)
    db_session.commit()
    try:
        codes = [client.post(f"/api/projects/{pid}/analyze", json={"lots": ["lot1"]}).status_code
                 for pid in ("p-a1", "p-a2", "p-a3")]
        # 55 → 58 → 61 : la deuxième passe (58 < 60), la troisième voit les deux travaux en cours.
        assert codes[:2] == [202, 202] or codes[:2] == [200, 200], codes
        assert codes[2] == 429
        assert len(_reservations(db_session, test_org.id)) == 2
        assert "p-a3" not in appels
    finally:
        feu.set()
        _attendre("synorix-analysis-")
    # Réglées au montant réel : plus aucune réservation, la dépense réelle est inscrite.
    assert _reservations(db_session, test_org.id) == []
    assert db_session.query(CoutIA).filter(CoutIA.usage == "analyse").count() == 2


def test_memoires_d_affilee_le_cinquieme_est_refuse(client, db_session, test_org, pres_du_plafond, monkeypatch):
    import routers.memoire as mm
    feu = threading.Event()
    lances = []

    def corps_bloque(project_id, org_id, *a):
        lances.append(project_id)
        feu.wait(20)
    monkeypatch.setattr(mm, "_run_memoire_job_corps", corps_bloque)
    pids = [f"p-m{i}" for i in range(5)]
    for pid in pids:
        _projet(db_session, test_org.id, pid)
    db_session.commit()
    try:
        codes = [client.post(f"/api/projects/{pid}/memoire/generate", json={}).status_code for pid in pids]
        # 55 → 56,5 → 58 → 59,5 → 61 : le cinquième est refusé avant tout appel.
        assert codes == [200, 200, 200, 200, 429], codes
        assert "p-m4" not in lances
    finally:
        feu.set()
        _attendre("synorix-memoire-")
    assert _reservations(db_session, test_org.id) == []      # travail sans dépense : réservation libérée


def test_route_refusee_ou_synchrone_ne_garde_pas_de_reservation(client, db_session, test_org, monkeypatch):
    import services.ai.profile_structurer as ps
    monkeypatch.setattr(ps, "_call_haiku", lambda t: ({"materiel": "x"}, {"input_tokens": 10, "output_tokens": 10}))
    assert client.post("/api/memoire-config/structure-text", json={"text": "Trois camions benne. " * 10}).status_code == 200
    assert client.post("/api/projects/inconnu/analyze", json={"lots": ["lot1"]}).status_code == 404
    assert _reservations(db_session, test_org.id) == []


def test_reservations_en_parallele_sous_verrou(db_session, test_org, monkeypatch):
    """Vingt lancements simultanés à 55 € sur 60 avec un forfait de 1 € : exactement cinq réservations passent."""
    from database import SessionLocal
    from fastapi import HTTPException
    monkeypatch.setenv("BUDGET_IA_FORFAIT_APPEL_EUR", "1")
    db_session.add(CoutIA(organization_id=test_org.id, usage="analyse", modele=couts_ia.SONNET_4_6,
                          cout_usd=60.0, cout_eur=55.0))
    db_session.commit()
    org_id = test_org.id
    resultats = []
    depart = threading.Barrier(20)

    def lancer(i):
        s = SessionLocal()
        try:
            depart.wait(10)
            budget_ia.reserver(s, org_id, "appel", f"appel:{i}")
            resultats.append("ok")
        except HTTPException as e:
            resultats.append(e.status_code)
        finally:
            s.close()
    fils = [threading.Thread(target=lancer, args=(i,)) for i in range(20)]
    for f in fils:
        f.start()
    for f in fils:
        f.join(30)
    assert resultats.count("ok") == 5 and resultats.count(429) == 15


def test_une_reservation_orpheline_expire(db_session, test_org):
    db_session.add(CoutIA(organization_id=test_org.id, usage="reservation", modele="analyse", cout_usd=0.0,
                          cout_eur=100.0, reference="analyse:p-tue:x",
                          created_at=datetime.utcnow() - timedelta(minutes=121)))
    db_session.commit()
    assert not budget_ia.depasse(db_session, test_org.id)
    db_session.add(CoutIA(organization_id=test_org.id, usage="reservation", modele="analyse", cout_usd=0.0,
                          cout_eur=100.0, reference="analyse:p-vif:x",
                          created_at=datetime.utcnow() - timedelta(minutes=30)))
    db_session.commit()
    assert budget_ia.depasse(db_session, test_org.id)


def test_deux_travaux_sur_le_meme_projet_chacun_sa_reservation(db_session, test_org, monkeypatch):
    """Revue du coordinateur : le premier travail qui finit ne libère que SA réservation (référence exacte)."""
    from routers import memoire as mm
    org_id = test_org.id
    db_session.add(CoutIA(organization_id=org_id, usage="analyse", modele=couts_ia.SONNET_4_6,
                          cout_usd=60.0, cout_eur=56.0))
    db_session.commit()
    budget_ia.reserver(db_session, org_id, "memoire", "memoire:p-meme:aaa")     # 57,5
    budget_ia.reserver(db_session, org_id, "memoire", "memoire:p-meme:bbb")     # 59 (relance sur le même projet)
    monkeypatch.setattr(mm, "_run_memoire_job_corps", lambda *a, **k: None)
    mm._run_memoire_job("p-meme", org_id, "u", {}, None, None, reservation="memoire:p-meme:aaa")
    assert [r.reference for r in _reservations(db_session, org_id)] == ["memoire:p-meme:bbb"]   # 57,5
    from fastapi import HTTPException
    budget_ia.reserver(db_session, org_id, "analyse", "analyse:p-meme:ccc")     # 57,5 < 60 : passe → 60,5
    with pytest.raises(HTTPException) as e:
        budget_ia.reserver(db_session, org_id, "analyse", "analyse:p-meme:ddd")  # le second travail compte encore
    assert e.value.status_code == 429


def test_le_fil_recoit_la_reference_exacte_de_sa_requete(client, db_session, test_org, pres_du_plafond, monkeypatch):
    import routers.memoire as mm
    recues = []
    monkeypatch.setattr(mm, "_run_memoire_job_corps", lambda *a, **k: None)
    vrai = mm._run_memoire_job

    def espion(*a, **k):
        recues.append(k.get("reservation"))
        return vrai(*a, **k)
    monkeypatch.setattr(mm, "_run_memoire_job", espion)
    _projet(db_session, test_org.id, "p-ref")
    db_session.commit()
    assert client.post("/api/projects/p-ref/memoire/generate", json={}).status_code == 200
    _attendre("synorix-memoire-")
    assert len(recues) == 1 and recues[0].startswith("memoire:p-ref:") and len(recues[0]) > len("memoire:p-ref:")
    assert _reservations(db_session, test_org.id) == []
