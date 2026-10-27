"""Une page source absente est stockée à NULL, pas à 1 (sujet A) : sinon l'écran dirait
« Page citée par l'analyse » pour une page que l'analyse n'a jamais citée."""
import pytest

from models.compliance_item import ComplianceItem
from models.project import Project
from routers.analysis import _persist_scope


@pytest.mark.parametrize("valeur, attendu", [
    (None, None), (0, None), ("", None), (-3, None), ("abc", None),
    (4, 4), ("7", 7), (True, None),
])
def test_page_source_absente_ou_invalide_est_null(db_session, test_org, valeur, attendu):
    db_session.add(Project(id="p-page", organization_id=test_org.id, name="X"))
    db_session.commit()
    req = {"exigence": "Fournir un Kbis", "source_document": "RC", "source_excerpt": "Kbis",
           "category": "candidature", "priority": "obligatoire"}
    if valeur is not None:
        req["source_page"] = valeur
    _persist_scope(db_session, "p-page", [req], "_commun")
    ligne = db_session.query(ComplianceItem).filter_by(project_id="p-page").one()
    assert ligne.source_page == attendu


def test_une_exigence_sans_page_passe_par_l_api_et_l_export(client, db_session, test_org):
    db_session.add(Project(id="p-page2", organization_id=test_org.id, name="X"))
    db_session.commit()
    _persist_scope(db_session, "p-page2", [{"exigence": "Fournir un Kbis", "source_document": "RC",
                                            "category": "candidature"}], "_commun")
    reponse = client.get("/api/projects/p-page2/compliance")
    assert reponse.status_code == 200
    assert reponse.json()[0]["source_page"] is None
