"""S2.4 — durcissement de l'upload coffre-fort (audit passe 2, 🟠).

Avant : `POST /api/documents` faisait `content = await file.read()` (tout le
fichier en mémoire, AUCUN cap → DoS mémoire), n'imposait aucune extension et ne
vérifiait pas le type réel du contenu (un .exe renommé .pdf entrait au coffre).

On prouve (rouge→vert) :
  1. cap de taille appliqué EN STREAMING (413 au-delà) ;
  2. extension hors liste blanche refusée (415 depuis B8, comme tous les dépôts) ;
  3. contenu ne correspondant pas à l'extension (magic bytes) refusé (415) ;
  4. un vrai PDF passe toujours (contrôle positif) ;
  5. B8 : le coffre passe par l'utilitaire commun, copie faite hors de la boucle.
Plus des tests unitaires du renifleur de type.
"""
import pytest

from services import upload_validation as uv


@pytest.fixture
def patched_vault_storage(tmp_path, monkeypatch):
    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _upload(client, filename, content, content_type="application/octet-stream", doc_type="autre"):
    return client.post(
        "/api/documents",
        files={"file": (filename, content, content_type)},
        data={"type": doc_type},
    )


# ── 1. cap de taille (streaming) ─────────────────────────────────────────────

def test_oversize_upload_rejected_413(client, patched_vault_storage, monkeypatch):
    # Cap ramené à 10 octets pour ne pas envoyer un vrai gros fichier.
    monkeypatch.setattr(uv, "VAULT_MAX_UPLOAD_SIZE", 10)
    resp = _upload(client, "gros.pdf", b"%PDF-1.4 " + b"A" * 100, "application/pdf")
    assert resp.status_code == 413, resp.text


# ── 2. extension hors liste blanche ──────────────────────────────────────────

def test_disallowed_extension_rejected(client, patched_vault_storage):
    resp = _upload(client, "malware.exe", b"MZ\x90\x00 fake exe", "application/octet-stream")
    assert resp.status_code == 415, resp.text


def test_zip_extension_rejected_from_vault(client, patched_vault_storage):
    # Le coffre reçoit des documents unitaires, jamais des archives.
    resp = _upload(client, "archive.zip", b"PK\x03\x04 fake zip", "application/zip")
    assert resp.status_code == 415, resp.text


# ── 3. magic bytes : contenu ≠ extension ─────────────────────────────────────

def test_content_not_matching_extension_rejected(client, patched_vault_storage):
    # Un exécutable renommé .pdf : l'extension est autorisée mais le contenu
    # (magic bytes) ne correspond pas → refus.
    resp = _upload(client, "innocent.pdf", b"MZ\x90\x00 this is a PE binary", "application/pdf")
    assert resp.status_code == 415, resp.text


# ── 4. contrôle positif : un vrai PDF passe ──────────────────────────────────

def test_valid_pdf_still_accepted(client, patched_vault_storage):
    resp = _upload(client, "Extrait_KBIS.pdf", b"%PDF-1.4 vrai contenu PDF", "application/pdf")
    assert resp.status_code == 200, resp.text


def test_valid_png_accepted(client, patched_vault_storage):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    resp = _upload(client, "scan.png", png, "image/png")
    assert resp.status_code == 200, resp.text


# ── 5. B8 : utilitaire commun, copie hors de la boucle ───────────────────────

def test_vault_copy_runs_off_event_loop(client, patched_vault_storage, monkeypatch):
    import asyncio

    lieux = []
    copier = uv.copie_plafonnee

    def _sonde(source, plafond):
        try:
            asyncio.get_running_loop()
            lieux.append("boucle")
        except RuntimeError:
            lieux.append("thread")
        return copier(source, plafond)

    monkeypatch.setattr(uv, "copie_plafonnee", _sonde)
    resp = _upload(client, "Extrait_KBIS.pdf", b"%PDF-1.4 vrai contenu PDF", "application/pdf")
    assert resp.status_code == 200, resp.text
    assert lieux == ["thread"]
    on_disk = patched_vault_storage / resp.json()["file_url"].removeprefix("/uploads/")
    assert on_disk.read_bytes() == b"%PDF-1.4 vrai contenu PDF"


# ── Unitaires : renifleur de type ────────────────────────────────────────────

def test_sniff_matches_extension_positive():
    assert uv.sniff_matches_extension(b"%PDF-1.7 ...", ".pdf")
    assert uv.sniff_matches_extension(b"\x89PNG\r\n\x1a\n....", ".png")
    assert uv.sniff_matches_extension(b"\xff\xd8\xff\xe0....", ".jpg")
    assert uv.sniff_matches_extension(b"PK\x03\x04....", ".docx")
    assert uv.sniff_matches_extension(b"PK\x03\x04....", ".xlsx")
    assert uv.sniff_matches_extension(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", ".doc")


def test_sniff_matches_extension_negative():
    assert not uv.sniff_matches_extension(b"MZ\x90\x00 PE", ".pdf")
    assert not uv.sniff_matches_extension(b"not a png", ".png")
    assert not uv.sniff_matches_extension(b"%PDF-1.7", ".png")
    assert not uv.sniff_matches_extension(b"whatever", ".exe")  # ext non gérée


def test_extension_of():
    assert uv.extension_of("Facture_2026.PDF") == ".pdf"
    assert uv.extension_of("archive.tar.gz") == ".gz"
    assert uv.extension_of("sans_extension") == ""
