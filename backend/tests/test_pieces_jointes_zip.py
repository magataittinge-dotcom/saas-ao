"""
Pièces du dossier — décision de Mohamed du 25/10 (export « 0/N », point 3).

  • « Jointe » se pose toute seule quand c'est un fait vérifiable : le fichier
    part dans le ZIP et il est valable et daté. On l'affiche avec son nom et sa
    date de validité. Une pièce sans date, expirée, ou dont le fichier n'est
    plus sur le serveur n'est jamais « Jointe ».
  • Un même document lié à deux lignes ne part qu'une fois dans le ZIP.
  • L'écran Export ne liste que ce que le ZIP contient vraiment (plus les
    originaux du DCE) : même plan pour le ZIP et pour l'écran.
"""
import io
import json
import zipfile
from datetime import date, timedelta

import pytest

from models.checklist_item import ChecklistItem
from models.document import Document
from models.memoire import MemoireTechnique
from models.project import Project, ProjectDocument

TODAY = date.today()


@pytest.fixture
def ws(tmp_path, monkeypatch):
    import routers.export as export_mod
    import routers.memoire as memoire_mod
    monkeypatch.setattr(export_mod, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(memoire_mod, "build_project_memoire_docx", lambda *a, **k: b"docx")
    monkeypatch.setattr(export_mod, "docx_to_pdf", lambda _b: b"%PDF-1.4 memoire")
    monkeypatch.setattr(export_mod, "soffice_available", lambda: True, raising=False)
    return tmp_path


def _fichier(ws, rel, contenu=b"%PDF-1.4 x"):
    p = ws / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(contenu)
    return f"/uploads/{rel}"


def _seed(db, org_id, ws, pid="proj-jointe"):
    db.add(Project(id=pid, organization_id=org_id, name="AO Pieces"))
    # originaux du DCE : jamais dans le ZIP
    for t, nom in (("rc", "RC.pdf"), ("ccap", "CCAP.pdf"), ("dc1_template", "DC1_vierge.pdf")):
        db.add(ProjectDocument(id=f"{pid}-{t}", project_id=pid, type=t, file_name=nom,
                               file_url=_fichier(ws, f"projects/{pid}/dce/{nom}"),
                               extracted_text="Règlement inventé." if t == "rc" else None))
    db.add(ProjectDocument(id=f"{pid}-dc1-rempli", project_id=pid, type="dc1_template",
                           file_name="DC1_rempli.pdf", is_user_completed=True,
                           file_url=_fichier(ws, f"projects/{pid}/completed/DC1_rempli.pdf")))
    coffre = {
        "kbis_ok": dict(type="kbis", status="valid", expiry_date=TODAY + timedelta(days=100)),
        "urssaf_ok": dict(type="urssaf", status="valid", expiry_date=TODAY + timedelta(days=60)),
        "qualibat_sans_date": dict(type="qualibat", status="unverified"),
        "fiscal_expiree": dict(type="fiscal", status="expired", expiry_date=TODAY - timedelta(days=5)),
        "rib_disparu": dict(type="rib", status="valid", expiry_date=TODAY + timedelta(days=90)),
    }
    for id_, kw in coffre.items():
        url = (f"/uploads/organizations/{org_id}/vault/{id_}.pdf" if id_ == "rib_disparu"   # pas sur le disque
               else _fichier(ws, f"organizations/{org_id}/vault/{id_}.pdf"))
        db.add(Document(id=id_, organization_id=org_id, file_url=url, file_name=f"{id_}.pdf",
                        category="autres", **kw))
    lignes = [
        ("l-kbis", "kbis", "vault", "kbis_ok", None, "present"),
        ("l-urssaf", "urssaf", "vault", "urssaf_ok", None, "present"),
        ("l-urssaf-bis", "attestation_travaux", "vault", "urssaf_ok", None, "present"),  # même document
        ("l-qualibat", "qualibat_rge", "vault", "qualibat_sans_date", None, "warning"),
        ("l-fiscal", "fiscal", "vault", "fiscal_expiree", None, "expire"),
        ("l-rib", "rib", "vault", "rib_disparu", None, "present"),
        ("l-dc1", "dc1_template", "dce_template", None, f"{pid}-dc1-rempli", "present"),
        ("l-dc2", "dc2_template", "dce_template", None, None, "manquant"),
    ]
    for i, (id_, type_, kind, doc, complete, statut) in enumerate(lignes):
        db.add(ChecklistItem(id=id_, project_id=pid, document_type_required=type_, source_kind=kind,
                             document_group="fournir" if kind == "vault" else "completer",
                             linked_document_id=doc, completed_project_doc_id=complete,
                             status=statut, rc_position=i, details=f"Pièce {id_}"))
    db.add(MemoireTechnique(project_id=pid, content_json={"preambule": "x"}))
    db.commit()
    return pid


def _zip(client, pid):
    r = client.get(f"/api/projects/{pid}/export/zip")
    assert r.status_code == 200, r.text
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        fichiers = [n for n in z.namelist() if not n.endswith("/")]
    racine = fichiers[0].split("/")[0]
    return [n[len(racine) + 1:] for n in fichiers], json.loads(r.headers["x-export-warnings"])


def test_un_document_lie_a_deux_lignes_ne_part_qu_une_fois(client, db_session, test_org, ws):
    pid = _seed(db_session, test_org.id, ws)
    noms, _ = _zip(client, pid)
    assert len([n for n in noms if "urssaf_ok" in n]) == 1, noms


def test_jointe_est_un_fait_verifiable(client, db_session, test_org, ws):
    pid = _seed(db_session, test_org.id, ws)
    lignes = {i["id"]: i for i in client.get(f"/api/projects/{pid}/export/detail").json()["checklist_items"]}

    assert lignes["l-kbis"]["jointe"] is True
    assert lignes["l-kbis"]["piece_nom"] == "kbis_ok.pdf"
    assert lignes["l-kbis"]["valable_jusqu_au"] == (TODAY + timedelta(days=100)).isoformat()
    assert lignes["l-urssaf"]["jointe"] and lignes["l-urssaf-bis"]["jointe"]
    assert lignes["l-urssaf-bis"]["piece_nom"] == "urssaf_ok.pdf"
    assert lignes["l-dc1"]["jointe"] is True and lignes["l-dc1"]["piece_nom"] == "DC1_rempli.pdf"
    assert lignes["l-dc1"]["valable_jusqu_au"] is None
    # sans date, expirée, fichier disparu, formulaire non déposé : jamais « Jointe »
    for id_ in ("l-qualibat", "l-fiscal", "l-rib", "l-dc2"):
        assert lignes[id_]["jointe"] is False, id_
        assert lignes[id_]["piece_nom"] is None, id_


def test_fichier_disparu_signale(client, db_session, test_org, ws):
    pid = _seed(db_session, test_org.id, ws)
    noms, avertissements = _zip(client, pid)
    assert not any("rib_disparu" in n for n in noms)
    assert any("rib_disparu.pdf" in a and "à redéposer" in a for a in avertissements), avertissements


def test_l_ecran_liste_exactement_le_contenu_du_zip(client, db_session, test_org, ws):
    pid = _seed(db_session, test_org.id, ws)
    detail = client.get(f"/api/projects/{pid}/export/detail").json()
    listees = sorted(f"{p['dossier']}/{p['nom']}" for p in detail["pieces_zip"])
    noms, _ = _zip(client, pid)
    assert listees == sorted(noms)
    # jamais les originaux du DCE
    assert not [p for p in listees if any(o in p for o in ("RC.pdf", "CCAP.pdf", "DC1_vierge"))], listees
    # le formulaire rempli peut s'ouvrir dans la visionneuse (document du projet)
    dc1 = next(p for p in detail["pieces_zip"] if "DC1_rempli" in p["nom"])
    assert dc1["document_projet_id"] == f"{pid}-dc1-rempli"
