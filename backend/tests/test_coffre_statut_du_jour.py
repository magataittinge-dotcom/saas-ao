"""
Coffre-fort : le statut d'une pièce est jugé à la LECTURE (mission V, tranche 4).

Le statut stocké n'est recalculé qu'à l'écriture et une fois par jour
(tasks/check_expiry). Une attestation dont la date de fin passe aujourd'hui
restait « valid » dans le coffre et la modale « Choisir » jusqu'au passage du
job. Désormais, toute réponse DocumentResponse donne le statut du jour (même
règle que le job, services/vault_classifier.current_document_status).
"""
from datetime import date, datetime, timedelta

from models.document import Document

TODAY = date.today()


def _doc(db, org_id, id_, **kw):
    db.add(Document(id=id_, organization_id=org_id, file_url=f"/uploads/x/{id_}.pdf",
                    file_name=f"{id_}.pdf", category="autres", uploaded_at=datetime.utcnow(), **kw))


def test_liste_du_coffre_au_statut_du_jour(client, db_session, test_org):
    _doc(db_session, test_org.id, "echue_hier", type="kbis", status="valid", expiry_date=TODAY - timedelta(days=1))
    _doc(db_session, test_org.id, "bientot", type="decennale", status="valid", expiry_date=TODAY + timedelta(days=10))
    _doc(db_session, test_org.id, "urssaf_ancienne", type="urssaf", status="valid",
         issued_date=TODAY - timedelta(days=200))    # 6 mois après l'émission (C11, D8222-5)
    _doc(db_session, test_org.id, "sans_date", type="rc_civile", status="unverified")
    _doc(db_session, test_org.id, "non_classe", type="autre", status="unclassified",
         expiry_date=TODAY + timedelta(days=300))
    _doc(db_session, test_org.id, "valable", type="fiscal", status="valid", expiry_date=TODAY + timedelta(days=90))
    db_session.commit()

    statuts = {d["id"]: d["status"] for d in client.get("/api/documents").json()}
    assert statuts == {
        "echue_hier": "expired", "bientot": "expiring_soon", "urssaf_ancienne": "expired",
        "sans_date": "unverified", "non_classe": "unclassified", "valable": "valid",
    }
