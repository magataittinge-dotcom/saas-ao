"""
« Qualibat/RGE » sans erreur 500 (B2 §7 n°4, nuit du 25/10).

Depuis la modale « Choisir une pièce », « Téléverser un fichier » envoie le
type de la LIGNE de checklist (typologie des pièces, ex. « qualibat_rge »),
qui n'est pas un type du coffre : la contrainte CHECK refusait l'insertion
(erreur 500) APRÈS le stockage du fichier, resté orphelin. Maintenant : le
type de la pièce est traduit en type du coffre, un type inconnu laisse le
classement au nom du fichier, et une date illisible est refusée (422) avant
tout stockage.
"""
import pytest

from models.document import DOCUMENT_TYPES


@pytest.fixture
def coffre(tmp_path, monkeypatch):
    import services.file_storage as fs_mod
    monkeypatch.setattr(fs_mod, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _deposer(client, nom, type_, **dates):
    return client.post(
        "/api/documents",
        files={"file": (nom, b"%PDF-1.4 piece inventee", "application/pdf")},
        data={"type": type_, **dates},
    )


def test_qualibat_rge_devient_un_type_du_coffre(client, coffre):
    r = _deposer(client, "certificat.pdf", "qualibat_rge")
    assert r.status_code in (200, 201), r.text
    assert r.json()["type"] == "qualibat"
    assert r.json()["category"] == "qualifications"


def test_qualibat_rge_reconnu_rge_par_le_nom(client, coffre):
    r = _deposer(client, "Attestation RGE 2026.pdf", "qualibat_rge")
    assert r.status_code in (200, 201), r.text
    assert r.json()["type"] == "rge"


@pytest.mark.parametrize("type_ligne,attendu", [
    ("dc1_template", "autre"),            # trame du DCE, pas une pièce du coffre
    ("attestation_visite", "autre"),
    ("pas_un_type", "autre"),
    ("declaration_honneur", "declaration_honneur"),   # type du coffre : gardé
])
def test_type_de_ligne_jamais_en_erreur_500(client, coffre, type_ligne, attendu):
    r = _deposer(client, "piece.pdf", type_ligne)
    assert r.status_code in (200, 201), r.text
    assert r.json()["type"] == attendu and r.json()["type"] in DOCUMENT_TYPES


@pytest.mark.parametrize("dates", [{"expiry_date": "31/12/2026"}, {"issued_date": "hier"}])
def test_date_illisible_422_sans_fichier_stocke(client, coffre, dates):
    r = _deposer(client, "kbis.pdf", "kbis", **dates)
    assert r.status_code == 422, r.text
    assert not [f for f in coffre.rglob("*") if f.is_file()]
