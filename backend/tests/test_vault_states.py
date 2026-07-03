"""
Tests coffre-fort : catégories + états honnêtes.

Principe : « valide » = document reconnu ET daté, JAMAIS « fichier reçu ».
  • type reconnu + date lue     → valid / expiring_soon / expired
  • type reconnu, pas de date   → unverified (⚠️ à vérifier)
  • type non reconnu            → category + status "unclassified", jamais de
    badge de validité
  • PATCH /documents/{id}       → re-classement manuel (catégorie/type/dates),
    ownership org vérifié, statut recalculé honnêtement
"""
import io
from datetime import date, timedelta

import pytest

from models.document import Document


@pytest.fixture
def patched_vault_storage(tmp_path, monkeypatch):
    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _upload(client, filename: str, doc_type: str = "autre", expiry: str = None,
            content: bytes = b"%PDF-1.4 test"):
    data = {"type": doc_type}
    if expiry:
        data["expiry_date"] = expiry
    return client.post(
        "/api/documents",
        files={"file": (filename, content, "application/pdf")},
        data=data,
    )


# ─── Classifier unitaire ─────────────────────────────────────────────────────

def test_detect_vault_type_from_filename():
    from services.vault_classifier import detect_vault_type

    assert detect_vault_type("Attestation_URSSAF_2026.pdf") == "urssaf"
    assert detect_vault_type("attestation de vigilance mars.pdf") == "urssaf"
    assert detect_vault_type("Extrait_KBIS_societe.pdf") == "kbis"
    assert detect_vault_type("attestation décennale 2026-2027.pdf") == "decennale"
    assert detect_vault_type("RC_Pro_AXA.pdf") == "rc_civile"
    assert detect_vault_type("Certificat QUALIBAT 2026.pdf") == "qualibat"
    assert detect_vault_type("CACES R489 Dupont.pdf") == "caces"
    assert detect_vault_type("attestation régularité fiscale.pdf") == "fiscal"
    assert detect_vault_type("RIB entreprise.pdf") == "rib"
    # Non reconnu → "autre"
    assert detect_vault_type("poster_concert_2026.jpg") == "autre"
    assert detect_vault_type("IMG_4521.png") == "autre"


def test_category_mapping():
    from services.vault_classifier import category_for_type

    assert category_for_type("urssaf") == "attestations_sociales_fiscales"
    assert category_for_type("fiscal") == "attestations_sociales_fiscales"
    assert category_for_type("kbis") == "documents_legaux"
    assert category_for_type("rib") == "documents_legaux"
    assert category_for_type("decennale") == "assurances"
    assert category_for_type("rc_civile") == "assurances"
    assert category_for_type("qualibat") == "qualifications"
    assert category_for_type("caces") == "qualifications"
    assert category_for_type("chiffre_affaires") == "references_moyens"
    assert category_for_type("autre") == "autres"


def test_compute_document_status_honest():
    from services.vault_classifier import compute_document_status

    today = date.today()
    # Type reconnu + date → validité réelle
    assert compute_document_status("urssaf", today + timedelta(days=90)) == "valid"
    assert compute_document_status("urssaf", today + timedelta(days=10)) == "expiring_soon"
    assert compute_document_status("urssaf", today - timedelta(days=1)) == "expired"
    # Type reconnu SANS date → à vérifier, jamais valide
    assert compute_document_status("urssaf", None) == "unverified"
    # Type non reconnu → non classé, jamais de badge de validité
    assert compute_document_status("autre", None) == "unclassified"
    assert compute_document_status("autre", today + timedelta(days=90)) == "unclassified"


def test_legacy_compute_status_no_longer_valid_by_default():
    """Le piège d'origine : compute_status(None) retournait 'valid'."""
    from services.expiry_checker import compute_status

    assert compute_status(None) != "valid"


# ─── Upload : états honnêtes dès l'entrée ────────────────────────────────────

def test_random_image_upload_is_unclassified_never_valid(
    client, db_session, test_org, patched_vault_storage,
):
    """Un poster uploadé au coffre-fort ne doit JAMAIS afficher « valide »."""
    resp = _upload(client, "poster_concert.pdf")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "unclassified"
    assert body["category"] == "unclassified"


