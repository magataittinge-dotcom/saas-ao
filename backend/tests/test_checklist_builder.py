"""
Génération de checklist depuis la BASE (fix « Vérification vide »).

La checklist n'était générée QUE pendant le run d'analyse (best-effort
silencieux) et ignorait les scopes multi-lots. Le builder :
  • agrège les exigences candidature/offre du périmètre : communes
    ('_commun' + legacy NULL) + spécifiques par lot,
  • pièce commune (URSSAF) → UNE entrée (lot NULL) ;
    pièce par lot (DPGF lot X) → une entrée étiquetée lot=lotX,
  • dédupliquée (une pièce par-lot identique à une commune est écartée),
  • rejouable gratuitement (matcher déterministe, 0 € API).
"""
from datetime import date

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.project import Project


def _seed(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="X", deadline=date.today(),
                   lots_detectes=[{"id": "lot5", "nom": "Lot 05 — Façade"},
                                  {"id": "lot6", "nom": "Lot 06 — Plaquisterie"}]))
    rows = [
        # communes (scope _commun)
        ("Fournir l'attestation URSSAF de moins de 6 mois", "candidature", "_commun"),
        ("Fournir le DC1 complété et signé", "candidature", "_commun"),
        # legacy NULL (projet analysé avant la migration) → traité commun
        ("Fournir l'extrait Kbis", "candidature", None),
        # par lot (dont un doublon d'une commune → écarté)
        ("Remettre la DPGF complétée du lot", "offre", "lot5"),
        ("Fournir l'attestation URSSAF de moins de 6 mois", "candidature", "lot5"),
        ("Remettre la DPGF complétée du lot", "offre", "lot6"),
        # technique → PAS dans la checklist
        ("Respecter le DTU 20.1", "technique", "lot5"),
    ]
    for text, cat, lot in rows:
        db.add(ComplianceItem(project_id=pid, exigence_text=text, category=cat,
                              priority="obligatoire", status="non_couvert", lot=lot))
    db.commit()


def test_builder_aggregates_scopes_and_dedups(client, db_session, test_org):
    from services.checklist_builder import generate_checklist_from_db

    _seed(db_session, test_org.id, "proj-cb1")
    n = generate_checklist_from_db(db_session, "proj-cb1", test_org.id)
    assert n > 0

    items = db_session.query(ChecklistItem).filter(
        ChecklistItem.project_id == "proj-cb1").all()
    by_lot = {}
    for i in items:
        by_lot.setdefault(i.lot, []).append(i.details or i.document_type_required)

    # Communes : URSSAF + DC1 + Kbis (legacy NULL inclus), UNE seule fois
    assert len(by_lot.get(None, [])) == 3, by_lot
    # Par lot : DPGF étiquetée pour chaque lot ; URSSAF lot5 (doublon) écartée
    assert len(by_lot.get("lot5", [])) == 1, by_lot
    assert len(by_lot.get("lot6", [])) == 1, by_lot


def test_regenerate_endpoint_is_free_and_idempotent(client, db_session, test_org):
    _seed(db_session, test_org.id, "proj-cb2")

    r1 = client.post("/api/projects/proj-cb2/checklist/regenerate")
    assert r1.status_code == 200, r1.text
    n1 = r1.json()["items"]
    assert n1 == 5  # 3 communes + 2 par lot

    # Idempotent : re-régénérer ne duplique pas
    r2 = client.post("/api/projects/proj-cb2/checklist/regenerate")
    assert r2.json()["items"] == n1
    count = db_session.query(ChecklistItem).filter(
        ChecklistItem.project_id == "proj-cb2").count()
    assert count == n1


def test_checklist_get_exposes_lot(client, db_session, test_org):
    _seed(db_session, test_org.id, "proj-cb3")
    client.post("/api/projects/proj-cb3/checklist/regenerate")
    body = client.get("/api/projects/proj-cb3/checklist").json()
    lots = {i.get("lot") for i in body}
    assert None in lots and "lot5" in lots and "lot6" in lots
