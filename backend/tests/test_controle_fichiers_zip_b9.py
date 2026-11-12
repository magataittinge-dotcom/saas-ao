"""B9 — contrôle des fichiers du ZIP avant le dépôt sur la plateforme de l'acheteur.

Lignes « À relire », jamais bloquantes : passages « [À COMPLÉTER » restants, noms de fichiers à caractères qui
cassent (et chemins trop longs), taille par fichier comparée à la limite du règlement SI l'analyse l'a relevée.
ZIP, fichiers et règlement inventés."""
import io
import zipfile

import docx
import pytest

from services.controle_fichiers_zip import A_RELIRE, controler_fichiers_zip, limite_de_taille
from tests.pdf_fabrique import pdf_texte

MOTS_INTERDITS = ("manquant", "incomplet", "absent")


def _docx(*paragraphes: str) -> bytes:
    d = docx.Document()
    for p in paragraphes:
        d.add_paragraph(p)
    tampon = io.BytesIO()
    d.save(tampon)
    return tampon.getvalue()


def _zip(fichiers: dict) -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as zf:
        for nom, octets in fichiers.items():
            zf.writestr(nom, octets)
    return tampon.getvalue()


def _propres(lignes):
    for l in lignes:
        assert l["libelle"] == A_RELIRE
        assert all(m not in l["texte"].lower() for m in MOTS_INTERDITS)
        assert "!" not in l["texte"]
        assert l["source"], l          # chaque ligne dit d'où elle vient
    return lignes


# ─── Règlement : limite de taille ────────────────────────────────────────────

def test_limite_par_fichier_lue_dans_une_exigence():
    exigences = [
        {"texte": "Le mémoire technique ne devra pas dépasser 20 pages.", "source": {"type": "exigence", "id": "e1"}},
        {"texte": "La taille de chaque fichier ne doit pas excéder 10 Mo.", "source": {"type": "exigence", "id": "e2"}},
    ]
    limite = limite_de_taille(exigences)
    assert limite == {"octets": 10_000_000, "libelle": "10 Mo", "portee": "fichier",
                      "source": {"type": "exigence", "id": "e2"}}


def test_limite_du_pli_entier():
    limite = limite_de_taille([{"texte": "Le poids total du pli est limité à 1 Go.", "source": {"id": "e3"}}])
    assert limite["portee"] == "ensemble" and limite["octets"] == 1_000_000_000


def test_sans_limite_relevee_rien_n_est_invente():
    assert limite_de_taille([{"texte": "Les offres sont rédigées en français.", "source": None}]) is None
    assert limite_de_taille([{"texte": "Un capital de 50 Mo ne veut rien dire ici", "source": None}]) is None
    assert limite_de_taille([]) is None


# ─── ZIP inventé ─────────────────────────────────────────────────────────────

def test_un_zip_propre_ne_donne_aucune_ligne():
    z = _zip({
        "Reponse_AO_Ecole/01_Candidature/01_DC1.pdf": pdf_texte(["DC1 rempli par Maconnerie du Bocage"]),
        "Reponse_AO_Ecole/02_Offre/Memoire_technique.docx": _docx("1. Organisation du chantier", "Texte final."),
    })
    assert controler_fichiers_zip(z) == []


def test_les_passages_a_completer_restants_sont_signales_avec_leur_page():
    z = _zip({
        "R/02_Offre/Memoire_technique.pdf": pdf_texte(["Préambule", "Effectif : [À COMPLÉTER : nombre de compagnons]",
                                                       "Fin [A COMPLETER] et [à compléter par l'entreprise]"]),
        "R/01_Candidature/01_DC2.docx": _docx("Chiffre d'affaires : [À COMPLÉTER : CA 2025]"),
    })
    lignes = _propres(controler_fichiers_zip(z))
    par_fichier = {l["fichier"]: l for l in lignes if l["type"] == "a_completer"}
    pdf = par_fichier["R/02_Offre/Memoire_technique.pdf"]
    assert pdf["nombre"] == 3 and pdf["pages"] == [2, 3]
    assert "3 passages « [À COMPLÉTER » " in pdf["texte"] and "pages 2, 3" in pdf["texte"]
    assert par_fichier["R/01_Candidature/01_DC2.docx"]["nombre"] == 1
    assert pdf["source"] == {"type": "fichier", "fichier": "R/02_Offre/Memoire_technique.pdf"}


