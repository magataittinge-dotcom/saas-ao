"""Aperçu des fiches « Mon entreprise » (F2) : fabrication en tâche de fond, cache par empreinte, une génération à la
fois par entreprise (la dernière gagne), isolation entre entreprises, repli sans LibreOffice.

LibreOffice et pdfium sont SIMULÉS dans les tests unitaires (monkeypatch) ; un test d'intégration réel, ignoré sans
``soffice``, fabrique un vrai PDF et rend ses pages en WebP. Données inventées.
"""
import io
import threading
import time

import pytest
from PIL import Image

from services import fiches_donnees as fd
from services import fiches_entreprise as generation
from services import fiches_rendu as rendu
from services.cache_apercus import CacheApercus
from services.libreoffice_isole import PdfConversionError, soffice_available
from tests import fiches_fabrique as fab
from tests.test_fiches_entreprise import _comme_b, _se_connecter_comme, deux_entreprises  # noqa: F401  (fixture)

BASE = "/api/entreprise/fiches"
reel = pytest.mark.skipif(not soffice_available(), reason="LibreOffice (soffice) absent de cet environnement")


def _webp(n: int) -> bytes:
    sortie = io.BytesIO()
    Image.new("RGB", (40, 56), (n * 40 % 255, 80, 160)).save(sortie, "WEBP")
    return sortie.getvalue()


@pytest.fixture
def simule(monkeypatch, tmp_path):
    """Cache jetable, LibreOffice présent mais simulé (PDF factice), pdfium simulé (2 pages WebP)."""
    rendu.oublier_tout()
    monkeypatch.setattr(rendu, "_cache", CacheApercus(tmp_path / "cache-fiches", 50 * 1024 * 1024))
    monkeypatch.setattr(rendu, "soffice_available", lambda: True)
    monkeypatch.setattr(rendu, "convertir_en_pdf", lambda octets, ext: b"%PDF-1.7 simule " + ext.encode())
    monkeypatch.setattr(generation, "generer_pdf", lambda docx: b"%PDF-1.7 simule pdf")
    appels = []

    def faux_rendu(pdf, largeur, pages_max=20):
        appels.append(pdf)
        return 2, [_webp(1), _webp(2)]

    monkeypatch.setattr(rendu, "rendre_document_webp", faux_rendu)
    yield appels
    rendu.oublier_tout()


def _attendre(client, rubrique, emp, voulu=("pret", "erreur"), delai=8.0):
    fin = time.monotonic() + delai
    while time.monotonic() < fin:
        r = client.get(f"{BASE}/{rubrique}/apercu/{emp}")
        assert r.status_code == 200, r.text
        if r.json()["etat"] in voulu:
            return r.json()
        time.sleep(0.02)
    raise AssertionError("l'aperçu n'est pas prêt à temps")


def _demander(client, rubrique="moyens", format_="pdf"):
    return client.post(f"{BASE}/{rubrique}/apercu?format={format_}")


# ─── Parcours nominal ──────────────────────────────────────────────────────────

def test_apercu_202_puis_pret_puis_200_depuis_le_cache(client, deux_entreprises, simule):
    r = _demander(client)
    assert r.status_code == 202 and r.json()["etat"] == "en_cours"
    emp = r.json()["empreinte"]
    assert len(emp) == 64
    etat = _attendre(client, "moyens", emp)
    assert etat == {"etat": "pret", "pages": 2, "message": ""}
    # Même contenu : réponse immédiate 200, aucune seconde génération.
    r2 = _demander(client)
    assert r2.status_code == 200 and r2.json() == {"etat": "pret", "empreinte": emp, "pages": 2}
    assert len(simule) == 1 and rendu.LANCEMENTS == [emp]


