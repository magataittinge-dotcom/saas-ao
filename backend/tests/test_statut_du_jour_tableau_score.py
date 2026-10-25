"""
Statut des pièces jugé à la lecture : tableau de bord et Synorix Score
(mission V, bloc 2, tranche 7).

Les compteurs du tableau de bord (« documents expirés », « expirant
bientôt ») et la qualification du Synorix Score lisaient le statut stocké,
recalculé une fois par jour : une pièce dont la date passait aujourd'hui
restait comptée valable. Même règle que le coffre (current_document_status).
"""
from datetime import date, datetime, timedelta

from models.document import Document

TODAY = date.today()


def _doc(db, org_id, id_, **kw):
    db.add(Document(id=id_, organization_id=org_id, file_url=f"/uploads/x/{id_}.pdf", file_name=f"{id_}.pdf",
                    category="autres", uploaded_at=datetime.utcnow(), **kw))


def test_compteurs_du_tableau_de_bord_au_jour(client, db_session, test_org):
    from services.cache import org_cache
    org_cache.clear()
    _doc(db_session, test_org.id, "echue_hier", type="kbis", status="valid", expiry_date=TODAY - timedelta(days=1))
    _doc(db_session, test_org.id, "bientot", type="decennale", status="valid", expiry_date=TODAY + timedelta(days=10))
    _doc(db_session, test_org.id, "valable", type="fiscal", status="valid", expiry_date=TODAY + timedelta(days=90))
    _doc(db_session, test_org.id, "retiree", type="urssaf", status="valid",
         expiry_date=TODAY - timedelta(days=3), deleted_at=datetime.utcnow())
    db_session.commit()

    stats = client.get("/api/dashboard/stats").json()
    assert stats["documents_expires"] == 1
    assert stats["documents_expirant_bientot"] == 1
    org_cache.clear()


class _Req:
    def __init__(self, text):
        self.exigence_text, self.source_document, self.source_page = text, "RC.pdf", 3


def _qualifications(vault):
    from services.synorix_score import build_score
    res = build_score(
        memoire_config=None, vault_docs=vault,
        compliance_items=[_Req("Le candidat devra justifier de la qualification QUALIBAT 2112 ou équivalente.")],
        criteres_jugement=None,
        critical_fields={"date_limite_remise": {"value": None, "source": None},
                         "penalites": {"value": None, "source": None}},
        infos_marche={},
    )
    return next(c for c in res["composantes"] if c["id"] == "qualifications")


def test_synorix_score_qualification_echue_aujourd_hui(db_session, test_org):
    echue = Document(id="q", organization_id=test_org.id, type="qualibat", status="valid",
                     expiry_date=TODAY - timedelta(days=1), file_url="/x", file_name="q.pdf")
    valable = Document(id="q2", organization_id=test_org.id, type="qualibat", status="valid",
                       expiry_date=TODAY + timedelta(days=60), file_url="/x", file_name="q2.pdf")
    assert _qualifications([echue])["statut"] != "ok"
    assert _qualifications([valable])["statut"] == "ok"