def test_urssaf_with_date_is_valid_with_expiry(
    client, db_session, test_org, patched_vault_storage,
):
    expiry = (date.today() + timedelta(days=120)).isoformat()
    resp = _upload(client, "Attestation_URSSAF_T1_2026.pdf", expiry=expiry)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["type"] == "urssaf"                     # auto-classé
    assert body["category"] == "attestations_sociales_fiscales"
    assert body["status"] == "valid"
    assert body["expiry_date"] == expiry


def test_recognized_type_without_date_is_unverified(
    client, db_session, test_org, patched_vault_storage,
):
    resp = _upload(client, "Extrait_KBIS.pdf")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["type"] == "kbis"
    assert body["status"] == "unverified"
    assert body["category"] == "documents_legaux"


def test_explicit_type_from_form_is_kept(
    client, db_session, test_org, patched_vault_storage,
):
    """Un type explicitement fourni par le front prime sur la détection."""
    expiry = (date.today() + timedelta(days=200)).isoformat()
    resp = _upload(client, "document_scanne_001.pdf", doc_type="decennale", expiry=expiry)
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "decennale"
    assert body["category"] == "assurances"
    assert body["status"] == "valid"


# ─── PATCH : re-classement manuel ────────────────────────────────────────────

def test_manual_reclassification_persists(
    client, db_session, test_org, patched_vault_storage,
):
    resp = _upload(client, "scan_sans_nom.pdf")
    doc_id = resp.json()["id"]
    assert resp.json()["status"] == "unclassified"

    expiry = (date.today() + timedelta(days=300)).isoformat()
    patch = client.patch(f"/api/documents/{doc_id}", json={
        "type": "decennale",
        "expiry_date": expiry,
    })
    assert patch.status_code == 200, patch.text
    body = patch.json()
    assert body["type"] == "decennale"
    assert body["category"] == "assurances"
    assert body["status"] == "valid"

    # Persisté en base
    doc = db_session.query(Document).filter(Document.id == doc_id).first()
    assert doc.type == "decennale"
    assert doc.category == "assurances"
    assert doc.status == "valid"


def test_manual_reclassification_without_date_is_unverified(
    client, db_session, test_org, patched_vault_storage,
):
    resp = _upload(client, "scan_002.pdf")
    doc_id = resp.json()["id"]

    patch = client.patch(f"/api/documents/{doc_id}", json={"type": "qualibat"})
    assert patch.status_code == 200
    assert patch.json()["status"] == "unverified"
    assert patch.json()["category"] == "qualifications"


def test_patch_rejects_unknown_type(client, db_session, test_org, patched_vault_storage):
    resp = _upload(client, "scan_003.pdf")
    doc_id = resp.json()["id"]

    patch = client.patch(f"/api/documents/{doc_id}", json={"type": "nimporte_quoi"})
    assert patch.status_code == 422


def test_patch_cross_org_404(client, db_session, test_org, patched_vault_storage):
    from models.organization import Organization

    other = Organization(id="org-vault-other", name="Autre")
    db_session.add(other)
    db_session.flush()
    doc = Document(
        organization_id="org-vault-other", type="urssaf",
        file_url="/uploads/organizations/org-vault-other/vault/x.pdf",
        file_name="x.pdf", status="unverified", category="attestations_sociales_fiscales",
    )
    db_session.add(doc)
    db_session.commit()

    patch = client.patch(f"/api/documents/{doc.id}", json={"type": "kbis"})
    assert patch.status_code == 404
    db_session.refresh(doc)
    assert doc.type == "urssaf"


# ─── Job de refresh : ne re-valide jamais tout seul ──────────────────────────

def test_refresh_statuses_keeps_honest_states(client, db_session, test_org, patched_vault_storage):
    from services.expiry_checker import refresh_organization_statuses

    _upload(client, "poster.pdf")                      # unclassified
    _upload(client, "Extrait_KBIS.pdf")                # unverified (pas de date)
    expiry = (date.today() + timedelta(days=5)).isoformat()
    _upload(client, "Attestation_URSSAF.pdf", expiry=expiry)  # expiring_soon

    refresh_organization_statuses(test_org.id, db_session)

    statuses = {
        d.file_name: d.status
        for d in db_session.query(Document).filter(
            Document.organization_id == test_org.id,
        ).all()
    }
    assert statuses["poster.pdf"] == "unclassified"
    assert statuses["Extrait_KBIS.pdf"] == "unverified"
    assert statuses["Attestation_URSSAF.pdf"] == "expiring_soon"
