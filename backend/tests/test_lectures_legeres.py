"""Lectures plus légères (nuit du 23/10).

Mesuré sur l'AO de Gueux (93 pièces, 3,3 M caractères de texte extrait) :
GET /documents 61 → 22 ms, export/detail 98 → 58 ms, export/summary 88 → 40 ms.
- le texte extrait n'est plus lu quand il n'est pas renvoyé ni utilisé ;
- les pièces du coffre liées à la checklist sont lues en UNE requête (avant : une par ligne),
  toujours filtrées par organisation.
"""
from sqlalchemy import event

from database import engine
from models.checklist_item import ChecklistItem
from models.document import Document
from models.organization import Organization
from models.project import Project, ProjectDocument


def _ao(db, org_id, pid, nb_pieces=3):
    db.add(Project(id=pid, organization_id=org_id, name="AO test", current_step=4))
    for i in range(nb_pieces):
        db.add(ProjectDocument(
            id=f"{pid}-doc{i}", project_id=pid, type="rc" if i == 0 else "cctp",
            file_url=f"/uploads/projects/{pid}/dce/piece{i}.pdf", file_name=f"piece{i}.pdf",
            extracted_text=("TEXTE_EXTRAIT_LOURD " * 2000) if i else "Règlement de la consultation. " * 10,
        ))
    db.commit()


class _Requetes:
    def __init__(self):
        self.sql: list[str] = []

    def __enter__(self):
        event.listen(engine, "before_cursor_execute", self._noter)
        return self

    def __exit__(self, *a):
        event.remove(engine, "before_cursor_execute", self._noter)

    def _noter(self, conn, cursor, statement, *a):
        self.sql.append(statement)


def test_la_liste_des_documents_ne_lit_pas_le_texte_extrait(client, db_session, test_org):
    _ao(db_session, test_org.id, "proj-liste")
    with _Requetes() as r:
        resp = client.get("/api/projects/proj-liste/documents")
    assert resp.status_code == 200
    assert len(resp.json()) == 3
    lectures = [s for s in r.sql if "FROM project_documents" in s]
    assert lectures and not any("extracted_text" in s for s in lectures)


def test_export_une_requete_pour_toutes_les_pieces_liees(client, db_session, test_org):
    _ao(db_session, test_org.id, "proj-exp")
    db_session.add(Organization(id="org-autre", name="Autre"))
    for i in range(6):
        db_session.add(Document(id=f"vault-{i}", organization_id=test_org.id, type="kbis",
                                file_url=f"/uploads/organizations/{test_org.id}/k{i}.pdf", file_name=f"piece-{i}.pdf"))
        db_session.add(ChecklistItem(id=f"ci-{i}", project_id="proj-exp", document_type_required="kbis",
                                     source_kind="vault", linked_document_id=f"vault-{i}", status="present"))
    # une pièce d'une autre organisation, liée par un identifiant périmé : jamais exposée
    db_session.add(Document(id="vault-autre", organization_id="org-autre", type="kbis",
                            file_url="/uploads/organizations/org-autre/x.pdf", file_name="SECRET_AUTRE_ORG.pdf"))
    db_session.add(ChecklistItem(id="ci-autre", project_id="proj-exp", document_type_required="kbis",
                                 source_kind="vault", linked_document_id="vault-autre", status="present"))
    db_session.commit()

    with _Requetes() as r:
        resp = client.get("/api/projects/proj-exp/export/detail")
    assert resp.status_code == 200, resp.text
    noms = {c["linked_document_name"] for c in resp.json()["checklist_items"]}
    assert noms == {f"piece-{i}.pdf" for i in range(6)} | {None}
    assert "SECRET_AUTRE_ORG" not in resp.text
    assert sum(1 for s in r.sql if "FROM documents" in s) == 1
    # textes extraits non lus en bloc (seul celui du RC, à la demande)
    assert not any("extracted_text" in s and "project_documents.project_id" in s for s in r.sql)
