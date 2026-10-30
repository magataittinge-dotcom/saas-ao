"""Chronométrage des étapes (bloc 12) : une ligne `chrono` par étape, au format stable, sans donnée personnelle.

    chrono etape=<étape> projet=<id> lot=<id> duree_ms=<entier> statut=<ok|erreur|interrompu>

Contenu inventé ; aucun appel payant (l'IA est remplacée).
"""
import asyncio
import io
import logging
import re
import threading
import zipfile

import pytest

from models.memoire import MemoireTechnique
from models.project import Project, ProjectDocument
from services import chrono as chrono_mod

LIGNE = re.compile(
    r"^chrono etape=(?P<etape>[a-z_]+) projet=(?P<projet>[A-Za-z0-9_.+-]+) lot=(?P<lot>[A-Za-z0-9_.+-]+) "
    r"duree_ms=(?P<duree>\d+) statut=(?P<statut>ok|erreur|interrompu)$"
)


@pytest.fixture(autouse=True)
def _sans_limite(monkeypatch):
    for nom in ("routers.projects", "routers.memoire", "routers.export", "routers.analysis"):
        mod = __import__(nom, fromlist=["limiter"])
        monkeypatch.setattr(mod.limiter, "enabled", False, raising=False)


@pytest.fixture
def journal(caplog):
    caplog.set_level(logging.INFO, logger="synorix.chrono")
    return caplog


def _lignes(caplog, etape: str | None = None, projet: str | None = None) -> list[dict]:
    trouvees = []
    for r in caplog.records:
        if r.name != "synorix.chrono":
            continue
        m = LIGNE.match(r.getMessage())
        assert m, f"format inattendu : {r.getMessage()!r}"
        if (etape is None or m["etape"] == etape) and (projet is None or m["projet"] == projet):
            trouvees.append(m.groupdict())
    return trouvees


def _joindre(prefixe: str):
    for t in threading.enumerate():
        if t.name.startswith(prefixe):
            t.join(timeout=30)


# ─── Le module ────────────────────────────────────────────────────────────────

def test_une_ligne_ok_au_format_stable(journal):
    with chrono_mod.chrono("analyse", "proj-1", "lot1"):
        pass
    [l] = _lignes(journal)
    assert (l["etape"], l["projet"], l["lot"], l["statut"]) == ("analyse", "proj-1", "lot1", "ok")


def test_une_exception_donne_statut_erreur_et_se_propage(journal):
    with pytest.raises(ValueError):
        with chrono_mod.chrono("export", "proj-1"):
            raise ValueError("boom")
    [l] = _lignes(journal)
    assert l["statut"] == "erreur" and l["lot"] == "-"


def test_la_duree_est_mesuree_en_ms(journal):
    import time
    with chrono_mod.chrono("lots", "proj-1"):
        time.sleep(0.05)
    assert 40 <= int(_lignes(journal)[0]["duree"]) < 2000


def test_les_identifiants_sont_reduits_et_sans_donnee_libre(journal):
    with chrono_mod.chrono("depot", "projet avec espaces\net retour", ["lot1", "lot 2 — Gros œuvre"]):
        pass
    msg = journal.records[-1].getMessage()
    assert "\n" not in msg and "—" not in msg and "œ" not in msg and " avec " not in msg
    assert LIGNE.match(msg)


def test_un_journal_en_panne_ne_casse_pas_l_etape(monkeypatch):
    def _casse(*a, **k):
        raise OSError("disque plein")
    monkeypatch.setattr(chrono_mod.logger, "info", _casse)
    with chrono_mod.chrono("export", "p"):
        resultat = 42
    assert resultat == 42


def test_decorateur_sync_et_async_gardent_la_signature(journal):
    @chrono_mod.chronometre("export")
    def f(project_id: str, db=None):
        return project_id

    @chrono_mod.chronometre("depot", lot=lambda a: a.get("lot"))
    async def g(project_id: str, lot: str = "lotA"):
        return lot

    import inspect
    assert list(inspect.signature(f).parameters) == ["project_id", "db"]
    assert f("p1") == "p1"
    assert asyncio.run(g("p2")) == "lotA"
    assert [(l["etape"], l["projet"], l["lot"]) for l in _lignes(journal)] == [("export", "p1", "-"), ("depot", "p2", "lotA")]


# ─── Une ligne par étape, dans le code réel ───────────────────────────────────

def _projet(db, org_id, pid, **kw):
    db.add(Project(id=pid, organization_id=org_id, name="AO fictif", selected_lot="lot1",
                   selected_lot_name="Lot 1 — Gros œuvre", **kw))
    db.commit()


