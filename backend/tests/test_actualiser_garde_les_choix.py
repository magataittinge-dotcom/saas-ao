"""
« Actualiser » garde les choix de l'utilisateur (B2 §7 n°2, nuit du 25/10).

La régénération (POST /checklist/regenerate, et la fin de chaque analyse)
supprimait puis recréait toutes les lignes : la pièce choisie au coffre, la
trame déposée et son contrôle, la confirmation de signature et « Non
concerné » étaient perdus, et le score reculait sans prévenir (1/3 → 0/4 sur
le bac à sable de B2). Maintenant chaque ligne retrouve les choix de la ligne
qu'elle remplace (même pièce, même lot) ; seul un document supprimé ou expiré
cède la place au choix automatique (règle B1).
"""
from datetime import date, datetime, timedelta

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.document import Document
from models.project import Project, ProjectDocument

TODAY = date.today()
PID = "proj-actualiser"


def _seed(db, org_id):
    db.add(Project(id=PID, organization_id=org_id, name="AO Actualiser"))
    for texte, cat in (("Fournir une attestation de vigilance URSSAF", "candidature"),
                       ("Le cas échéant, fournir la déclaration de sous-traitance (DC4)", "offre"),
                       ("Compléter l'acte d'engagement (AE)", "offre"),
                       ("Remettre la DPGF complétée", "offre")):
        db.add(ComplianceItem(project_id=PID, exigence_text=texte, category=cat, priority="obligatoire",
                              status="non_couvert", lot="_commun"))
    db.add(ProjectDocument(id="ae-trame", project_id=PID, type="acte_engagement_template",
                           file_url="/uploads/x/ae.pdf", file_name="AE.pdf"))
    db.add(ProjectDocument(id="dpgf-trame", project_id=PID, type="dpgf_template",
                           file_url="/uploads/x/dpgf.xlsx", file_name="DPGF.xlsx"))
    db.add(ProjectDocument(id="dpgf-remplie", project_id=PID, type="dpgf_template", is_user_completed=True,
                           file_url="/uploads/x/dpgf_remplie.xlsx", file_name="DPGF_remplie.xlsx"))
    for id_, fin in (("urssaf_auto", 200), ("urssaf_choisie", 100), ("urssaf_retiree", 300)):
        db.add(Document(id=id_, organization_id=org_id, type="urssaf", status="valid",
                        expiry_date=TODAY + timedelta(days=fin), file_url=f"/uploads/x/{id_}.pdf",
                        file_name=f"{id_}.pdf", category="attestations_sociales_fiscales"))
    db.commit()


def _lignes(db):
    db.expire_all()
    return {l.document_type_required: l for l in
            db.query(ChecklistItem).filter(ChecklistItem.project_id == PID).all()}


def _generer(client):
    r = client.post(f"/api/projects/{PID}/checklist/regenerate")
    assert r.status_code == 200, r.text


def _choix_de_l_utilisateur(client, db):
    _generer(client)
    l = _lignes(db)
    assert l["urssaf"].linked_document_id == "urssaf_retiree"     # choix automatique : la plus lointaine
    client.put(f"/api/projects/{PID}/checklist/{l['urssaf'].id}/link", json={"document_id": "urssaf_choisie"})
    client.patch(f"/api/projects/{PID}/checklist/{l['dc4'].id}", json={"status": "non_applicable"})
    client.patch(f"/api/projects/{PID}/checklist/{l['acte_engagement_template'].id}",
                 json={"signature_confirmed": True})
    # trame déposée et contrôlée : la DPGF remplie a des lignes sans prix
    dpgf = db.get(ChecklistItem, l["dpgf_template"].id)
    dpgf.completed_project_doc_id, dpgf.status, dpgf.details = "dpgf-remplie", "warning", "DPGF : 2 ligne(s) sans prix"
    db.commit()


def test_actualiser_garde_tous_les_choix_et_le_score(client, db_session, test_org):
    _seed(db_session, test_org.id)
    _choix_de_l_utilisateur(client, db_session)
    score_avant = client.get(f"/api/projects/{PID}/checklist/score").json()

    _generer(client)
    l = _lignes(db_session)
    assert l["urssaf"].linked_document_id == "urssaf_choisie"
    assert l["dc4"].status == "non_applicable"
    assert l["acte_engagement_template"].signature_confirmed is True
    assert l["dpgf_template"].completed_project_doc_id == "dpgf-remplie"
    assert l["dpgf_template"].status == "warning"
    assert l["dpgf_template"].details == "DPGF : 2 ligne(s) sans prix"
    assert client.get(f"/api/projects/{PID}/checklist/score").json() == score_avant


def test_un_choix_supprime_ou_expire_cede_au_choix_automatique(client, db_session, test_org):
    _seed(db_session, test_org.id)
    _choix_de_l_utilisateur(client, db_session)
    # la pièce choisie expire, puis la plus lointaine est retirée du coffre
    choisie = db_session.get(Document, "urssaf_choisie")
    choisie.expiry_date, choisie.status = TODAY - timedelta(days=1), "expired"
    db_session.get(Document, "urssaf_retiree").deleted_at = datetime.utcnow()
    db_session.commit()

    _generer(client)
    assert _lignes(db_session)["urssaf"].linked_document_id == "urssaf_auto"
