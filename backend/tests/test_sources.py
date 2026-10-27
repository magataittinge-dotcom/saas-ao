"""A5 + A6 (sujet A) — GET /api/sources/{exigence_id} et .../apercu : ancre au premier clic,
image WebP, isolation par organisation, débit. Textes inventés."""
import hashlib
import io

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from PIL import Image

from database import SessionLocal, get_db
from main import app
from models.compliance_item import ComplianceItem
from models.organization import Organization
from models.project import Project, ProjectDocument
from models.user import User
from routers import sources
from routers.auth import get_auth_user
from services import ancres_projet, cache_apercus, file_storage, pdfium_processus
from services.pdfium_processus import TravailPdfiumEchoue
from tests.pdf_fabrique import pdf_regle, pdf_texte

P1 = "Les menuiseries extérieures seront livrées avec leurs vitrages feuilletés."
P2 = "Le titulaire fournit les fiches techniques de tous les produits mis en œuvre."


@pytest.fixture(autouse=True)
def _propre(tmp_path, monkeypatch):
    pdfium_processus.arreter()
    monkeypatch.setattr(cache_apercus, "_defaut", cache_apercus.CacheApercus(tmp_path / "cache"))
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path / "uploads")
    yield
    pdfium_processus.arreter()


@pytest.fixture
def dossier(db_session, test_org, tmp_path):
    pdf_dir = tmp_path / "uploads" / "projects" / "p-src"
    pdf_dir.mkdir(parents=True)
    (pdf_dir / "cctp.pdf").write_bytes(pdf_texte(["Un.", "Texte de tête.\n" + P1 + "\n" + P2]))
    db_session.add(Project(id="p-src", organization_id=test_org.id, name="AO"))
    db_session.add(ProjectDocument(id="d-src", project_id="p-src", type="cctp", file_name="cctp.pdf",
                                   file_url="/uploads/projects/p-src/cctp.pdf"))
    for id_, page, extrait in (("e1", 2, P1), ("e2", 2, P2), ("e3", 1, "Phrase qui n'existe nulle part ici"),
                               ("e4", None, None)):
        db_session.add(ComplianceItem(id=id_, project_id="p-src", exigence_text="x", source_document="cctp.pdf",
                                      source_page=page, source_excerpt=extrait))
    db_session.commit()
    return pdf_dir / "cctp.pdf"


@pytest.fixture
def en_tant_que_b(db_session):
    """Appel : bascule l'authentification sur un utilisateur d'une AUTRE organisation et
    rend le client (les deux clients partagent la même appli : à utiliser après celui de A)."""
    db_session.add(Organization(id="org-B", name="B"))
    user_b = User(id="user-B", email="b@b.fr", name="Bob", organization_id="org-B")
    db_session.add(user_b)
    db_session.commit()

    def _db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    def _auth(request: Request):
        request.state.rl_key = "org:org-B"
        return user_b

    def basculer() -> TestClient:
        app.dependency_overrides[get_db] = _db
        app.dependency_overrides[get_auth_user] = _auth
        return TestClient(app)
    try:
        yield basculer
    finally:
        app.dependency_overrides.clear()


def _image(reponse) -> Image.Image:
    return Image.open(io.BytesIO(reponse.content))


# ─── A5 : l'ancre ─────────────────────────────────────────────────────────────

def test_premier_clic_calcule_et_range_l_ancre_de_toute_la_piece(client, db_session, dossier):
    r = client.get("/api/sources/e1")
    assert r.status_code == 200
    ancre = r.json()
    assert ancre["niveau"] == "passage" and ancre["page"] == 2 and ancre["doc_id"] == "d-src"
    assert ancre["rects"] and ancre["citation"]["passage"] == P1
    db_session.expire_all()
    # la base garde l'ancre seule ; la réponse y ajoute « cadrage » et « document »
    assert db_session.get(ComplianceItem, "e1").ancre == {k: v for k, v in ancre.items() if k not in ("cadrage", "document")}
    assert db_session.get(ComplianceItem, "e2").ancre["niveau"] == "passage"     # même pièce : calculée aussi
    assert db_session.get(ComplianceItem, "e3").ancre["niveau"] == "page"
    assert db_session.get(ComplianceItem, "e4").ancre is None                  # sans extrait


