"""
B1 élargi — jamais une pièce expirée ou supprimée (revue backend B1 ;
notes nuit-25-10 B2 §7 n°1).

  • Choix automatique d'une pièce du coffre (génération de la checklist) :
    une pièce encore valable passe toujours devant une expirée ; un document
    supprimé du coffre (deleted_at) n'est jamais choisi ; une date de fin
    dépassée compte même si le statut stocké n'a pas encore été rafraîchi
    (job quotidien tasks/check_expiry).
  • Lier à la main un document supprimé du coffre → 404.
  • Export ZIP : aucune pièce expirée ou supprimée dans le dossier
    (01_Candidature et 3_ANNEXES), chaque pièce écartée est signalée.
"""
import io
import json
import zipfile
from datetime import date, datetime, timedelta

import pytest

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.document import Document
from models.memoire import MemoireTechnique
from models.project import Project

TODAY = date.today()


def _doc(db, org_id, id_, *, type_="urssaf", status="valid", expiry=None, issued=None,
         deleted=False, file_url=None, uploaded_at=None):
    d = Document(
        id=id_, organization_id=org_id, type=type_,
        file_url=file_url or f"/uploads/organizations/{org_id}/vault/{id_}.pdf",
        file_name=f"{id_}.pdf", status=status, expiry_date=expiry, issued_date=issued,
        category="attestations_sociales_fiscales",
        deleted_at=datetime.utcnow() if deleted else None,
        uploaded_at=uploaded_at or datetime.utcnow(),
    )
    db.add(d)
    db.commit()
    return d


def _projet_urssaf(db, org_id, pid="proj-b1"):
    db.add(Project(id=pid, organization_id=org_id, name="AO B1"))
    db.add(ComplianceItem(
        project_id=pid, exigence_text="Fournir une attestation de vigilance URSSAF",
        category="candidature", priority="obligatoire", status="non_couvert", lot="_commun",
    ))
    db.commit()
    return pid


def _ligne_urssaf(db, pid):
    db.expire_all()
    return db.query(ChecklistItem).filter(
        ChecklistItem.project_id == pid,
        ChecklistItem.document_type_required == "urssaf",
    ).one()


def _generer(db, pid, org_id):
    from services.checklist_builder import generate_checklist_from_db
    generate_checklist_from_db(db, pid, org_id)
    return _ligne_urssaf(db, pid)


# ─── Choix automatique (génération de la checklist) ─────────────────────────

@pytest.mark.parametrize("expiree_en_premier", [True, False])
def test_choix_auto_prend_la_valable_jamais_l_expiree(db_session, test_org, expiree_en_premier):
    pid = _projet_urssaf(db_session, test_org.id)
    pieces = [
        ("urssaf_expiree", "expired", TODAY - timedelta(days=30)),
        ("urssaf_valable", "valid", TODAY + timedelta(days=120)),
    ]
    if not expiree_en_premier:
        pieces.reverse()
    for id_, statut, fin in pieces:
        _doc(db_session, test_org.id, id_, status=statut, expiry=fin)

    ligne = _generer(db_session, pid, test_org.id)
    assert ligne.linked_document_id == "urssaf_valable"
    assert ligne.status == "present"


def test_choix_auto_ignore_un_document_supprime(db_session, test_org):
    pid = _projet_urssaf(db_session, test_org.id)
    _doc(db_session, test_org.id, "urssaf_valable", expiry=TODAY + timedelta(days=120))
    # supprimée du coffre, avec une date de fin plus lointaine : ne doit pas gagner
    _doc(db_session, test_org.id, "urssaf_supprimee", expiry=TODAY + timedelta(days=300), deleted=True)

    ligne = _generer(db_session, pid, test_org.id)
    assert ligne.linked_document_id == "urssaf_valable"


def test_choix_auto_seul_un_document_supprime_rien_n_est_lie(db_session, test_org):
    pid = _projet_urssaf(db_session, test_org.id)
    _doc(db_session, test_org.id, "urssaf_supprimee", expiry=TODAY + timedelta(days=300), deleted=True)

    ligne = _generer(db_session, pid, test_org.id)
    assert ligne.linked_document_id is None
    assert ligne.status == "manquant"


