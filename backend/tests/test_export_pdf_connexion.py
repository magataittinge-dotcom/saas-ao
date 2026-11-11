"""Export PDF du mémoire : la connexion à la base est rendue AVANT la conversion LibreOffice (comme l'export Word).
Une conversion lente ne tient plus une connexion du pool. LibreOffice simulé."""
import pytest

from database import engine
from models.memoire import MemoireTechnique
from models.project import Project


@pytest.fixture(autouse=True)
def _sans_expiration(db_session):
    db_session.expire_on_commit = False


def test_la_connexion_est_rendue_avant_la_conversion_pdf(client, db_session, test_org, monkeypatch):
    import services.pdf_export as pe
    import routers.memoire as mm
    db_session.add(Project(id="p-pdf", organization_id=test_org.id, name="AO PDF"))
    db_session.add(MemoireTechnique(project_id="p-pdf", content_json={"preambule": "Texte inventé."}))
    db_session.commit()
    db_session.close()
    tenues = []

    def conversion(docx_bytes, *a, **k):
        tenues.append(engine.pool.checkedout())
        return b"%PDF-1.4 invente"
    monkeypatch.setattr(pe, "soffice_available", lambda: True)
    monkeypatch.setattr(pe, "docx_to_pdf", conversion)
    monkeypatch.setattr(mm, "build_project_memoire_docx", lambda *a, **k: b"PK docx invente")
    r = client.get("/api/projects/p-pdf/memoire/export-pdf")
    assert r.status_code == 200, r.text
    assert r.content == b"%PDF-1.4 invente"
    assert tenues == [0]
