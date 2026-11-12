"""Recette finale, point 1 : sur un AO à plusieurs lots, l'Export du lot 05 proposait le tableau
des prix (DPGF) du lot 01a — la première DPGF du projet, quel que soit son lot.

La DPGF proposée est celle du lot exporté (rattachée au lot d'abord, puis une DPGF commune),
jamais celle d'un autre lot. Sans lot choisi : comme avant, la DPGF du dossier. Noms inventés.
"""
from models.project import Project, ProjectDocument

LOTS = [{"id": "lot1", "nom": "Lot 01 — Gros œuvre"}, {"id": "lot5", "nom": "Lot 05 — Façade"}]


def _projet(db, org_id, pid, selected_lot, dpgf):
    db.add(Project(id=pid, organization_id=org_id, name="AO inventé", selected_lot=selected_lot,
                   lots_detectes=LOTS))
    for i, (nom, lots) in enumerate(dpgf):
        db.add(ProjectDocument(id=f"{pid}-d{i}", project_id=pid, type="dpgf_template", file_name=nom,
                               file_url=f"/uploads/projects/{pid}/{nom}", related_lots=lots))
    db.commit()


def _detail(client, pid):
    r = client.get(f"/api/projects/{pid}/export/detail")
    assert r.status_code == 200, r.text
    return r.json()


def test_export_du_lot_05_propose_la_dpgf_du_lot_05(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-dpgf-a", "lot5",
            [("DPGF Lot 01a GO.xlsx", ["1a"]), ("DPGF Lot 05 Facade.xlsx", ["5"])])
    d = _detail(client, "p-dpgf-a")
    assert d["has_dpgf"] is True
    assert d["dpgf_info"]["file_name"] == "DPGF Lot 05 Facade.xlsx"


def test_export_d_un_lot_sans_dpgf_ne_propose_pas_celle_d_un_autre_lot(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-dpgf-b", "lot5",
            [("DPGF Lot 01b STB.xlsx", ["1b"]), ("DPGF Lot 01a GO.xlsx", ["1a"])])
    d = _detail(client, "p-dpgf-b")
    assert d["dpgf_info"] is None and d["has_dpgf"] is False
    assert client.get("/api/projects/p-dpgf-b/export/summary").json()["has_dpgf"] is False


def test_dpgf_commune_retenue_et_sans_lot_choisi_comme_avant(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-dpgf-c", "lot5",
            [("DPGF Lot 01a GO.xlsx", ["1a"]), ("DPGF commune.xlsx", ["all"])])
    assert _detail(client, "p-dpgf-c")["dpgf_info"]["file_name"] == "DPGF commune.xlsx"
    _projet(db_session, test_org.id, "p-dpgf-d", None, [("DPGF unique.xlsx", None)])
    assert _detail(client, "p-dpgf-d")["dpgf_info"]["file_name"] == "DPGF unique.xlsx"