def test_date_de_fin_depassee_compte_meme_si_le_statut_n_est_pas_rafraichi(db_session, test_org):
    """Statut stocké « valid » (le job quotidien n'est pas encore passé) mais
    date de fin hier : la pièce est expirée, une pièce sans date passe devant."""
    pid = _projet_urssaf(db_session, test_org.id)
    _doc(db_session, test_org.id, "urssaf_perimee", status="valid", expiry=TODAY - timedelta(days=1))
    _doc(db_session, test_org.id, "urssaf_sans_date", status="unverified")

    ligne = _generer(db_session, pid, test_org.id)
    assert ligne.linked_document_id == "urssaf_sans_date"
    assert ligne.status == "warning"


def test_seule_une_piece_perimee_la_ligne_dit_expire(db_session, test_org):
    pid = _projet_urssaf(db_session, test_org.id)
    _doc(db_session, test_org.id, "urssaf_perimee", status="valid", expiry=TODAY - timedelta(days=1))

    ligne = _generer(db_session, pid, test_org.id)
    assert ligne.linked_document_id == "urssaf_perimee"
    assert ligne.status == "expire"


def test_validite_derivee_de_la_date_d_emission(db_session, test_org):
    """C11 — URSSAF sans date de fin explicite : 6 mois après l'émission
    (Code du travail D8222-5, « datant de moins de six mois »)."""
    pid = _projet_urssaf(db_session, test_org.id)
    _doc(db_session, test_org.id, "urssaf_ancienne", status="valid", issued=TODAY - timedelta(days=200))
    _doc(db_session, test_org.id, "urssaf_recente", status="valid", issued=TODAY - timedelta(days=10))

    ligne = _generer(db_session, pid, test_org.id)
    assert ligne.linked_document_id == "urssaf_recente"
    assert ligne.status == "present"


def test_pick_best_regles_pures():
    from services.ai.checklist_matcher import _pick_best_vault_doc

    def d(id_, **kw):
        return Document(id=id_, organization_id="o", type=kw.pop("type_", "urssaf"),
                        file_url="/x", file_name=id_, **kw)

    valable = d("valable", status="valid", expiry_date=TODAY + timedelta(days=90))
    expiree = d("expiree", status="expired", expiry_date=TODAY - timedelta(days=5))
    ancienne = d("ancienne", status="expired", expiry_date=TODAY - timedelta(days=400))
    sans_date = d("sans_date", status="unverified")
    supprimee = d("supprimee", status="valid", expiry_date=TODAY + timedelta(days=900),
                  deleted_at=datetime.utcnow())

    assert _pick_best_vault_doc([expiree, valable]).id == "valable"
    assert _pick_best_vault_doc([valable, expiree]).id == "valable"
    assert _pick_best_vault_doc([ancienne, expiree]).id == "expiree"   # la moins périmée
    assert _pick_best_vault_doc([expiree, sans_date]).id == "sans_date"
    assert _pick_best_vault_doc([supprimee, valable]).id == "valable"
    assert _pick_best_vault_doc([supprimee]) is None


# ─── Lien manuel ────────────────────────────────────────────────────────────

def test_lier_un_document_supprime_est_refuse(client, db_session, test_org):
    pid = _projet_urssaf(db_session, test_org.id)
    ligne = _generer(db_session, pid, test_org.id)
    _doc(db_session, test_org.id, "urssaf_supprimee", expiry=TODAY + timedelta(days=90), deleted=True)

    r = client.put(f"/api/projects/{pid}/checklist/{ligne.id}/link",
                   json={"document_id": "urssaf_supprimee"})
    assert r.status_code == 404, r.text
    assert _ligne_urssaf(db_session, pid).linked_document_id is None


