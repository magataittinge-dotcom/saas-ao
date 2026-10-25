"""Pièces communes en passe 2 : un préfixe stable, mis en cache, identique pour
tous les lots (décision du 26/10 : chaque lot voit les Généralités, sans les
payer 13 fois).

Avant : chaque appel commençait par l'en-tête PROPRE AU LOT (« Cette analyse
concerne le Lot 05… »), puis le texte ; seuls le prompt système et les
référentiels étaient en cache, et les référentiels changent d'un lot à l'autre.
Les 126 000 caractères des Généralités de Gueux étaient donc payés plein tarif
pour chaque lot.

Maintenant, pour les pièces communes à tous les lots :
  - le bloc du document vient en premier, marqué pour le cache ;
  - l'en-tête du lot vient après ;
  - les référentiels sont ceux de tous les lots, donc le préfixe est identique ;
  - le premier lot écrit le cache avant que les autres ne le lisent.
"""
import threading
import time

from services.ai.dce_analyzer import _contenu_utilisateur


class _Piece:
    def __init__(self, nom, lots, texte, type_="cctp"):
        self.file_name, self.related_lots, self.type = nom, lots, type_
        self.extracted_text, self.file_url, self.is_user_completed = texte, "", False


def test_bloc_du_document_en_cache_puis_en_tete_du_lot():
    blocs = _contenu_utilisateur("=== CCTP — Généralités ===\nTexte commun", suffixe="Lot 05")
    assert blocs[0]["cache_control"] == {"type": "ephemeral"}
    assert blocs[0]["text"].endswith("Texte commun")
    assert blocs[1] == {"type": "text", "text": "Lot 05"}


def test_sans_suffixe_appel_inchange():
    blocs = _contenu_utilisateur("=== CCTP lot 05 ===\nTexte")
    assert len(blocs) == 1 and "cache_control" not in blocs[0]


def test_specification_separe_le_commun_du_propre_au_lot():
    from routers.analysis import _build_lot_spec
    docs = [_Piece("CCTP lot 00 Généralités.pdf", ["all"], "PRESCRIPTIONS-COMMUNES " * 10),
            _Piece("CCTP lot 05.pdf", ["5"], "CCTP-LOT-5 " * 10)]
    lot5 = _build_lot_spec(docs, "lot5", {"lot5": "Lot 05"}, None, None)
    lot9 = _build_lot_spec(docs, "lot9", {"lot9": "Lot 09"}, None, None)
    assert "PRESCRIPTIONS-COMMUNES" in lot5["pass2_commun"]
    assert lot5["pass2_commun"] == lot9["pass2_commun"]          # identique pour tous les lots
    assert "PRESCRIPTIONS-COMMUNES" not in (lot5["pass2_text"] or "")
    assert "CCTP-LOT-5" in lot5["pass2_text"] and lot9["pass2_text"] is None


def test_passe2_prefixe_commun_identique_et_cache_ecrit_une_fois(client, db_session, test_org, monkeypatch):
    from models.organization import Organization
    from models.project import Project, ProjectDocument
    from services.ai import checklist_matcher, dce_analyzer

    appels, journal = [], []
    verrou = threading.Lock()

    def _faux(self, dce_text, system_prompt, label="", skills_ref="", project_id=None,
              progress_cb=None, suffixe=""):
        with verrou:
            journal.append(("debut", label))
        if "commun" in label:
            time.sleep(0.05)
        with verrou:
            appels.append({"label": label, "texte": dce_text, "suffixe": suffixe, "skills": skills_ref})
            journal.append(("fin", label))
        return {"requirements": [{"exigence": f"Exigence {label}", "source_document": "CCTP",
                                  "source_page": 1, "source_excerpt": "x", "category": "technique",
                                  "priority": "obligatoire"}], "criteres_jugement": [], "infos_marche": {}}

    async def _aucun(self, *a, **kw):
        return []
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_sync_call", _faux)
    monkeypatch.setattr(dce_analyzer.DCEAnalyzer, "_demo_mode", False, raising=False)
    monkeypatch.setattr(checklist_matcher.ChecklistMatcher, "match", _aucun)

    db_session.get(Organization, test_org.id).plan = "pro"
    lots = [{"id": f"lot{i}", "nom": f"Lot 0{i} — Lot {i}"} for i in (1, 2, 3)]
    db_session.add(Project(id="proj-cache", organization_id=test_org.id, name="AO", lots_detectes=lots))
    db_session.add(ProjectDocument(project_id="proj-cache", type="rc", file_url="x", file_name="RC.pdf",
                                   related_lots=["all"], extracted_text="Règlement. " * 50))
    db_session.add(ProjectDocument(project_id="proj-cache", type="cctp", file_url="x",
                                   file_name="CCTP lot 00 Généralités.pdf", related_lots=["all"],
                                   extracted_text="Prescriptions communes à tous les lots. " * 50))
    for i in (1, 2, 3):
        db_session.add(ProjectDocument(project_id="proj-cache", type="cctp", file_url="x",
                                       file_name=f"CCTP lot 0{i}.pdf", related_lots=[str(i)],
                                       extracted_text=f"Prescriptions du lot {i}. " * 50))
    db_session.commit()

    resp = client.post("/api/projects/proj-cache/analyze", json={"lots": ["lot1", "lot2", "lot3"]})
    assert resp.status_code == 200, resp.text
    for t in threading.enumerate():
        if t.name.startswith("synorix-analysis-"):
            t.join(timeout=30)

    communs = [a for a in appels if "-commun" in a["label"]]
    assert len(communs) == 3                                         # une fois par lot
    assert len({a["texte"] for a in communs}) == 1                   # préfixe identique
    assert len({a["skills"] for a in communs}) == 1                  # référentiels identiques
    assert len({a["suffixe"] for a in communs}) == 3                 # un en-tête par lot
    assert all("Lot 0" in a["suffixe"] for a in communs)             # l'en-tête du lot vient après
    assert all("Prescriptions communes" not in a["texte"]
               for a in appels if "-commun" not in a["label"])
    # Le premier appel commun se termine avant le début d'un autre : le cache est écrit une fois.
    fin_premier = journal.index(next(e for e in journal if e[0] == "fin" and "commun" in e[1]))
    debuts_communs = [i for i, e in enumerate(journal) if e[0] == "debut" and "commun" in e[1]]
    assert all(i > fin_premier for i in debuts_communs[1:])