def test_deuxieme_clic_ne_recalcule_rien(client, dossier, monkeypatch):
    client.get("/api/sources/e1")
    appels = []
    monkeypatch.setattr(pdfium_processus, "executer", lambda *a, **k: appels.append(a[0]))
    r = client.get("/api/sources/e2")
    assert r.status_code == 200 and r.json()["niveau"] == "passage" and appels == []
    assert "no-store" in r.headers["cache-control"]


def test_exigence_sans_extrait_niveau_aucun_pas_d_erreur(client, dossier):
    r = client.get("/api/sources/e4")
    assert r.status_code == 200 and r.json()["niveau"] == "aucun"


def test_pdf_illisible_repli_sur_la_page_citee_jamais_500(client, db_session, dossier):
    dossier.write_bytes(b"ceci n'est pas un pdf")
    r = client.get("/api/sources/e1")
    assert r.status_code == 200
    assert r.json()["niveau"] == "page" and r.json()["page"] == 2 and r.json()["rects"] == []
    db_session.expire_all()
    assert db_session.get(ComplianceItem, "e1").ancre is None          # non rangé : un prochain clic peut réussir


def test_piece_sans_fichier_niveau_aucun(client, dossier):
    dossier.unlink()
    r = client.get("/api/sources/e1")
    assert r.status_code == 200 and r.json()["niveau"] == "aucun"


@pytest.mark.parametrize("raison", ["attente", "indisponible"])
def test_pas_de_place_dans_le_processus_503_retry_after(client, dossier, monkeypatch, raison):
    def occupe(*a, **k):
        raise TravailPdfiumEchoue(raison, "")
    monkeypatch.setattr(pdfium_processus, "executer", occupe)
    r = client.get("/api/sources/e1")
    assert r.status_code == 503 and int(r.headers["retry-after"]) > 0


def test_delai_depasse_repli_sur_la_page_pas_de_503_perpetuel(client, dossier, monkeypatch):
    def lent(*a, **k):
        raise TravailPdfiumEchoue("delai", "")
    monkeypatch.setattr(pdfium_processus, "executer", lent)
    r = client.get("/api/sources/e1")
    assert r.status_code == 200 and r.json()["niveau"] == "page" and r.json()["page"] == 2


# ─── sécurité : une autre organisation ────────────────────────────────────────

@pytest.mark.parametrize("chemin", ["/api/sources/e1", "/api/sources/e1/apercu?vue=page",
                                    "/api/sources/e1/apercu?vue=passage&largeur=720"])
def test_une_autre_organisation_obtient_404_et_rien_n_est_calcule(en_tant_que_b, dossier, monkeypatch, chemin):
    client_autre_org = en_tant_que_b()
    appels = []
    monkeypatch.setattr(pdfium_processus, "executer", lambda *a, **k: appels.append(1))
    r = client_autre_org.get(chemin)
    assert r.status_code == 404 and appels == []
    assert r.json() == client_autre_org.get("/api/sources/n-existe-pas").json()   # indistinguable


def test_une_autre_organisation_ne_lit_pas_une_ancre_deja_rangee_ni_l_image(client, en_tant_que_b, dossier):
    assert client.get("/api/sources/e1/apercu?vue=page").status_code == 200       # en cache pour l'org A
    assert client.get("/api/sources/e1").status_code == 200
    client_autre_org = en_tant_que_b()
    assert client_autre_org.get("/api/sources/e1/apercu?vue=page").status_code == 404
    assert client_autre_org.get("/api/sources/e1").status_code == 404


def test_projet_supprime_inaccessible(client, db_session, dossier):
    from datetime import datetime
    db_session.get(Project, "p-src").deleted_at = datetime.utcnow()
    db_session.commit()
    assert client.get("/api/sources/e1").status_code == 404
    assert client.get("/api/sources/e1/apercu").status_code == 404


def test_ancre_pointant_une_piece_d_un_autre_projet_refusee(client, db_session, test_org, dossier):
    db_session.add(Project(id="p-autre", organization_id=test_org.id, name="Autre"))
    db_session.add(ProjectDocument(id="d-autre", project_id="p-autre", type="cctp", file_name="cctp.pdf",
                                   file_url="/uploads/projects/p-src/cctp.pdf"))
    db_session.get(ComplianceItem, "e1").ancre = {"version": 1, "doc_id": "d-autre", "page": 2, "rotation": 0,
                                                  "rects": [], "niveau": "page", "citation": None}
    db_session.commit()
    assert client.get("/api/sources/e1/apercu?vue=page").status_code == 404


