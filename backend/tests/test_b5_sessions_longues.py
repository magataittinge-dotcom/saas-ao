"""B5 — aucune connexion du pool n'est tenue pendant un travail long.

Schéma exigé : lire -> fermer la session -> travail long -> nouvelle session courte
pour écrire. Chaque test remplace le « travail long » (lecture d'une pièce, appel
du générateur de mémoire, passes de l'analyse, ancrage) par une fonction qui relève
`engine.pool.checkedout()` au moment où elle tourne, puis vérifie que le nombre de
connexions tenues n'a pas dépassé celui d'avant le lancement (0 en pratique).

Sur le serveur cible (pool de 15 connexions par processus), un dépôt de N pièces
tenait N connexions pendant toute la lecture : deux dépôts simultanés saturaient le pool.
"""
import asyncio
import threading
from datetime import date

import pytest

from database import SessionLocal, engine
from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument


@pytest.fixture(autouse=True)
def _session_de_test_sans_expiration(db_session):
    # Le commit de la session du test ne doit pas faire recharger `test_user` (donc
    # reprendre une connexion) pendant le travail mesuré.
    db_session.expire_on_commit = False


def _tenues() -> int:
    return engine.pool.checkedout()


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    import routers.memoire as memoire_mod
    import routers.projects as projects_mod
    monkeypatch.setattr(memoire_mod.limiter, "enabled", False, raising=False)
    monkeypatch.setattr(projects_mod.limiter, "enabled", False, raising=False)


# ─── Dépôt : extraction de N pièces ──────────────────────────────────────────

N_PIECES = 6


def _pieces(db, tmp_path, pid):
    db.add(Project(id=pid, organization_id="org-test-1", name="Dépôt",
                   processing_status="extracting_text"))
    infos = []
    for i in range(N_PIECES):
        f = tmp_path / f"piece{i}.docx"
        f.write_bytes(b"x")
        d = ProjectDocument(project_id=pid, type="rc", file_url=f"/uploads/piece{i}.docx",
                            file_name=f"piece{i}.docx", file_size=1)
        db.add(d)
        db.flush()
        infos.append((d.id, d.file_name, d.type, 1, d.file_url))
    db.commit()
    return infos


def test_depot_n_pieces_aucune_connexion_tenue_pendant_la_lecture(
        db_session, test_org, tmp_path, monkeypatch):
    import routers.projects as projects_mod
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    infos = _pieces(db_session, tmp_path, "p-b5-depot")
    db_session.commit()

    base = _tenues()
    toutes_dedans = threading.Barrier(N_PIECES, timeout=20)
    relevees_faites = threading.Barrier(N_PIECES, timeout=20)
    mesures: list[int] = []

    def _lecture_simulee(file_path, filename, doc_id, on_page=None, retenir=False):
        toutes_dedans.wait()          # les N lectures sont en cours en même temps
        mesures.append(_tenues())
        relevees_faites.wait()
        return f"Texte lu de {filename}. " * 5, 1, None
    monkeypatch.setattr(projects_mod, "_extraire_piece", _lecture_simulee)

    projects_mod._extract_all_parallel("p-b5-depot", infos)

    assert len(mesures) == N_PIECES
    print(f"\n[B5 mesure] depot de {N_PIECES} pieces : connexions tenues pendant la lecture = {max(mesures)}")
    assert max(mesures) <= base, mesures

    # Comportement identique : textes enregistrés, projet prêt.
    s = SessionLocal()
    try:
        docs = s.query(ProjectDocument).filter_by(project_id="p-b5-depot").all()
        assert all(d.extracted_text and d.extracted_text.startswith("Texte lu") for d in docs)
        assert s.get(Project, "p-b5-depot").processing_status == "ready"
    finally:
        s.close()


def test_lecture_en_echec_n_enregistre_pas_un_texte_vide_en_silence(
        db_session, test_org, tmp_path, monkeypatch):
    """Une pièce dont la lecture lève : le projet avance (pas de blocage) mais la pièce
    porte un avertissement visible, jamais un texte vide sans explication."""
    import routers.projects as projects_mod
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    infos = _pieces(db_session, tmp_path, "p-b5-echec")
    db_session.commit()

    def _plantage(*a, **kw):
        raise RuntimeError("lecture impossible (test)")
    monkeypatch.setattr(projects_mod, "_extraire_piece", _plantage)

    projects_mod._extract_all_parallel("p-b5-echec", infos)

    s = SessionLocal()
    try:
        docs = s.query(ProjectDocument).filter_by(project_id="p-b5-echec").all()
        assert len(docs) == N_PIECES
        for d in docs:
            assert (d.extracted_text or "") == ""
            assert d.extraction_warning, "texte vide sans avertissement"
        assert s.get(Project, "p-b5-echec").processing_status == "ready"
    finally:
        s.close()


# ─── Mémoire : génération ────────────────────────────────────────────────────

def test_memoire_aucune_connexion_tenue_pendant_la_generation(
        client, db_session, test_org, monkeypatch):
    import routers.memoire as memoire_mod
    from models.organization import Organization
    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.add(Project(id="p-b5-mem", organization_id=test_org.id, name="Mém",
                           selected_lot="lot1", selected_lot_name="Lot 1", current_step=5))
    db_session.add(ProjectDocument(project_id="p-b5-mem", type="rc", file_url="x",
                                   file_name="rc.pdf",
                                   extracted_text="Règlement de consultation. " * 30))
    db_session.commit()
    db_session.commit()

    base = _tenues()
    requete_finie = threading.Event()
    mesures: list[int] = []

    async def _generation_simulee(self, **kwargs):
        await asyncio.to_thread(requete_finie.wait, 20)
        mesures.append(_tenues())
        return {"preambule": "généré", "partie_a": {"x": "ok"}, "partie_b": {}, "partie_c": {}}
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _generation_simulee)

    resp = client.post("/api/projects/p-b5-mem/memoire/generate", json={})
    assert resp.status_code == 200, resp.text
    requete_finie.set()
    for t in threading.enumerate():
        if t.name.startswith("synorix-memoire-"):
            t.join(timeout=30)

    assert mesures, "la génération simulée n'a pas tourné"
    print(f"\n[B5 mesure] memoire : connexions tenues pendant la generation = {mesures[0]}")
    assert mesures[0] <= base

    s = SessionLocal()
    try:
        assert s.get(Project, "p-b5-mem").processing_status == "ready"
    finally:
        s.close()