def test_les_noms_a_caracteres_qui_cassent_sont_signales():
    z = _zip({
        "R/01_Candidature/Attestation d'assurance été.pdf": b"%PDF-1.4",
        "R/01_Candidature/Kbis&URSSAF.pdf": b"%PDF-1.4",
        "R/01_Candidature/02_Kbis.pdf": b"%PDF-1.4",
    })
    lignes = _propres([l for l in controler_fichiers_zip(z) if l["type"] == "nom"])
    assert sorted(l["fichier"] for l in lignes) == ["R/01_Candidature/Attestation d'assurance été.pdf",
                                                     "R/01_Candidature/Kbis&URSSAF.pdf"]
    assert all(mot in lignes[0]["texte"] for mot in ("apostrophe", "accent", "espace"))
    assert "&" in lignes[1]["texte"]
    assert lignes[0]["source"]["type"] == "regle" and lignes[0]["source"]["url"].startswith("https://")


def test_un_chemin_trop_long_est_signale():
    long = "R/01_Candidature/" + "x" * 140 + ".pdf"
    lignes = _propres([l for l in controler_fichiers_zip(_zip({long: b"%PDF-1.4"})) if l["type"] == "chemin"])
    assert len(lignes) == 1 and "150" in lignes[0]["texte"]


def test_la_taille_par_fichier_est_comparee_a_la_limite_du_reglement():
    gros = b"0" * 1_200_000
    z = _zip({"R/02_Offre/Annexe.pdf": gros, "R/02_Offre/petit.pdf": b"%PDF-1.4"})
    limite = {"octets": 1_000_000, "libelle": "1 Mo", "portee": "fichier", "source": {"type": "exigence", "id": "e9"}}
    lignes = _propres([l for l in controler_fichiers_zip(z, limite) if l["type"] == "taille"])
    assert [l["fichier"] for l in lignes] == ["R/02_Offre/Annexe.pdf"]
    assert "1,2 Mo" in lignes[0]["texte"] and "1 Mo" in lignes[0]["texte"]
    assert lignes[0]["source"] == {"type": "exigence", "id": "e9"}
    # sans limite relevée : aucune ligne de taille
    assert [l for l in controler_fichiers_zip(z) if l["type"] == "taille"] == []


def test_la_limite_du_pli_compare_l_ensemble():
    z = _zip({"R/a.pdf": b"0" * 700_000, "R/b.pdf": b"1" * 700_000})
    limite = {"octets": 1_000_000, "libelle": "1 Mo", "portee": "ensemble", "source": {"type": "exigence", "id": "e4"}}
    lignes = [l for l in controler_fichiers_zip(z, limite) if l["type"] == "taille"]
    assert len(lignes) == 1 and lignes[0]["fichier"] is None and "1,4 Mo" in lignes[0]["texte"]


def test_un_zip_illisible_ne_casse_rien():
    assert controler_fichiers_zip(b"pas un zip") == []


# ─── Route : « Avant de déposer », sur le même plan que le ZIP ───────────────

@pytest.fixture
def uploads(tmp_path, monkeypatch):
    import routers.export as export
    monkeypatch.setattr(export, "UPLOADS_ROOT", tmp_path)
    return tmp_path


def _dossier(db, org_id, uploads, pid="p-b9", exigence=None):
    from models.compliance_item import ComplianceItem
    from models.memoire import MemoireTechnique
    from models.project import Project, ProjectDocument
    dossier = uploads / "projects" / pid / "completed"
    dossier.mkdir(parents=True)
    (dossier / "u_DC2.docx").write_bytes(_docx("Chiffre d'affaires : [À COMPLÉTER : CA 2025]"))
    (dossier / "u_AE.pdf").write_bytes(b"0" * 1_500_000)
    db.add(Project(id=pid, organization_id=org_id, name="AO B9"))
    db.add_all([
        ProjectDocument(id=f"{pid}-dc2", project_id=pid, type="dc2_template", is_user_completed=True,
                        file_url=f"/uploads/projects/{pid}/completed/u_DC2.docx", file_name="DC2 rempli.docx"),
        ProjectDocument(id=f"{pid}-ae", project_id=pid, type="acte_engagement_template", is_user_completed=True,
                        file_url=f"/uploads/projects/{pid}/completed/u_AE.pdf", file_name="AE.pdf"),
    ])
    db.add(MemoireTechnique(project_id=pid, content_json={
        "preambule": "Nous [À COMPLÉTER : effectif] compagnons.", "partie_a": {}, "partie_b": {}, "partie_c": {}}))
    if exigence:
        db.add(ComplianceItem(id=f"{pid}-ex", project_id=pid, exigence_text=exigence, category="candidature",
                              priority="obligatoire"))
    db.commit()
    return f"/api/projects/{pid}/export/controle-fichiers"