def test_non_authentifie_refuse(dossier):
    app.dependency_overrides.clear()
    c = TestClient(app)
    assert c.get("/api/sources/e1").status_code in (401, 403)
    assert c.get("/api/sources/e1/apercu").status_code in (401, 403)


# ─── A6 : l'aperçu ────────────────────────────────────────────────────────────

def test_apercu_page_webp_largeur_au_palier_cache_prive_immutable(client, dossier):
    r = client.get("/api/sources/e1/apercu?vue=page&largeur=700")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert "private" in r.headers["cache-control"] and "immutable" in r.headers["cache-control"]
    image = _image(r)
    assert image.format == "WEBP" and image.size[0] == 720          # 700 → palier 720
    assert image.size[1] > image.size[0]                            # page A4 entière


def test_apercu_passage_est_une_loupe_recadree(client, dossier):
    page = _image(client.get("/api/sources/e1/apercu?vue=page&largeur=960"))
    passage = _image(client.get("/api/sources/e1/apercu?vue=passage&largeur=960"))
    assert abs(passage.size[0] - 960) <= 1 and page.size[0] == 960     # le recadrage arrondit à ±1 px
    assert passage.size[1] < page.size[1] / 2                       # un extrait de la page, pas la page


def test_vue_passage_sans_rectangles_montre_la_page_entiere(client, dossier):
    page = _image(client.get("/api/sources/e3/apercu?vue=page"))
    passage = _image(client.get("/api/sources/e3/apercu?vue=passage"))      # niveau « page »
    assert passage.size == page.size


def test_largeurs_ramenees_a_des_paliers(client, dossier):
    tailles = {demande: _image(client.get(f"/api/sources/e1/apercu?vue=page&largeur={demande}")).size[0]
               for demande in (1, 480, 481, 5000, 10000)}
    assert tailles == {1: 480, 480: 480, 481: 720, 5000: 1600, 10000: 1600}
    assert client.get("/api/sources/e1/apercu?largeur=0").status_code == 422
    assert client.get("/api/sources/e1/apercu?largeur=99999").status_code == 422
    assert client.get("/api/sources/e1/apercu?largeur=abc").status_code == 422
    assert client.get("/api/sources/e1/apercu?vue=document").status_code == 422


def test_deuxieme_demande_servie_par_le_cache_sans_rendu(client, dossier, monkeypatch):
    premiere = client.get("/api/sources/e1/apercu?vue=passage&largeur=960")
    appels = []
    monkeypatch.setattr(sources, "rendre_page_webp", lambda *a, **k: appels.append(1))
    seconde = client.get("/api/sources/e1/apercu?vue=passage&largeur=960")
    assert seconde.content == premiere.content and appels == []


def test_le_pdf_n_est_jamais_reecrit_et_aucun_texte_dans_l_url(client, dossier):
    avant = hashlib.sha256(dossier.read_bytes()).hexdigest()
    mtime = dossier.stat().st_mtime_ns
    r = client.get("/api/sources/e1/apercu?vue=passage")
    assert r.status_code == 200 and "menuiseries" not in str(r.request.url)
    assert hashlib.sha256(dossier.read_bytes()).hexdigest() == avant and dossier.stat().st_mtime_ns == mtime


def test_page_hors_du_document_ou_pdf_illisible_404_pas_500(client, db_session, dossier):
    db_session.get(ComplianceItem, "e3").ancre = {"version": 1, "doc_id": "d-src", "page": 40, "rotation": 0,
                                                  "rects": [], "niveau": "page", "citation": None}
    db_session.commit()
    assert client.get("/api/sources/e3/apercu?vue=page").status_code == 404
    dossier.write_bytes(b"pas un pdf")
    assert client.get("/api/sources/e1/apercu?vue=page&largeur=480").status_code in (200, 404)   # cache ou 404
    assert client.get("/api/sources/e2/apercu?vue=page&largeur=720").status_code == 404


def test_page_tournee_l_image_est_celle_que_voit_l_utilisateur(client, db_session, dossier):
    dossier.write_bytes(pdf_regle(pdf_texte([P1 + "\n" + P2]), rotation=90))   # page 1 tournée
    ancre = client.get("/api/sources/e1").json()
    assert ancre["rotation"] == 90 and ancre["niveau"] == "passage" and ancre["page"] == 1
    loupe = _image(client.get("/api/sources/e1/apercu?vue=passage"))
    assert loupe.size[0] > loupe.size[1]
    page = _image(client.get("/api/sources/e1/apercu?vue=page"))
    assert page.size[0] > page.size[1]                              # A4 tournée : plus large que haute