def test_pages_servies_en_webp_avec_cache_prive(client, deux_entreprises, simule):
    emp = _demander(client).json()["empreinte"]
    _attendre(client, "moyens", emp)
    r = client.get(f"{BASE}/moyens/apercu/{emp}/pages/1")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert "private" in r.headers["cache-control"] and "max-age=" in r.headers["cache-control"]
    assert Image.open(io.BytesIO(r.content)).format == "WEBP"
    assert client.get(f"{BASE}/moyens/apercu/{emp}/pages/2").content != r.content
    assert client.get(f"{BASE}/moyens/apercu/{emp}/pages/3").status_code == 404
    assert client.get(f"{BASE}/moyens/apercu/{emp}/pages/0").status_code in (404, 422)


def test_le_pdf_de_l_apercu_est_celui_du_telechargement(client, deux_entreprises, simule):
    """Word : le docx converti ; Excel : le classeur converti ; PDF : le PDF lui-même."""
    for format_, extension in (("docx", b".docx"), ("xlsx", b".xlsx")):
        emp = _demander(client, format_=format_).json()["empreinte"]
        _attendre(client, "moyens", emp)
        assert simule[-1].endswith(extension)
    emp = _demander(client, format_="pdf").json()["empreinte"]
    _attendre(client, "moyens", emp)
    assert simule[-1] == b"%PDF-1.7 simule pdf"


def test_empreinte_stable_et_sensible_au_contenu(client, deux_entreprises, simule):
    a = _demander(client).json()["empreinte"]
    _attendre(client, "moyens", a)
    assert _demander(client).json()["empreinte"] == a                              # même contenu, même empreinte
    assert _demander(client, format_="docx").json()["empreinte"] != a              # autre format
    assert _demander(client, "identite").json()["empreinte"] != a                  # autre rubrique
    client.put(f"{BASE}/moyens", json={"titre": "AUTRE TITRE"})
    b = _demander(client).json()["empreinte"]
    assert b != a                                                                  # bordereau modifié
    client.put(f"{BASE}/moyens", json={"titre": "AUTRE TITRE", "couleur": "#aa3300"})
    assert _demander(client).json()["empreinte"] not in (a, b)                     # couleur d'accent


def test_une_donnee_de_mon_entreprise_change_l_empreinte(client, deux_entreprises, db_session, simule):
    from models.organization import Organization
    a = _demander(client, "identite").json()["empreinte"]
    org = db_session.query(Organization).filter(Organization.id == deux_entreprises[0].id).first()
    org.address = "99 rue Nouvelle, 51100 Reims"
    db_session.commit()
    assert _demander(client, "identite").json()["empreinte"] != a


def test_le_logo_change_l_empreinte(client, deux_entreprises, simule, tmp_path, monkeypatch):
    from routers import file_serve
    from services import file_storage
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path / "uploads")
    monkeypatch.setattr(file_serve, "UPLOADS_ROOT", tmp_path / "uploads")
    a = _demander(client).json()["empreinte"]
    png = io.BytesIO()
    Image.new("RGBA", (300, 120), (200, 40, 40, 255)).save(png, "PNG")
    assert client.post(f"{BASE}/moyens/logo", files={"file": ("l.png", png.getvalue(), "image/png")}).status_code == 200
    b = _demander(client).json()["empreinte"]
    assert b != a
    png2 = io.BytesIO()
    Image.new("RGBA", (300, 120), (20, 40, 200, 255)).save(png2, "PNG")
    assert client.post(f"{BASE}/moyens/logo", files={"file": ("l.png", png2.getvalue(), "image/png")}).status_code == 200
    assert _demander(client).json()["empreinte"] not in (a, b)


def test_parametres_invalides(client, deux_entreprises, simule):
    assert client.post(f"{BASE}/moyens/apercu?format=odt").status_code == 422
    assert client.post(f"{BASE}/inconnue/apercu?format=pdf").status_code == 404
    assert client.get(f"{BASE}/moyens/apercu/pas-une-empreinte").status_code == 404
    assert client.get(f"{BASE}/moyens/apercu/{'0' * 64}").status_code == 404
    assert client.get(f"{BASE}/moyens/apercu/{'0' * 64}/pages/1").status_code == 404
    assert client.get(f"{BASE}/inconnue/apercu/{'0' * 64}").status_code == 404