def test_la_route_controle_les_fichiers_du_dossier(client, db_session, test_org, uploads):
    url = _dossier(db_session, test_org.id, uploads,
                   exigence="Chaque fichier déposé ne doit pas dépasser 1 Mo.")
    r = client.get(url)
    assert r.status_code == 200, r.text
    corps = r.json()
    lignes = _propres(corps["lignes"])
    assert corps["nombre"] == len(lignes) and corps["limite_taille"]["octets"] == 1_000_000
    types = {(l["type"], (l["fichier"] or "").rsplit("/", 1)[-1]) for l in lignes}
    assert ("a_completer", "Memoire_technique.pdf") in types or ("a_completer", "Memoire_technique.docx") in types
    assert ("a_completer", "01_DC2_rempli.docx") in types           # le nom du ZIP, nettoyé par l'export
    assert ("taille", "AE.pdf") in types
    assert not any(l["type"] == "nom" for l in lignes)              # l'export nettoie déjà les noms
    taille = next(l for l in lignes if l["type"] == "taille")
    assert taille["source"]["type"] == "exigence" and taille["source"]["id"] == "p-b9-ex"


def test_sans_limite_relevee_pas_de_ligne_de_taille(client, db_session, test_org, uploads):
    url = _dossier(db_session, test_org.id, uploads)
    corps = client.get(url).json()
    assert corps["limite_taille"] is None
    assert not any(l["type"] == "taille" for l in corps["lignes"])


def test_le_controle_d_une_autre_organisation_reste_invisible(client, db_session, uploads):
    from models.organization import Organization
    db_session.add(Organization(id="org-b9-autre", name="Autre"))
    db_session.commit()
    url = _dossier(db_session, "org-b9-autre", uploads, pid="p-b9-autre")
    r = client.get(url)
    assert r.status_code == 404
    assert "DC2" not in r.text


# ─── P2-3 (relecture du 12/11) : 30 pages lues au plus, comme le dépôt (B7), et un cache par fichier ──────────

def test_p2_3_un_formulaire_est_lu_sur_30_pages_au_plus(monkeypatch):
    import services.pdf_lecture as pdf_lecture
    from services.controle_fichiers_zip import FichierAControler, controler_fichiers
    demandes = []
    vrai = pdf_lecture.lire_document

    def _espion(octets, max_pages=None, **kw):
        demandes.append(max_pages)
        return vrai(octets, max_pages=max_pages, **kw)
    monkeypatch.setattr(pdf_lecture, "lire_document", _espion)
    octets = pdf_texte(["Page sans rien"] * 2 + ["Nom : [À COMPLÉTER : nom]"])
    lignes = controler_fichiers([FichierAControler("D/01_DC1.pdf", len(octets), lambda: octets)])
    assert demandes == [30]
    assert [l["pages"] for l in lignes if l["type"] == "a_completer"] == [[3]]


def test_p2_3_un_fichier_inchange_n_est_pas_relu(monkeypatch):
    from services import controle_fichiers_zip as cfz
    monkeypatch.setattr(cfz, "_CACHE", type(cfz._CACHE)())
    lectures = []
    octets = _docx("Chiffre d'affaires : [À COMPLÉTER : CA 2025]")

    def lire():
        lectures.append(1)
        return octets

    def controle(cle, nom="D/01_DC2_rempli.docx"):
        return cfz.controler_fichiers([cfz.FichierAControler(nom, len(octets), lire, cle)])

    premier = controle(("/u/projects/p/completed/u_DC2.docx", len(octets), 111))
    assert controle(("/u/projects/p/completed/u_DC2.docx", len(octets), 111)) == premier
    assert len(lectures) == 1                                   # même fichier, même date : lu une fois
    controle(("/u/projects/p/completed/u_DC2.docx", len(octets), 222))
    assert len(lectures) == 2                                   # modifié : relu
    autre = controle(("/u/projects/p/completed/u_DC2.docx", len(octets), 222), nom="D/02_Autre_nom.docx")
    assert autre[0]["fichier"] == "D/02_Autre_nom.docx"         # la ligne garde le nom de CE fichier du ZIP
    assert len(lectures) == 2
    controle(None)
    controle(None)
    assert len(lectures) == 4                                   # sans clé (ZIP en mémoire) : jamais de cache


def test_p2_3_la_route_ne_relit_pas_un_formulaire_inchange(client, db_session, test_org, uploads, monkeypatch):
    from services import controle_fichiers_zip as cfz
    monkeypatch.setattr(cfz, "_CACHE", type(cfz._CACHE)())
    lus = []
    vrai = cfz._textes_par_page
    monkeypatch.setattr(cfz, "_textes_par_page", lambda nom, octets: lus.append(nom) or vrai(nom, octets))
    url = _dossier(db_session, test_org.id, uploads)
    premier = client.get(url).json()
    n = len(lus)
    assert n >= 1                                               # le DC2 et l'acte d'engagement remplis
    assert client.get(url).json() == premier
    assert len(lus) == n                                        # rien relu au second appel
