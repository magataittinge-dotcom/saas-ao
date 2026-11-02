"""Dépôt d'un formulaire ou d'une DPGF remplis au format .ods ou .xlsm (décision 5 du 2/11) :
le serveur les lit depuis 4152bc1, la route de dépôt les accepte ; le contrôle du contenu réel reste en place."""
import pytest

from tests.test_candidature_upload import _make_dce_item, _make_project, _make_template

ZIP = b"PK\x03\x04" + b"\x00" * 60     # entête d'archive : OpenDocument et OOXML sont des ZIP


@pytest.mark.parametrize("nom", ["DPGF_remplie.ods", "DPGF_remplie.xlsm"])
def test_upload_completed_accepte_ods_et_xlsm(client, db_session, test_org, tmp_path, monkeypatch, nom):
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)
    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "dpgf_template")
    item = _make_dce_item(db_session, project, tpl, item_id="cli-dpgf")
    r = client.post(f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
                    files={"file": (nom, ZIP, "application/octet-stream")})
    assert r.status_code == 200, r.text
    # reçue et rattachée à la ligne ; la vérification formelle d'une DPGF illisible (archive vide) la met « à vérifier »
    assert r.json()["status"] in ("present", "warning")
    assert r.json()["completed_project_doc_id"]


@pytest.mark.parametrize("nom", ["faux.ods", "faux.xlsm"])
def test_upload_completed_refuse_un_ods_ou_xlsm_qui_n_est_pas_une_archive(
        client, db_session, test_org, tmp_path, monkeypatch, nom):
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)
    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "dpgf_template")
    item = _make_dce_item(db_session, project, tpl, item_id="cli-dpgf")
    r = client.post(f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
                    files={"file": (nom, b"%PDF-1.4 pas une archive", "application/octet-stream")})
    assert r.status_code == 415


def test_le_message_des_formats_annonce_ods_et_xlsm(client, db_session, test_org, tmp_path, monkeypatch):
    import routers.candidature as candidature_mod
    monkeypatch.setattr(candidature_mod, "UPLOADS_ROOT", tmp_path)
    project = _make_project(db_session, test_org)
    tpl = _make_template(db_session, project, "dc1_template")
    item = _make_dce_item(db_session, project, tpl)
    r = client.post(f"/api/projects/{project.id}/checklist/{item.id}/upload-completed",
                    files={"file": ("evil.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415
    assert "XLSM" in r.json()["detail"] and "ODS" in r.json()["detail"]
