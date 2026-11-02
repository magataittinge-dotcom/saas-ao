"""R9 — « 13 lots détectés » alors que le journal en comptait 16 : les lots cités dans le dossier mais non proposés sont
comptés avec leur raison, et la route /lots les rend. Jamais un nom de lot (aucun nom inventé). Données inventées."""
from models.project import Project, ProjectDocument
import services.ai.lot_fallback as lf


def _lot(lot_id, nom, sources):
    return {"id": lot_id, "nom": nom, "confidence": 90, "sources": list(sources)}


def _seize_lots_dont_trois_fantomes():
    """13 lots au tableau du règlement + 3 lots seulement cités ailleurs (nom de pièce, texte d'un CCTP)."""
    lots = [_lot(f"lot{i}", f"Lot {i} — Corps d'état inventé {i}", ["rc_table", "rc_text"]) for i in range(1, 14)]
    lots += [_lot("lot14", "Lot 14 — Cité ailleurs A", ["filename"]),
             _lot("lot15", "Lot 15 — Cité ailleurs B", ["filename"]),
             _lot("lot16", "Lot 16 — Cité ailleurs C", ["rc_text"])]
    return lots


def test_trois_fantomes_sont_comptes_avec_leur_raison_sans_appel_ia(monkeypatch):
    monkeypatch.setattr(lf, "_call_claude", lambda *a, **k: (_ for _ in ()).throw(AssertionError("aucun appel IA attendu")))
    lots, ia, ecartes = lf.finaliser_lots({"RC.pdf": "texte inventé"}, _seize_lots_dont_trois_fantomes(), 13)
    assert len(lots) == 13 and ia is False
    assert ecartes == {"hors_liste": 3, "sans_intitule": 0}
    assert {l["id"] for l in lots} == {f"lot{i}" for i in range(1, 14)}


def test_un_lot_sans_intitule_est_compte_a_part(monkeypatch):
    monkeypatch.setattr(lf, "_call_claude", lambda *a, **k: [])   # le filet ne trouve rien
    lots_in = [_lot("lot1", "Lot 1 — Maçonnerie inventée", ["rc_table"]), _lot("lot2", "Lot 2", ["rc_table"]),
               _lot("lot3", "Lot 3 — Peinture inventée", ["rc_table"])]
    lots, _ia, ecartes = lf.finaliser_lots({"RC.pdf": "Lot 2 inventé"}, lots_in, 3)
    assert [l["id"] for l in lots] == ["lot1", "lot3"]
    assert ecartes == {"hors_liste": 0, "sans_intitule": 1}


def test_rien_d_ecarte_rien_de_compte(monkeypatch):
    lots_in = [_lot("lot1", "Lot 1 — Maçonnerie inventée", ["rc_table"]), _lot("lot2", "Lot 2 — Peinture inventée", ["rc_table"])]
    _lots, _ia, ecartes = lf.finaliser_lots({"RC.pdf": "x"}, lots_in, 2)
    assert ecartes == {"hors_liste": 0, "sans_intitule": 0}


def test_un_lot_ecarte_puis_retrouve_par_le_filet_n_est_plus_compte(monkeypatch):
    # annoncé : 2 ; le tableau n'en donne qu'un, l'autre n'est cité qu'ailleurs ; le filet le complète depuis le règlement
    monkeypatch.setattr(lf, "collect_lot_excerpts", lambda *a, **k: "extrait inventé")
    monkeypatch.setattr(lf, "_call_claude", lambda *a, **k: [{"id": "lot2", "nom": "Lot 2 — Peinture inventée"}])
    lots_in = [_lot("lot1", "Lot 1 — Maçonnerie inventée", ["rc_table"]), _lot("lot9", "Lot 9 — Cité ailleurs", ["filename"])]
    lots, ia, ecartes = lf.finaliser_lots({"RC.pdf": "x"}, lots_in, 1)
    assert [l["id"] for l in lots] == ["lot1"]
    assert ecartes["hors_liste"] == 1


def _projet(db, org_id, **kw):
    db.add(Project(id="p-ecartes", organization_id=org_id, name="AO lots écartés", **kw))
    db.add(ProjectDocument(project_id="p-ecartes", type="rc", file_url="/uploads/projects/p-ecartes/rc.pdf", file_name="RC.pdf",
                           extracted_text="Le marché est divisé en 13 lots."))
    db.commit()


def test_la_detection_enregistre_les_comptes_puis_la_route_les_rend(client, db_session, test_org, monkeypatch):
    import routers.projects as projects_mod
    _projet(db_session, test_org.id)
    monkeypatch.setattr(projects_mod.lot_detector, "detect", lambda *a, **k: _seize_lots_dont_trois_fantomes())
    monkeypatch.setattr(lf, "_call_claude", lambda *a, **k: (_ for _ in ()).throw(AssertionError("aucun appel IA attendu")))
    docs = [{"id": "d1", "file_name": "RC.pdf", "file_url": "/uploads/projects/p-ecartes/rc.pdf",
             "extracted_text": "Le marché est divisé en 13 lots.", "type": "rc", "related_lots": None}]
    projects_mod._run_lot_detection_background("p-ecartes", docs, projects_mod.UPLOADS_ROOT)

    db_session.expire_all()
    p = db_session.query(Project).filter(Project.id == "p-ecartes").first()
    assert len(p.lots_detectes) == 13 and p.lots_announced == 13
    assert p.lots_ecartes == {"hors_liste": 3, "sans_intitule": 0}

    r = client.get("/api/projects/p-ecartes/lots")
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["count"] == 13 and corps["ecartes"] == {"hors_liste": 3, "sans_intitule": 0}
    # aucun nom de lot écarté ne sort de la route
    assert "Cité ailleurs" not in r.text


def test_sans_detection_enregistree_ecartes_est_nul(client, db_session, test_org):
    _projet(db_session, test_org.id, lots_detectes=[_lot("lot1", "Lot 1 — Maçonnerie inventée", ["rc_table"])])
    r = client.get("/api/projects/p-ecartes/lots")
    assert r.status_code == 200 and r.json()["ecartes"] is None


def test_route_lots_autre_organisation_404(client, db_session, test_org):
    from models.organization import Organization
    db_session.add(Organization(id="org-autre-lots", name="Autre BTP"))
    db_session.commit()
    _projet(db_session, "org-autre-lots", lots_detectes=[_lot("lot1", "Lot 1 — inventé", ["rc_table"])], lots_ecartes={"hors_liste": 2, "sans_intitule": 0})
    assert client.get("/api/projects/p-ecartes/lots").status_code == 404


def test_migration_0033_suit_0032_une_seule_head():
    from pathlib import Path
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    script = ScriptDirectory.from_config(Config(str(Path(__file__).resolve().parent.parent / "alembic.ini")))
    assert script.get_revision("0033").down_revision == "0032"
    assert len(script.get_heads()) == 1
    assert Project.__table__.c["lots_ecartes"].nullable