# ─── cadrage de la loupe ──────────────────────────────────────────────────────

def test_cadrage_passage_marge_taille_minimale_et_dans_la_page():
    ancre = {"niveau": "passage", "rotation": 0, "rects": [[0.10, 0.20, 0.30, 0.22]]}
    x0, y0, x1, y1 = sources.cadrage_passage(ancre)
    assert x0 <= 0.10 and x1 >= 0.30 and y0 <= 0.20 and y1 >= 0.22
    assert x1 - x0 >= 0.5 - 1e-9 and y1 - y0 >= 0.12 - 1e-9
    assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1


def test_cadrage_passage_en_bord_de_page_reste_dans_la_page():
    for rect in ([0.0, 0.0, 0.05, 0.01], [0.95, 0.99, 1.0, 1.0]):
        x0, y0, x1, y1 = sources.cadrage_passage({"niveau": "passage", "rotation": 0, "rects": [rect]})
        assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1
        assert x1 - x0 >= 0.5 - 1e-9 and y1 - y0 >= 0.12 - 1e-9


def test_cadrage_passage_suit_la_rotation_de_la_page():
    rect = [0.05, 0.05, 0.25, 0.08]                       # en haut à gauche de la page non tournée
    sans = sources.cadrage_passage({"niveau": "passage", "rotation": 0, "rects": [rect]})
    tourne = sources.cadrage_passage({"niveau": "passage", "rotation": 90, "rects": [rect]})
    assert sans[0] < 0.1 and sans[1] < 0.1                # affiché en haut à gauche
    assert tourne[2] > 0.9 and tourne[1] < 0.1            # une rotation de 90° l'envoie en haut à droite


def test_cadrage_sans_rectangle_ou_niveau_page_est_none():
    assert sources.cadrage_passage({"niveau": "page", "rects": []}) is None
    assert sources.cadrage_passage({"niveau": "passage", "rects": []}) is None


def test_paliers():
    assert [sources.palier_largeur(x) for x in (1, 480, 600, 960, 961, 1600, 4000)] == [480, 480, 720, 960, 1280, 1600, 1600]


# ─── Voir dans le DCE à l'écran : champs `document` et `cadrage` de la réponse ───

def _sans_requete(url: str) -> tuple[str, dict]:
    from urllib.parse import parse_qs, urlsplit
    morceaux = urlsplit(url)
    return morceaux.path, {k: v[0] for k, v in parse_qs(morceaux.query).items()}


def test_la_reponse_porte_l_url_signee_du_document(client, test_org, dossier):
    from urllib.parse import unquote
    r = client.get("/api/sources/e1").json()
    doc = r["document"]
    assert doc["nom"] == "cctp.pdf" and doc["expire_dans"] == file_storage.SIGNED_URL_TTL
    chemin, q = _sans_requete(doc["url"])
    assert chemin == "/api/files/view/projects/p-src/cctp.pdf"
    # propriété : la signature lie chemin + organisation + expiration, et seulement eux
    assert set(q) == {"org", "exp", "sig"} and q["org"] == test_org.id
    assert file_storage.verify_file_signature(unquote(chemin).removeprefix("/api/files/view/"),
                                              q["org"], q["exp"], q["sig"])
    assert not file_storage.verify_file_signature("projects/p-src/autre.pdf", q["org"], q["exp"], q["sig"])
    assert not file_storage.verify_file_signature("projects/p-src/cctp.pdf", "org-B", q["exp"], q["sig"])
    # rien du DCE dans l'URL (B26) : ni extrait, ni page
    assert P1[:10] not in doc["url"] and "page=" not in doc["url"] and "highlight" not in doc["url"]


def test_l_ancre_rangee_ne_contient_pas_l_url_signee(client, db_session, dossier):
    client.get("/api/sources/e1")
    db_session.expire_all()
    assert "document" not in db_session.get(ComplianceItem, "e1").ancre
    assert "cadrage" not in db_session.get(ComplianceItem, "e1").ancre


def test_le_cadrage_est_celui_de_la_loupe(client, dossier):
    r = client.get("/api/sources/e1").json()
    assert r["cadrage"] == list(sources.cadrage_passage(r))
    assert client.get("/api/sources/e3").json()["cadrage"] is None          # niveau « page »
    assert client.get("/api/sources/e4").json()["cadrage"] is None          # niveau « aucun »