def test_page_evincee_du_cache_l_aperçu_est_regenere(client, deux_entreprises, simule):
    emp = _demander(client).json()["empreinte"]
    _attendre(client, "moyens", emp)
    rendu._cache._chemin(rendu._cle_page(emp, 2)).unlink()                        # éviction partielle (LRU)
    assert client.get(f"{BASE}/moyens/apercu/{emp}/pages/1").status_code == 404   # pas de fiche à demi servie
    r = _demander(client)
    assert r.status_code == 202 and r.json()["empreinte"] == emp
    assert _attendre(client, "moyens", emp)["pages"] == 2


# ─── Isolation entre entreprises ───────────────────────────────────────────────

def test_cross_org_empreinte_d_une_autre_entreprise_404_sur_les_trois_routes(client, deux_entreprises, simule):
    emp = _demander(client, "certifications").json()["empreinte"]
    _attendre(client, "certifications", emp)
    assert client.get(f"{BASE}/certifications/apercu/{emp}/pages/1").status_code == 200
    _comme_b()
    assert client.get(f"{BASE}/certifications/apercu/{emp}").status_code == 404
    assert client.get(f"{BASE}/certifications/apercu/{emp}/pages/1").status_code == 404
    # B ne reprend pas l'empreinte de A en la redemandant : la sienne est autre, et bien prête chez lui seul.
    rb = _demander(client, "certifications")
    assert rb.json()["empreinte"] != emp
    emp_b = rb.json()["empreinte"]
    _attendre(client, "certifications", emp_b)
    assert client.get(f"{BASE}/certifications/apercu/{emp_b}/pages/1").status_code == 200
    _se_connecter_comme("user-test-1", deux_entreprises[0].id)
    assert client.get(f"{BASE}/certifications/apercu/{emp_b}").status_code == 404


def test_cross_org_empreinte_en_cours_d_une_autre_entreprise_404(client, deux_entreprises, simule, monkeypatch):
    porte, entree = threading.Event(), threading.Event()

    def bloque(pdf, largeur, pages_max=20):
        entree.set()
        assert porte.wait(10)
        return 1, [_webp(1)]

    monkeypatch.setattr(rendu, "rendre_document_webp", bloque)
    emp = _demander(client).json()["empreinte"]
    assert entree.wait(5)
    assert client.get(f"{BASE}/moyens/apercu/{emp}").json()["etat"] == "en_cours"
    _comme_b()
    assert client.get(f"{BASE}/moyens/apercu/{emp}").status_code == 404
    porte.set()
    _se_connecter_comme("user-test-1", deux_entreprises[0].id)
    _attendre(client, "moyens", emp)


def test_empreinte_d_une_autre_rubrique_404(client, deux_entreprises, simule):
    emp = _demander(client, "moyens").json()["empreinte"]
    _attendre(client, "moyens", emp)
    assert client.get(f"{BASE}/identite/apercu/{emp}").status_code == 404
    assert client.get(f"{BASE}/identite/apercu/{emp}/pages/1").status_code == 404


def test_rien_de_l_entreprise_dans_le_disque_du_cache(client, deux_entreprises, simule, tmp_path):
    emp = _demander(client).json()["empreinte"]
    _attendre(client, "moyens", emp)
    dossier = tmp_path / "cache-fiches"
    tout = b"".join(p.read_bytes() for p in dossier.rglob("*") if p.is_file()) + " ".join(
        str(p) for p in dossier.rglob("*")).encode()
    assert deux_entreprises[0].id.encode() not in tout and b"user-test" not in tout and b"Lambert" not in tout


# ─── Une génération à la fois par entreprise, la dernière gagne ────────────────

