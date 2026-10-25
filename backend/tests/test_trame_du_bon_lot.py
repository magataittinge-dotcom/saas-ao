"""
La trame DPGF du bon lot (B2 §7 n°3, nuit du 25/10).

La ligne « DPGF » de la checklist recevait la PREMIÈRE trame DPGF du projet,
quel que soit le lot : sur Gueux, le lot 05 recevait celle du lot 01a. La
trame est maintenant choisie par le rattachement des pièces aux lots
(related_lots, comparé avec document_tagger._normalize_lot_num) : celle du lot
de la ligne, sinon du lot sélectionné ; s'il y a plusieurs trames et aucune
pour ce lot, aucune n'est donnée (jamais celle d'un autre lot).
"""
from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument


def _projet(db, org_id, pid, selected_lot=None, trames=(), lot_exigence="_commun"):
    db.add(Project(id=pid, organization_id=org_id, name="AO Lots", selected_lot=selected_lot))
    db.add(ComplianceItem(project_id=pid, exigence_text="Remettre la DPGF complétée", category="offre",
                          priority="obligatoire", status="non_couvert", lot=lot_exigence))
    for id_, nom, lots in trames:
        db.add(ProjectDocument(id=id_, project_id=pid, type="dpgf_template", file_name=nom,
                               file_url=f"/uploads/x/{id_}.xlsx", related_lots=lots))
    db.commit()


def _trame(client, db, pid):
    assert client.post(f"/api/projects/{pid}/checklist/regenerate").status_code == 200
    db.expire_all()
    ligne = db.query(ChecklistItem).filter(ChecklistItem.project_id == pid,
                                           ChecklistItem.document_type_required == "dpgf_template").one()
    return ligne.template_project_doc_id


def test_le_lot_05_recoit_la_dpgf_du_lot_05(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-l05", selected_lot="lot05", trames=[
        ("dpgf-01a", "DPGF Lot 01a GO.xlsx", ["01a"]),
        ("dpgf-05", "DPGF Lot 05 Facade.xlsx", ["05"]),
    ])
    assert _trame(client, db_session, "p-l05") == "dpgf-05"


def test_jamais_la_trame_d_un_autre_lot(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-autre", selected_lot="lot05", trames=[
        ("dpgf-01a", "DPGF Lot 01a GO.xlsx", ["01a"]),
        ("dpgf-02", "DPGF Lot 02.xlsx", ["2"]),
    ])
    assert _trame(client, db_session, "p-autre") is None


def test_ligne_d_un_lot_prend_la_trame_de_son_lot(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-ligne", selected_lot="lot1", lot_exigence="lot2", trames=[
        ("dpgf-1", "DPGF Lot 1.xlsx", ["1"]),
        ("dpgf-2", "DPGF Lot 2.xlsx", ["2"]),
    ])
    assert _trame(client, db_session, "p-ligne") == "dpgf-2"


def test_une_seule_trame_ou_trame_commune(client, db_session, test_org):
    _projet(db_session, test_org.id, "p-seule", selected_lot=None,
            trames=[("dpgf-unique", "DPGF.xlsx", None)])
    assert _trame(client, db_session, "p-seule") == "dpgf-unique"
    _projet(db_session, test_org.id, "p-commune", selected_lot="lot3", trames=[
        ("dpgf-toutes", "DPGF tous lots.xlsx", ["all"]),
        ("dpgf-01", "DPGF Lot 1.xlsx", ["1"]),
    ])
    assert _trame(client, db_session, "p-commune") == "dpgf-toutes"