def test_depot_et_lecture(client, db_session, test_org, monkeypatch, tmp_path, journal):
    import routers.projects as projects_mod
    import services.file_storage as fs_mod
    from tests.pdf_fabrique import pdf_texte
    monkeypatch.setattr(projects_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    _projet(db_session, test_org.id, "proj-chr1")

    texte = pdf_texte(["Règlement fictif — article 1 : le candidat fournit un Kbis. " * 4])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("RC.pdf", texte)
        zf.writestr("CCTP.pdf", texte)
    resp = client.post("/api/projects/proj-chr1/documents",
                       files={"file": ("dce.zip", buf.getvalue(), "application/zip")})
    assert resp.status_code == 200, resp.text
    _joindre("synorix-extract-")

    assert len(_lignes(journal, "depot", "proj-chr1")) == 1
    assert len(_lignes(journal, "lecture", "proj-chr1")) == 1


def test_lots(db_session, test_org, monkeypatch, journal):
    import routers.projects as projects_mod
    import services.ai.lot_fallback as lf
    _projet(db_session, test_org.id, "proj-chr2")
    db_session.add(ProjectDocument(project_id="proj-chr2", type="rc", file_url="/uploads/projects/proj-chr2/rc.pdf",
                                   file_name="RC.pdf", extracted_text="Marché en 1 lot.\nLot 1 — Gros œuvre"))
    db_session.commit()
    monkeypatch.setattr(projects_mod.lot_detector, "detect", lambda *a, **k: [])
    monkeypatch.setattr(lf, "_call_claude", lambda *a, **k: (_ for _ in ()).throw(AssertionError("pas d'IA")))
    docs_data = [{"id": "d1", "file_name": "RC.pdf", "file_url": "/uploads/projects/proj-chr2/rc.pdf",
                  "extracted_text": "Marché en 1 lot.", "type": "rc", "related_lots": None}]
    projects_mod._run_lot_detection_background("proj-chr2", docs_data, projects_mod.UPLOADS_ROOT)
    assert len(_lignes(journal, "lots", "proj-chr2")) == 1


def test_analyse_une_ligne_par_run_et_une_par_lot(client, db_session, test_org, monkeypatch, journal):
    from services.ai import checklist_matcher, dce_analyzer
    from models.organization import Organization
    db_session.get(Organization, test_org.id).plan = "pro"
    _projet(db_session, test_org.id, "proj-chr3")
    for typ, nom in (("rc", "rc.pdf"), ("cctp", "cctp.pdf")):
        db_session.add(ProjectDocument(project_id="proj-chr3", type=typ, file_url="x", file_name=nom,
                                       extracted_text="Texte fictif de la pièce. " * 50))
    db_session.commit()
    req = {"exigence": "Fournir un Kbis", "source_document": "RC", "source_page": 1, "source_excerpt": "extrait",
           "category": "candidature", "priority": "obligatoire"}
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked",
                        lambda self, *a, **k: {"requirements": [dict(req)], "criteres_jugement": [], "infos_marche": {}})

    async def _aucun(self, *a, **k):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _aucun)

    assert client.post("/api/projects/proj-chr3/analyze").json()["status"] == "started"
    _joindre("synorix-analysis-")

    [run] = _lignes(journal, "analyse", "proj-chr3")
    assert run["statut"] == "ok" and run["lot"] != "-"
    assert len(_lignes(journal, "analyse_lot", "proj-chr3")) >= 1


def test_memoire(client, db_session, test_org, monkeypatch, journal):
    import routers.memoire as memoire_mod
    from models.organization import Organization
    db_session.get(Organization, test_org.id).plan = "pro"
    _projet(db_session, test_org.id, "proj-chr4", current_step=5)
    db_session.add(ProjectDocument(project_id="proj-chr4", type="rc", file_url="x", file_name="rc.pdf",
                                   extracted_text="Règlement fictif. " * 30))
    db_session.commit()

    async def _vite(self, **kwargs):
        return {"preambule": "fictif", "partie_a": {"implantation": "ok"}, "partie_b": {}, "partie_c": {}}
    monkeypatch.setattr(memoire_mod.MemoireGenerator, "generate", _vite)

    assert client.post("/api/projects/proj-chr4/memoire/generate", json={}).json()["status"] == "started"
    _joindre("synorix-memoire-")

    [l] = _lignes(journal, "memoire", "proj-chr4")
    assert l["statut"] == "ok" and l["lot"] == "lot1"


def test_export_word_pdf_et_zip(client, db_session, test_org, journal):
    _projet(db_session, test_org.id, "proj-chr5")
    db_session.add(MemoireTechnique(project_id="proj-chr5", content_json={"partie_a": {"historique": "Texte fictif."}}))
    db_session.commit()

    for chemin in ("memoire/export-docx", "export/docx", "export/zip"):
        r = client.get(f"/api/projects/proj-chr5/{chemin}")
        assert r.status_code == 200, (chemin, r.text[:200])
    exports = _lignes(journal, "export", "proj-chr5")
    assert len(exports) == 3
    assert {l["lot"] for l in exports} == {"lot1"} and {l["statut"] for l in exports} == {"ok"}


def test_export_en_erreur_est_journalise(client, db_session, test_org, journal):
    _projet(db_session, test_org.id, "proj-chr6")          # pas de mémoire : 404
    assert client.get("/api/projects/proj-chr6/export/docx").status_code == 404
    [l] = _lignes(journal, "export", "proj-chr6")
    assert l["statut"] == "erreur"


def test_aucune_ligne_ne_contient_de_nom_de_projet_ni_de_fichier(client, db_session, test_org, journal):
    db_session.add(Project(id="proj-chr7", organization_id=test_org.id, name="Groupe scolaire Secret"))
    db_session.add(MemoireTechnique(project_id="proj-chr7", content_json={"partie_a": {"historique": "Texte fictif."}}))
    db_session.commit()
    client.get("/api/projects/proj-chr7/memoire/export-docx")
    messages = " ".join(r.getMessage() for r in journal.records if r.name == "synorix.chrono")
    assert "Secret" not in messages and "Groupe" not in messages and ".docx" not in messages