def test_deux_demandes_rapprochees_une_seule_generation_pour_la_derniere(client, deux_entreprises, simule, monkeypatch):
    porte, entree = threading.Event(), threading.Event()
    en_cours = []

    def bloque(pdf, largeur, pages_max=20):
        en_cours.append(1)
        assert len(en_cours) == 1, "deux générations en même temps pour la même entreprise"
        entree.set()
        assert porte.wait(10)
        en_cours.pop()
        return 1, [_webp(1)]

    monkeypatch.setattr(rendu, "rendre_document_webp", bloque)
    e1 = _demander(client).json()["empreinte"]               # démarre et se bloque
    assert entree.wait(5)
    client.put(f"{BASE}/moyens", json={"titre": "TITRE DEUX"})
    e2 = _demander(client).json()["empreinte"]               # en attente
    client.put(f"{BASE}/moyens", json={"titre": "TITRE TROIS"})
    e3 = _demander(client).json()["empreinte"]               # remplace la deux
    assert len({e1, e2, e3}) == 3
    assert client.get(f"{BASE}/moyens/apercu/{e2}").json()["etat"] == "erreur"       # remplacée
    porte.set()
    assert _attendre(client, "moyens", e3)["etat"] == "pret"
    assert _attendre(client, "moyens", e1)["etat"] == "pret"
    assert rendu.LANCEMENTS == [e1, e3]                      # la deux n'a jamais été lancée
    assert client.get(f"{BASE}/moyens/apercu/{e2}").json()["etat"] == "erreur"


def test_la_meme_demande_pendant_qu_elle_tourne_ne_relance_rien(client, deux_entreprises, simule, monkeypatch):
    porte, entree = threading.Event(), threading.Event()

    def bloque(pdf, largeur, pages_max=20):
        entree.set()
        assert porte.wait(10)
        return 1, [_webp(1)]

    monkeypatch.setattr(rendu, "rendre_document_webp", bloque)
    e1 = _demander(client).json()["empreinte"]
    assert entree.wait(5)
    r = _demander(client)
    assert r.status_code == 202 and r.json()["empreinte"] == e1
    porte.set()
    _attendre(client, "moyens", e1)
    assert rendu.LANCEMENTS == [e1]


# ─── Repli ─────────────────────────────────────────────────────────────────────

def test_sans_libreoffice_la_route_dit_indisponible(client, deux_entreprises, simule, monkeypatch):
    monkeypatch.setattr(rendu, "soffice_available", lambda: False)
    r = _demander(client)
    assert r.status_code == 200
    corps = r.json()
    assert corps["etat"] == "indisponible" and "rendu exact est indisponible" in corps["message"]
    assert rendu.LANCEMENTS == []


def test_echec_de_conversion_etat_erreur_avec_message_et_reessai_possible(client, deux_entreprises, simule, monkeypatch):
    def echec(octets, ext):
        raise PdfConversionError("La conversion en PDF prend plus de temps que prévu.", "delai")

    monkeypatch.setattr(rendu, "convertir_en_pdf", echec)
    emp = _demander(client, format_="docx").json()["empreinte"]
    etat = _attendre(client, "moyens", emp)
    assert etat["etat"] == "erreur" and "plus de temps que prévu" in etat["message"]
    monkeypatch.setattr(rendu, "convertir_en_pdf", lambda octets, ext: b"%PDF-1.7 ok")
    assert _demander(client, format_="docx").status_code == 202                    # une erreur n'est pas définitive
    assert _attendre(client, "moyens", emp)["etat"] == "pret"


def test_erreur_imprevue_ne_casse_ni_le_fil_ni_la_suite(client, deux_entreprises, simule, monkeypatch):
    def casse(pdf, largeur, pages_max=20):
        raise RuntimeError("secret interne : /srv/synorix/.env")

    monkeypatch.setattr(rendu, "rendre_document_webp", casse)
    emp = _demander(client).json()["empreinte"]
    etat = _attendre(client, "moyens", emp)
    assert etat["etat"] == "erreur" and "secret" not in etat["message"] and ".env" not in etat["message"]
    assert rendu._entreprises == {}                                                 # le fil s'est terminé proprement