def test_lier_une_piece_perimee_la_ligne_dit_expire(client, db_session, test_org):
    pid = _projet_urssaf(db_session, test_org.id)
    ligne = _generer(db_session, pid, test_org.id)
    _doc(db_session, test_org.id, "urssaf_perimee", status="valid", expiry=TODAY - timedelta(days=1))

    r = client.put(f"/api/projects/{pid}/checklist/{ligne.id}/link",
                   json={"document_id": "urssaf_perimee"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "expire"


# ─── Export ZIP ─────────────────────────────────────────────────────────────

@pytest.fixture
def workspace(tmp_path, monkeypatch):
    import routers.export as export_mod
    monkeypatch.setattr(export_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _piece_sur_disque(db, workspace, org_id, id_, **kw):
    path = workspace / "organizations" / org_id / "vault" / f"{id_}.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"%PDF-1.4 " + id_.encode())
    return _doc(db, org_id, id_, file_url=f"/uploads/organizations/{org_id}/vault/{id_}.pdf", **kw)


def _zip(client, pid):
    r = client.get(f"/api/projects/{pid}/export/zip")
    assert r.status_code == 200, r.text
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        noms = [n for n in z.namelist() if not n.endswith("/")]
    return noms, json.loads(r.headers["x-export-warnings"])


def test_zip_n_embarque_jamais_une_piece_expiree(client, db_session, test_org, workspace):
    pid = "proj-b1-zip"
    db_session.add(Project(id=pid, organization_id=test_org.id, name="AO B1 ZIP"))
    pieces = {
        "kbis_valable": dict(type_="kbis", status="valid", expiry=TODAY + timedelta(days=40)),
        "urssaf_expiree": dict(status="expired", expiry=TODAY - timedelta(days=10)),
        # statut stocké pas encore rafraîchi, date de fin hier
        "fiscal_perimee": dict(type_="fiscal", status="valid", expiry=TODAY - timedelta(days=1)),
    }
    for i, (id_, kw) in enumerate(pieces.items()):
        _piece_sur_disque(db_session, workspace, test_org.id, id_, **kw)
        db_session.add(ChecklistItem(
            project_id=pid, document_type_required=kw.get("type_", "urssaf"), source_kind="vault",
            linked_document_id=id_, status="present", rc_position=i,
        ))
    db_session.commit()

    noms, avertissements = _zip(client, pid)
    candidature = [n for n in noms if "/01_Candidature/" in n]
    assert any("kbis_valable" in n for n in candidature), noms
    assert not any("urssaf_expiree" in n for n in noms), noms
    assert not any("fiscal_perimee" in n for n in noms), noms
    texte = " | ".join(avertissements)
    assert "urssaf_expiree" in texte and "fiscal_perimee" in texte, avertissements
    assert "renouveler" in texte, avertissements


def test_zip_n_embarque_jamais_une_piece_supprimee(client, db_session, test_org, workspace):
    pid = "proj-b1-zip-suppr"
    db_session.add(Project(id=pid, organization_id=test_org.id, name="AO B1 ZIP"))
    _piece_sur_disque(db_session, workspace, test_org.id, "urssaf_supprimee",
                      expiry=TODAY + timedelta(days=90), deleted=True)
    db_session.add(ChecklistItem(
        project_id=pid, document_type_required="urssaf", source_kind="vault",
        linked_document_id="urssaf_supprimee", status="present", rc_position=0,
    ))
    db_session.commit()

    noms, _ = _zip(client, pid)
    assert not any("urssaf_supprimee" in n for n in noms), noms


def test_zip_annexes_sans_piece_expiree(client, db_session, test_org, workspace, monkeypatch):
    """3_ANNEXES (pièces cochées au pré-vol) : même règle que la candidature."""
    import routers.memoire as memoire_mod
    import routers.export as export_mod
    from services.pdf_export import PdfConversionError

    monkeypatch.setattr(memoire_mod, "build_project_memoire_docx", lambda *a, **k: b"docx")

    def _pas_de_pdf(_):
        raise PdfConversionError("indisponible en test")

    monkeypatch.setattr(export_mod, "docx_to_pdf", _pas_de_pdf)

    pid = "proj-b1-annexes"
    db_session.add(Project(id=pid, organization_id=test_org.id, name="AO B1 annexes"))
    _piece_sur_disque(db_session, workspace, test_org.id, "qualibat_valable",
                      type_="qualibat", expiry=TODAY + timedelta(days=200))
    _piece_sur_disque(db_session, workspace, test_org.id, "qualibat_expiree",
                      type_="qualibat", status="expired", expiry=TODAY - timedelta(days=3))
    db_session.add(MemoireTechnique(
        project_id=pid, content_json={"preambule": "x"},
        variables={"annexe_document_ids": ["qualibat_valable", "qualibat_expiree"]},
    ))
    db_session.commit()

    noms, avertissements = _zip(client, pid)
    annexes = [n for n in noms if "/3_ANNEXES/" in n]
    assert any("qualibat_valable" in n for n in annexes), noms
    assert not any("qualibat_expiree" in n for n in noms), noms
    assert any("qualibat_expiree" in a for a in avertissements), avertissements
