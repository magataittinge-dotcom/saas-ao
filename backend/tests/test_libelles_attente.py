"""R10 — fenêtre d'attente de l'analyse : des phrases de patron, sans jargon interne
(« tronc commun », « partie 1/7 »). Chaînes inventées seulement."""
import re
import threading
from datetime import date

import pytest

from models.project import Project, ProjectDocument

JARGON = re.compile(r"tronc commun|partie\s*\d+\s*/\s*\d+|\d+\s*/\s*\d+|passe\s*[12]|pass[12]", re.I)


def test_detail_des_tranches_sans_compteur_ni_jargon(monkeypatch):
    """Plusieurs tranches : le détail affiché ne contient ni « partie k/n » ni jargon."""
    from services import pipeline_tracker
    from services.ai import dce_analyzer

    details = []
    monkeypatch.setattr(pipeline_tracker, "update_step_progress",
                        lambda pid, ratio, detail=None: details.append(detail))
    monkeypatch.setattr(dce_analyzer, "_build_call_texts", lambda t: ["a", "b", "c"])

    def _fake_sync(self, texte, system_prompt, etiquette, skills_ref, project_id, progress_cb=None, suffixe=""):
        if progress_cb:
            progress_cb(0.5)
            progress_cb(1.0)
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_sync_call", _fake_sync)
    a = dce_analyzer.DCEAnalyzer.__new__(dce_analyzer.DCEAnalyzer)
    a._run_pass_chunked("texte inventé", "sys", "passe1-admin", "", "p-attente", "",
                        "Lecture des pièces administratives")
    vus = {d for d in details if d}
    assert vus == {"Lecture des pièces administratives"}, vus


def _join():
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)


def test_libelles_des_passes_du_routeur_sans_jargon(client, db_session, test_org, monkeypatch):
    from models.organization import Organization
    from services.ai import dce_analyzer, checklist_matcher

    labels = []

    def _fake(self, pass_text, system_prompt, label, skills_ref="", project_id=None,
              lot_header="", detail_label="Analyse", entete_apres=False):
        labels.append(detail_label)
        return {"requirements": [], "criteres_jugement": [], "infos_marche": {}}

    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_run_pass_chunked", _fake)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)

    async def _nomatch(self, *a, **kw):
        return []
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _nomatch)

    db_session.get(Organization, test_org.id).plan = "pro"
    db_session.add(Project(id="p-lib", organization_id=test_org.id, name="X", deadline=date.today(),
                           lots_detectes=[{"id": "lot1", "nom": "Lot 01 — Maçonnerie inventée"},
                                          {"id": "lot2", "nom": "Lot 02 — Peinture inventée"}]))
    db_session.add(ProjectDocument(project_id="p-lib", type="rc", file_url="x", file_name="rc.pdf",
                                   extracted_text="Règlement inventé. Candidature. " * 40))
    db_session.add(ProjectDocument(project_id="p-lib", type="cctp", file_url="x", file_name="cctp lot 01.pdf",
                                   extracted_text="Prescriptions inventées. " * 40, related_lots=["1"]))
    db_session.commit()
    r = client.post("/api/projects/p-lib/analyze", json={"lots": ["lot1", "lot2"]})
    assert r.status_code == 200, r.text
    _join()

    assert labels, "aucune passe lancée"
    for texte in labels:
        assert not JARGON.search(texte), texte
    assert "Lecture des pièces administratives" in labels


def test_libelles_du_mode_simple_sans_jargon():
    from pathlib import Path
    src = (Path(__file__).resolve().parent.parent / "services" / "ai" / "dce_analyzer.py").read_text(encoding="utf-8")
    for m in re.finditer(r'lot_header, "(Analyse[^"]*|Lecture[^"]*)"', src):
        assert not JARGON.search(m.group(1)), m.group(1)
        assert m.group(1).startswith("Lecture des pièces"), m.group(1)


# ── R11 : la promesse « vous prévient par e-mail » suit la configuration réelle ──

def test_notifications_dit_si_les_e_mails_partent(client, monkeypatch):
    from services import notifications as notif_mod

    monkeypatch.setattr(notif_mod, "_smtp_configured", lambda: False)
    assert client.get("/api/notifications").json()["email_actif"] is False

    monkeypatch.setattr(notif_mod, "_smtp_configured", lambda: True)
    assert client.get("/api/notifications").json()["email_actif"] is True
