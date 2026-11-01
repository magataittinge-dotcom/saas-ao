"""Fiches « Mon entreprise » (T2) : le logo.

Accepté : PNG et JPEG, jugés par leur CONTENU (Pillow), réencodés en WebP (image recréée, métadonnées
perdues, 512 px au plus), 2 Mo au plus. Refusé : SVG, fichier renommé, image tronquée, bombe de décompression.
Stockage hors webroot sous un nom aléatoire ; service par URL signée avec appartenance vérifiée.
"""
import io
import re
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from PIL import Image

from models.fiche_entreprise import FicheEntreprise
from models.organization import Organization
from models.user import User
from services import fiches_logo
from tests.test_fiches_entreprise import _se_connecter_comme  # noqa: F401  (aide commune)

BASE = "/api/entreprise/fiches"


@pytest.fixture
def uploads(tmp_path, monkeypatch):
    """Dossier d'envois jetable pour le stockage ET pour le service des fichiers."""
    from routers import file_serve
    from services import file_storage
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    monkeypatch.setattr(file_serve, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _png(taille=(300, 120), couleur=(0, 140, 248, 255), avec_exif=False) -> bytes:
    image = Image.new("RGBA", taille, couleur)
    sortie = io.BytesIO()
    kwargs = {}
    if avec_exif:
        exif = Image.Exif()
        exif[0x010E] = "DESCRIPTION-A-PERDRE"
        exif[0x9286] = "COMMENTAIRE-A-PERDRE"
        kwargs["exif"] = exif
        from PIL.PngImagePlugin import PngInfo
        info = PngInfo()
        info.add_text("Author", "AUTEUR-A-PERDRE")
        kwargs["pnginfo"] = info
    image.save(sortie, "PNG", **kwargs)
    return sortie.getvalue()


def _jpeg(taille=(640, 480)) -> bytes:
    sortie = io.BytesIO()
    exif = Image.Exif()
    exif[0x010E] = "DESCRIPTION-A-PERDRE"
    Image.new("RGB", taille, (200, 30, 30)).save(sortie, "JPEG", exif=exif)
    return sortie.getvalue()


def _envoyer(client, octets, nom="logo.png", type_="image/png", rubrique="moyens"):
    return client.post(f"{BASE}/{rubrique}/logo", files={"file": (nom, octets, type_)})


# ─── Fonctions pures ───────────────────────────────────────────────────────────

def test_png_est_reencode_en_webp_sans_metadonnees():
    source = _png(avec_exif=True)
    assert b"AUTEUR-A-PERDRE" in source
    webp = fiches_logo.reencoder_en_webp(source)
    image = Image.open(io.BytesIO(webp))
    assert image.format == "WEBP" and image.size == (300, 120)
    for marque in (b"AUTEUR-A-PERDRE", b"DESCRIPTION-A-PERDRE", b"COMMENTAIRE-A-PERDRE"):
        assert marque not in webp
    assert not image.info.get("exif") and not image.info.get("icc_profile")
    assert image.convert("RGBA").getpixel((10, 10)) == (0, 140, 248, 255)      # lossless : pixels intacts


def test_jpeg_est_reduit_a_512_px_et_perd_son_exif():
    source = _jpeg((2000, 1000))
    assert b"DESCRIPTION-A-PERDRE" in source
    webp = fiches_logo.reencoder_en_webp(source)
    image = Image.open(io.BytesIO(webp))
    assert image.format == "WEBP" and image.size == (512, 256)
    assert b"DESCRIPTION-A-PERDRE" not in webp and not image.info.get("exif")


def test_svg_refuse_meme_avec_une_en_tete_de_png():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    with pytest.raises(fiches_logo.LogoRefuse):
        fiches_logo.reencoder_en_webp(svg)


def test_gif_et_webp_refuses_comme_format_reel():
    for format_ in ("GIF", "WEBP", "BMP"):
        sortie = io.BytesIO()
        Image.new("RGB", (10, 10), (1, 2, 3)).save(sortie, format_)
        with pytest.raises(fiches_logo.LogoRefuse):
            fiches_logo.reencoder_en_webp(sortie.getvalue())


def test_png_tronque_refuse():
    with pytest.raises(fiches_logo.LogoRefuse):
        fiches_logo.reencoder_en_webp(_png()[:60])


def test_bombe_de_decompression_refusee(monkeypatch):
    monkeypatch.setattr(fiches_logo, "MAX_PIXELS", 10_000)
    with pytest.raises(fiches_logo.LogoRefuse, match="trop grandes"):
        fiches_logo.reencoder_en_webp(_png((300, 120)))


# ─── Route ─────────────────────────────────────────────────────────────────────

def test_png_accepte_stocke_hors_webroot_et_servi_par_url_signee(client, uploads, test_org):
    r = _envoyer(client, _png(avec_exif=True))
    assert r.status_code == 200, r.text
    url = r.json()["logo_url"]
    assert url.startswith("/api/files/view/organizations/org-test-1/fiches/") and "sig=" in url
    fichiers = list((uploads / "organizations" / "org-test-1" / "fiches").iterdir())
    assert len(fichiers) == 1
    nom = fichiers[0].name
    assert re.fullmatch(r"[0-9a-f-]{36}-logo\.webp", nom)                 # nom aléatoire, jamais celui du client
    assert Image.open(fichiers[0]).format == "WEBP"
    # Le GET donne la même URL signée ; jamais le chemin disque.
    j = client.get(f"{BASE}/moyens").json()["bordereau"]
    assert j["logo_origine"] == "fiche" and "/api/files/view/" in j["logo_url"]
    assert str(uploads) not in str(j)
    # L'URL signée sert bien l'image.
    chemin, q = urlparse(url), parse_qs(urlparse(url).query)
    vu = client.get(url)
    assert vu.status_code == 200 and vu.content[:4] == b"RIFF"


def test_jpeg_accepte(client, uploads):
    r = _envoyer(client, _jpeg(), "logo.jpg", "image/jpeg")
    assert r.status_code == 200
    assert len(list((uploads / "organizations" / "org-test-1" / "fiches").iterdir())) == 1


def test_svg_refuse(client, uploads):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
    assert _envoyer(client, svg, "logo.svg", "image/svg+xml").status_code == 415
    assert _envoyer(client, svg, "logo.png", "image/png").status_code == 415      # renommé
    assert not (uploads / "organizations").exists()


def test_fichier_renomme_png_mais_pas_une_image_refuse(client, uploads):
    r = _envoyer(client, b"MZ\x90\x00 programme Windows", "logo.png", "image/png")
    assert r.status_code == 415
    r = _envoyer(client, b"%PDF-1.4 faux", "logo.png", "image/png")
    assert r.status_code == 415
    assert not (uploads / "organizations").exists()


def test_en_tete_png_sans_image_refuse_par_pillow(client, uploads):
    r = _envoyer(client, b"\x89PNG\r\n\x1a\n" + b"pas du tout une image" * 20)
    assert r.status_code == 415 and "lisible" in r.json()["detail"]


def test_content_type_trompeur_ne_change_rien(client, uploads):
    """Un vrai PNG annoncé en text/html est accepté ; du texte annoncé en image/png est refusé."""
    assert _envoyer(client, _png(), "logo.png", "text/html").status_code == 200
    assert _envoyer(client, b"<html>", "logo.png", "image/png").status_code == 415


def test_deux_mo_exactement_acceptes_et_un_octet_de_plus_refuse(client, uploads):
    plafond = 2 * 1024 * 1024
    base = _png()
    pile = base + b"\x00" * (plafond - len(base))                 # PNG valide + octets après IEND
    assert len(pile) == plafond
    assert _envoyer(client, pile).status_code == 200
    r = _envoyer(client, pile + b"\x00")
    assert r.status_code == 413 and "Mo" in r.json()["detail"]


def test_remplacer_le_logo_supprime_l_ancien_fichier(client, uploads):
    _envoyer(client, _png())
    dossier = uploads / "organizations" / "org-test-1" / "fiches"
    premier = next(dossier.iterdir()).name
    _envoyer(client, _png(couleur=(10, 20, 30, 255)))
    noms = [f.name for f in dossier.iterdir()]
    assert len(noms) == 1 and noms[0] != premier


def test_retirer_le_logo(client, uploads, db_session):
    _envoyer(client, _png())
    r = client.delete(f"{BASE}/moyens/logo")
    assert r.status_code == 200 and r.json()["logo_url"] is None
    assert list((uploads / "organizations" / "org-test-1" / "fiches").iterdir()) == []
    assert db_session.query(FicheEntreprise).one().logo_path is None


def test_a_defaut_le_logo_de_l_entreprise(client, uploads, db_session, test_org):
    cible = uploads / "organizations" / "org-test-1" / "vault" / "x-logo.png"
    cible.parent.mkdir(parents=True)
    cible.write_bytes(_png())
    test_org.logo_url = "/uploads/organizations/org-test-1/vault/x-logo.png"
    db_session.commit()
    b = client.get(f"{BASE}/moyens").json()["bordereau"]
    assert b["logo_origine"] == "entreprise" and "vault/x-logo.png" in b["logo_url"]


def test_logo_rubrique_inconnue_404(client, uploads):
    assert _envoyer(client, _png(), rubrique="inconnue").status_code == 404


def test_le_logo_est_propre_a_la_rubrique(client, uploads):
    _envoyer(client, _png(), rubrique="moyens")
    assert client.get(f"{BASE}/certifications").json()["bordereau"]["logo_url"] is None


# ─── Isolation entre entreprises ───────────────────────────────────────────────

@pytest.fixture
def org_b(db_session):
    db_session.add(Organization(id="org-b", name="Entreprise B"))
    db_session.add(User(id="user-b", email="b@example.com", name="B", organization_id="org-b"))
    db_session.commit()


def test_cross_org_le_logo_de_a_n_est_ni_lisible_ni_visible_pour_b(client, uploads, org_b):
    url_a = _envoyer(client, _png()).json()["logo_url"]
    # B ne voit pas le logo de A dans sa fiche.
    _se_connecter_comme("user-b", "org-b")
    assert client.get(f"{BASE}/moyens").json()["bordereau"]["logo_url"] is None
    # L'URL signée pour A reste valable pour A seule : B ne peut pas la rejouer sous son identité.
    chemin = urlparse(url_a).path.removeprefix("/api/files/view/")
    rel = chemin
    assert client.get(f"/api/files/sign?path={rel}").status_code in (403, 404)
    from services.file_storage import sign_file_path
    forgee = sign_file_path(rel, org_id="org-b")
    assert client.get(forgee).status_code in (403, 404)
    # B retire « son » logo : celui de A est intact.
    client.delete(f"{BASE}/moyens/logo")
    assert len(list((uploads / "organizations" / "org-test-1" / "fiches").iterdir())) == 1


def test_cross_org_depot_de_b_n_ecrase_pas_a(client, uploads, org_b, db_session):
    _envoyer(client, _png())
    _se_connecter_comme("user-b", "org-b")
    assert _envoyer(client, _png(couleur=(1, 2, 3, 255))).status_code == 200
    rangees = {(f.organization_id, f.logo_path.split("/")[3]) for f in db_session.query(FicheEntreprise).all()}
    assert rangees == {("org-test-1", "org-test-1"), ("org-b", "org-b")}


def test_debit_limite(client, uploads):
    from services.rate_limit import limiter
    limiter.enabled = True
    try:
        limiter.reset()
        codes = [_envoyer(client, _png()).status_code for _ in range(12)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:10] == [200] * 10 and 429 in codes[10:]