def test_apercu_debit_limite(client, deux_entreprises, simule):
    from services.rate_limit import limiter
    limiter.enabled = True
    try:
        limiter.reset()
        codes = [_demander(client).status_code for _ in range(34)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert 429 in codes and codes[0] in (200, 202)


# ─── Excel via /generer et module ──────────────────────────────────────────────

def test_fabriquer_pdf_docx_xlsx_types_mime(db_session, simule):
    org = fab.creer_entreprise(db_session)
    d, b = fab.donnees(db_session, org, "moyens"), fab.bordereau("moyens")
    pal = fd.palette(b["couleur"])
    assert rendu.fabriquer("xlsx", d, b, pal, None)[1].endswith("spreadsheetml.sheet")
    assert rendu.fabriquer("docx", d, b, pal, None)[1].endswith("wordprocessingml.document")
    assert rendu.fabriquer("pdf", d, b, pal, None)[1] == "application/pdf"


def test_rendu_de_document_refuse_un_pdf_vide_ou_une_largeur_hors_bornes():
    from services.pdf_rendu import RenduTropGrand, rendre_document_webp
    from services.pdf_lecture import PdfIllisible
    with pytest.raises(PdfIllisible):
        rendre_document_webp(b"", 1000)
    with pytest.raises(RenduTropGrand):
        rendre_document_webp(b"%PDF-1.4", 99999)


# ─── Intégration réelle (LibreOffice et pdfium) ────────────────────────────────

@reel
@pytest.mark.parametrize("format_", ["pdf", "docx", "xlsx"])
def test_reel_pages_rendues_en_webp(db_session, format_):
    org = fab.creer_entreprise(db_session)
    fab.creer_documents(db_session, org.id)
    d, b = fab.donnees(db_session, org, "certifications"), fab.bordereau("certifications")
    pdf = rendu._pdf_de_l_apercu(format_, d, b, fd.palette(b["couleur"]), None)
    assert pdf.startswith(b"%PDF")
    total, pages = rendu.rendre_document_webp(pdf, rendu.LARGEUR_PX, rendu.PAGES_MAX)
    assert total >= 1 and len(pages) == min(total, rendu.PAGES_MAX)
    image = Image.open(io.BytesIO(pages[0]))
    assert image.format == "WEBP" and image.size[0] == rendu.LARGEUR_PX
    if format_ != "xlsx":
        assert image.size[1] > image.size[0]                                       # A4 portrait


@reel
def test_reel_parcours_complet_par_la_route(client, deux_entreprises, tmp_path, monkeypatch):
    rendu.oublier_tout()
    monkeypatch.setattr(rendu, "_cache", CacheApercus(tmp_path / "cache-reel", 50 * 1024 * 1024))
    emp = _demander(client, "identite", "docx").json()["empreinte"]
    etat = _attendre(client, "identite", emp, delai=120)
    assert etat["etat"] == "pret" and etat["pages"] >= 1
    r = client.get(f"{BASE}/identite/apercu/{emp}/pages/1")
    assert r.status_code == 200 and Image.open(io.BytesIO(r.content)).size[0] == rendu.LARGEUR_PX
    rendu.oublier_tout()


# ─── Table des états : plafond PAR entreprise, jamais d'éviction d'un « en cours » (revue du coordinateur) ───

@pytest.fixture
def fabrique_a_marqueur(simule, monkeypatch):
    """Fabrication simulée sans base : le PDF porte le marqueur des données ; celui qui finit par « B » attend ``porte``."""
    porte, entree = threading.Event(), threading.Event()

    def faux_fabriquer(format_, donnees, bordereau, pal, logo):
        return b"%PDF " + donnees["marqueur"].encode(), "application/pdf"

    def rendre(pdf, largeur, pages_max=20):
        if pdf.endswith(b"BLOQUE"):
            entree.set()
            assert porte.wait(15)
        return 1, [_webp(1)]

    monkeypatch.setattr(rendu, "fabriquer", faux_fabriquer)
    monkeypatch.setattr(rendu, "rendre_document_webp", rendre)
    yield porte, entree
    porte.set()


def _demande(org, marqueur):
    return rendu.demander_apercu(org, "moyens", "pdf", {"marqueur": marqueur}, {"titre": marqueur}, {}, None)


def _fin_des_fils(delai=10.0):
    fin = time.monotonic() + delai
    while rendu._entreprises and time.monotonic() < fin:
        time.sleep(0.01)
    assert not rendu._entreprises


def test_100_demandes_de_a_n_evincent_pas_l_etat_de_b(fabrique_a_marqueur):
    porte, entree = fabrique_a_marqueur
    eb = _demande("org-b", "BLOQUE")["empreinte"]
    assert entree.wait(5)
    for i in range(100):
        _demande("org-a", f"a{i}")
    assert rendu.etat_apercu("org-b", "moyens", eb)["etat"] == "en_cours"        # toujours là, toujours en cours
    porte.set()
    fin = time.monotonic() + 10
    while rendu.etat_apercu("org-b", "moyens", eb)["etat"] != "pret" and time.monotonic() < fin:
        time.sleep(0.02)
    assert rendu.etat_apercu("org-b", "moyens", eb) == {"etat": "pret", "pages": 1, "message": ""}
    _fin_des_fils()


def test_une_entree_en_cours_n_est_jamais_evincee(fabrique_a_marqueur):
    porte, entree = fabrique_a_marqueur
    e1 = _demande("org-a", "BLOQUE")["empreinte"]                                   # la plus ancienne, en cours
    assert entree.wait(5)
    for i in range(100):
        _demande("org-a", f"a{i}")
    assert rendu.etat_apercu("org-a", "moyens", e1)["etat"] == "en_cours"
    porte.set()
    _fin_des_fils()


def test_la_table_d_une_entreprise_reste_bornee_et_les_plus_anciennes_terminees_partent(fabrique_a_marqueur):
    porte, _ = fabrique_a_marqueur
    premiere = None
    for i in range(30):
        e = _demande("org-a", f"a{i}")["empreinte"]
        premiere = premiere or e
        fin = time.monotonic() + 10
        while rendu.etat_apercu("org-a", "moyens", e) and rendu.etat_apercu("org-a", "moyens", e)["etat"] == "en_cours" \
                and time.monotonic() < fin:
            time.sleep(0.005)
    _fin_des_fils()
    assert len(rendu._etats["org-a"]) <= rendu.ETATS_MAX_PAR_ENTREPRISE == 8
    assert e in rendu._etats["org-a"]                                               # la plus récente reste
    assert premiere not in rendu._etats["org-a"]                                    # la plus ancienne terminée est partie


def test_plafond_global_de_securite_sur_les_seules_entrees_terminees(fabrique_a_marqueur, monkeypatch):
    porte, entree = fabrique_a_marqueur
    monkeypatch.setattr(rendu, "ETATS_TERMINES_MAX", 6)
    en_cours = _demande("org-z", "BLOQUE")["empreinte"]
    assert entree.wait(5)
    for k in range(10):
        org = f"org-{k}"
        _demande(org, f"x{k}")
    # attendre que les autres entreprises aient terminé (celle de z reste bloquée)
    fin = time.monotonic() + 10
    while any(o != "org-z" for o in rendu._entreprises) and time.monotonic() < fin:
        time.sleep(0.01)
    termines = sum(1 for t in rendu._etats.values() for v in t.values() if v["etat"] != "en_cours")
    assert termines <= 6
    assert rendu.etat_apercu("org-z", "moyens", en_cours)["etat"] == "en_cours"
    porte.set()
    _fin_des_fils()
