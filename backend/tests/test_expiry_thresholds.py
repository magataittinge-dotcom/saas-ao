"""
Tests C11 — seuils de validité par type de document.

  • URSSAF / fiscale / PRO BTP / CIBTP : valables 6 mois après émission
  • KBIS : valable 3 mois après émission
  • Assurances (décennale, RC pro…) : date de fin de validité explicite
  • États : valid / expiring_soon (≤ 30 j) / expired — par type
  • Une date de fin explicite prime toujours sur la dérivation
  • Ni date d'émission ni date de fin → unverified (jamais « valid »)
"""
from datetime import date, timedelta

from models.document import Document


TODAY = date.today()


def _status(doc_type, issued=None, expiry=None):
    from services.vault_classifier import compute_document_status
    return compute_document_status(doc_type, expiry, issued_date=issued)


# ─── Attestations sociales/fiscales : 6 mois après émission ──────────────────

def test_urssaf_six_months_rule():
    assert _status("urssaf", issued=TODAY - timedelta(days=60)) == "valid"
    # Émise il y a ~5,5 mois → expire dans < 30 j
    assert _status("urssaf", issued=TODAY - timedelta(days=160)) == "expiring_soon"
    assert _status("urssaf", issued=TODAY - timedelta(days=200)) == "expired"


def test_all_social_fiscal_types_share_six_months():
    for t in ("urssaf", "fiscal", "pro_btp", "cibtp"):
        assert _status(t, issued=TODAY - timedelta(days=60)) == "valid", t
        assert _status(t, issued=TODAY - timedelta(days=200)) == "expired", t


# ─── KBIS : 3 mois après émission ────────────────────────────────────────────

def test_kbis_three_months_rule():
    assert _status("kbis", issued=TODAY - timedelta(days=10)) == "valid"
    assert _status("kbis", issued=TODAY - timedelta(days=80)) == "expiring_soon"
    assert _status("kbis", issued=TODAY - timedelta(days=100)) == "expired"


# ─── Assurances : date de fin explicite uniquement ───────────────────────────

def test_insurance_uses_explicit_expiry_only():
    assert _status("decennale", expiry=TODAY + timedelta(days=200)) == "valid"
    assert _status("decennale", expiry=TODAY + timedelta(days=10)) == "expiring_soon"
    assert _status("rc_civile", expiry=TODAY - timedelta(days=1)) == "expired"
    # Pas de dérivation depuis l'émission pour une assurance
    assert _status("decennale", issued=TODAY - timedelta(days=10)) == "unverified"


# ─── Règles générales ────────────────────────────────────────────────────────

def test_explicit_expiry_overrides_derivation():
    """Une URSSAF émise il y a 7 mois MAIS avec une fin explicite future
    reste valide : la date explicite prime."""
    assert _status(
        "urssaf",
        issued=TODAY - timedelta(days=210),
        expiry=TODAY + timedelta(days=90),
    ) == "valid"


def test_no_dates_is_unverified_never_valid():
    for t in ("urssaf", "kbis", "decennale", "qualibat"):
        assert _status(t) == "unverified", t


def test_unrecognized_type_stays_unclassified():
    assert _status("autre", issued=TODAY - timedelta(days=10)) == "unclassified"


# ─── Job de refresh : dérivation appliquée aussi ─────────────────────────────

def test_refresh_applies_type_thresholds(db_session, test_org):
    from services.expiry_checker import refresh_organization_statuses

    stale = Document(
        organization_id=test_org.id, type="urssaf",
        category="attestations_sociales_fiscales",
        file_url="/uploads/organizations/x/vault/u.pdf", file_name="urssaf.pdf",
        issued_date=TODAY - timedelta(days=200),
        status="valid",  # état mensonger hérité
    )
    fresh_kbis = Document(
        organization_id=test_org.id, type="kbis", category="documents_legaux",
        file_url="/uploads/organizations/x/vault/k.pdf", file_name="kbis.pdf",
        issued_date=TODAY - timedelta(days=10),
        status="unverified",
    )
    db_session.add_all([stale, fresh_kbis])
    db_session.commit()

    refresh_organization_statuses(test_org.id, db_session)

    db_session.refresh(stale)
    db_session.refresh(fresh_kbis)
    assert stale.status == "expired"
    assert fresh_kbis.status == "valid"


# ─── Endpoint : upload avec date d'émission seule ────────────────────────────

def test_upload_urssaf_with_issued_date_only_is_valid(client, db_session, test_org, tmp_path, monkeypatch):
    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)

    issued = (TODAY - timedelta(days=30)).isoformat()
    resp = client.post(
        "/api/documents",
        files={"file": ("Attestation_URSSAF.pdf", b"%PDF-1.4", "application/pdf")},
        data={"type": "urssaf", "issued_date": issued},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "valid"  # 6 mois de validité dérivés