# ─── Analyse : passes IA et ancrage ──────────────────────────────────────────

def test_analyse_aucune_connexion_tenue_pendant_les_passes(
        client, db_session, test_org, monkeypatch):
    from models.organization import Organization
    from services.ai import checklist_matcher, dce_analyzer, excerpt_anchor
    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.add(Project(id="p-b5-ana", organization_id=test_org.id, name="Ana",
                           deadline=date.today(),
                           lots_detectes=[{"id": "lot1", "nom": "Lot 01 — GO"}]))
    db_session.add(ProjectDocument(project_id="p-b5-ana", type="rc", file_url="x",
                                   file_name="rc.pdf",
                                   extracted_text="Règlement. Candidature obligatoire. " * 40))
    db_session.add(ProjectDocument(project_id="p-b5-ana", type="cctp", file_url="x",
                                   file_name="cctp lot 01.pdf",
                                   extracted_text="CCTP lot 1. Prescriptions GO. " * 40,
                                   related_lots=["1"]))
    db_session.commit()
    db_session.commit()

    base = _tenues()
    requete_finie = threading.Event()
    mesures: dict[str, list[int]] = {"passe": [], "ancrage": []}

    def _passe_simulee(self, pass_text, system_prompt, label, *a, **kw):
        requete_finie.wait(20)
        mesures["passe"].append(_tenues())
        return {"requirements": [
            {"exigence": f"Exigence {label}", "source_document": "RC", "source_page": 1,
             "source_excerpt": "Candidature obligatoire.", "category": "candidature",
             "priority": "obligatoire"}],
            "criteres_jugement": [], "infos_marche": {}}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _passe_simulee)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)

    ancrer = excerpt_anchor.anchor_requirements

    def _ancrage_mesure(*a, **kw):
        mesures["ancrage"].append(_tenues())
        return ancrer(*a, **kw)
    monkeypatch.setattr(excerpt_anchor, "anchor_requirements", _ancrage_mesure)

    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)

    resp = client.post("/api/projects/p-b5-ana/analyze", json={"lots": ["lot1"]})
    assert resp.status_code == 200, resp.text
    requete_finie.set()
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)

    assert len(mesures["passe"]) >= 2 and mesures["ancrage"], mesures
    print(f"\n[B5 mesure] analyse : connexions tenues pendant les passes = {max(mesures['passe'])}, "
          f"pendant l'ancrage = {max(mesures['ancrage'])}")
    assert max(mesures["passe"]) <= base, mesures
    assert max(mesures["ancrage"]) <= base, mesures

    s = SessionLocal()
    try:
        assert s.query(ComplianceItem).filter_by(project_id="p-b5-ana").count() >= 2
        assert s.get(Project, "p-b5-ana").processing_status != "error"
    finally:
        s.close()


# ─── Dépôt : réception du corps et extraction du ZIP ─────────────────────────

def _projet_vide(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="Réception"))
    db.commit()


def test_depot_fichier_aucune_connexion_tenue_pendant_la_reception(
        client, db_session, test_org, monkeypatch):
    from services import upload_validation
    from tests.pdf_fabrique import pdf_texte
    _projet_vide(db_session, test_org.id, "p-b5-recu")
    base = _tenues()
    mesures: list[int] = []
    controle = upload_validation.sniff_matches_extension

    def _controle_mesure(*a, **kw):          # appelé après la lecture complète du corps
        mesures.append(_tenues())
        return controle(*a, **kw)
    monkeypatch.setattr(upload_validation, "sniff_matches_extension", _controle_mesure)

    resp = client.post(
        "/api/projects/p-b5-recu/documents",
        files={"file": ("rc.pdf", pdf_texte(["Règlement de consultation. " * 5]), "application/pdf")},
        data={"type": "rc"})
    assert resp.status_code == 200, resp.text
    assert mesures
    print(f"\n[B5 mesure] reception du corps : connexions tenues = {mesures[0]}")
    assert mesures[0] <= base


def test_depot_zip_aucune_connexion_tenue_pendant_l_extraction(
        client, db_session, test_org, monkeypatch):
    import io
    import zipfile

    import routers.projects as projects_mod
    from tests.pdf_fabrique import pdf_texte
    _projet_vide(db_session, test_org.id, "p-b5-zip")
    base = _tenues()
    mesures: list[int] = []
    extraire = projects_mod._extract_zip_members

    def _extraction_mesuree(*a, **kw):       # tourne dans asyncio.to_thread (6-20 s en vrai)
        mesures.append(_tenues())
        return extraire(*a, **kw)
    monkeypatch.setattr(projects_mod, "_extract_zip_members", _extraction_mesuree)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("RC.pdf", pdf_texte(["Règlement de consultation. " * 5]))
    resp = client.post(
        "/api/projects/p-b5-zip/documents",
        files={"file": ("dce.zip", buf.getvalue(), "application/zip")})
    assert resp.status_code == 200, resp.text
    assert mesures
    print(f"\n[B5 mesure] extraction du ZIP : connexions tenues = {mesures[0]}")
    assert mesures[0] <= base