def test_word_converti_le_document_est_son_pdf_et_l_origine_le_word(client, db_session, test_org, dossier):
    pdf_dir = dossier.parent
    (pdf_dir / "note.docx").write_bytes(b"PK faux docx")
    (pdf_dir / "note.pdf").write_bytes(dossier.read_bytes())
    db_session.add(ProjectDocument(id="d-word", project_id="p-src", type="autre", file_name="note.docx",
                                   file_url="/uploads/projects/p-src/note.docx",
                                   pdf_preview_url="/uploads/projects/p-src/note.pdf"))
    db_session.add(ComplianceItem(id="e-word", project_id="p-src", exigence_text="x", source_document="note.docx",
                                  source_page=2, source_excerpt=P1))
    db_session.commit()
    r = client.get("/api/sources/e-word").json()
    assert r["niveau"] == "passage" and r["doc_id"] == "d-word"
    assert r["document"]["nom"] == "note.docx"
    assert _sans_requete(r["document"]["url"])[0].endswith("/projects/p-src/note.pdf")
    assert _sans_requete(r["document"]["origine"])[0].endswith("/projects/p-src/note.docx")


def test_word_sans_pdf_converti_repli_positif_avec_le_lien_vers_la_piece(client, db_session, dossier):
    (dossier.parent / "note.docx").write_bytes(b"PK faux docx")
    db_session.add(ProjectDocument(id="d-word", project_id="p-src", type="autre", file_name="note.docx",
                                   file_url="/uploads/projects/p-src/note.docx"))
    db_session.add(ComplianceItem(id="e-word", project_id="p-src", exigence_text="x", source_document="note.docx",
                                  source_page=2, source_excerpt=P1))
    db_session.commit()
    r = client.get("/api/sources/e-word")
    assert r.status_code == 200
    corps = r.json()
    assert corps["niveau"] == "aucun" and corps["cadrage"] is None
    assert corps["document"]["url"] is None                                  # rien à afficher en PDF
    assert _sans_requete(corps["document"]["origine"])[0].endswith("/projects/p-src/note.docx")
    assert client.get("/api/sources/e-word/apercu").status_code == 404       # et pas d'image


def test_fichier_absent_du_disque_pas_d_url_et_pas_d_erreur(client, dossier):
    assert client.get("/api/sources/e4").json()["document"]["nom"] == "cctp.pdf"
    dossier.unlink()
    corps = client.get("/api/sources/e1").json()
    assert corps["niveau"] == "aucun" and corps["document"]["url"] is None and corps["document"]["origine"] is None


def test_le_document_vient_du_projet_de_l_exigence_jamais_d_un_autre(client, db_session, test_org, dossier):
    db_session.add(Project(id="p-autre", organization_id=test_org.id, name="Autre"))
    db_session.add(ProjectDocument(id="d-autre", project_id="p-autre", type="cctp", file_name="secret.pdf",
                                   file_url="/uploads/projects/p-src/cctp.pdf"))
    db_session.get(ComplianceItem, "e1").ancre = {"version": 1, "doc_id": "d-autre", "page": 2, "rotation": 0,
                                                  "rects": [], "niveau": "page", "citation": None}
    db_session.commit()
    assert client.get("/api/sources/e1").json()["document"] is None


def test_une_autre_organisation_ne_recoit_aucune_url_signee(client, en_tant_que_b, dossier):
    assert "url" in client.get("/api/sources/e1").json()["document"]
    r = en_tant_que_b().get("/api/sources/e1")
    assert r.status_code == 404 and "sig=" not in r.text


# ─── débit ────────────────────────────────────────────────────────────────────

def test_limite_de_debit_sur_les_routes(client, dossier):
    from services.rate_limit import limiter
    cles = [k for k in limiter._route_limits if k.startswith("routers.sources.")]
    assert sorted(cles) == ["routers.sources.apercu", "routers.sources.lire_ancre", "routers.sources.tableau"]
    limiter.enabled = True
    try:
        limiter.reset()
        codes = [client.get("/api/sources/e4").status_code for _ in range(sources_limite() + 2)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:sources_limite()] == [200] * sources_limite() and codes[-1] == 429


def sources_limite() -> int:
    return int(sources.LIMITE_ANCRE.split("/")[0])
