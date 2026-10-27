"""Bloc 5 (sujet A), tranche 1 — l'ancre d'une exigence dans un tableur (DPGF, BPU, DQE).

Tableurs inventés (xlsx, xls, ods). On prouve : la ligne n'est surlignée que si le passage s'y
retrouve en entier et sans ambiguïté ; sinon la feuille (niveau « page ») ou rien ; accents,
cellules fusionnées, lignes vides, feuilles multiples, passage sur deux lignes, bornes d'un
tableur piégé, bombe refusée ; l'ancre est calculée à la fin de l'analyse, dans le processus.
"""
import io
import zipfile

import openpyxl
import pytest

from models.compliance_item import ComplianceItem
from models.project import Project, ProjectDocument
from services import ancres_projet, file_storage, pdfium_processus, tableur_ancre
from services.garde_archives import ArchiveDemesuree
from services.tableur_ancre import calculer_ancres, fenetre


def _classeur(feuilles: dict, fusions: dict | None = None) -> bytes:
    """feuilles : {nom: [(ligne, colonne, valeur), ...]} — positions à partir de 1."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for nom, cellules in feuilles.items():
        ws = wb.create_sheet(nom)
        for ligne, colonne, valeur in cellules:
            ws.cell(ligne, colonne, valeur)
        for zone in (fusions or {}).get(nom, []):
            ws.merge_cells(zone)
    flux = io.BytesIO()
    wb.save(flux)
    return flux.getvalue()


def _lignes(*lignes) -> list:
    return [(i, j, v) for i, ligne in enumerate(lignes, 1) for j, v in enumerate(ligne, 1) if v is not None]


@pytest.fixture
def fichier(tmp_path):
    def faire(octets: bytes, nom: str = "DPGF Lot 05.xlsx"):
        chemin = tmp_path / nom
        chemin.write_bytes(octets)
        return chemin
    return faire


def _ancre(chemin, extrait: str) -> dict:
    return calculer_ancres(str(chemin), "d1", [{"id": "e", "extrait": extrait}])["e"]


DPGF = _lignes(
    ["LOT 05 — FAÇADES", None, None, None],
    ["N°", "Désignation", "Unité", "Quantité"],
    [1, "Échafaudage de pied", "ens", 1],
    [2, "Enduit monocouche gratté", "m2", 240],
    [3, "Peinture de finition des soubassements", "m2", 35],
)


# ─── Passage unique : la ligne est surlignée ───────────────────────────────────

def test_ligne_unique_malgre_accents_et_casse(fichier):
    chemin = fichier(_classeur({"Lot 05": DPGF}))
    a = _ancre(chemin, "ECHAFAUDAGE DE PIED")
    assert a == {"version": 1, "format": "tableur", "doc_id": "d1", "feuille": "Lot 05",
                 "ligne": 3, "cellules": ["B"], "niveau": "passage"}


def test_extrait_sur_plusieurs_cellules_de_la_meme_ligne(fichier):
    chemin = fichier(_classeur({"Lot 05": DPGF}))
    a = _ancre(chemin, "Enduit monocouche gratté\tm2\t240")
    assert a["niveau"] == "passage" and a["ligne"] == 4 and a["cellules"] == ["B", "C", "D"]
    # les mêmes mots séparés par des espaces, comme l'écrit parfois le modèle
    assert _ancre(chemin, "Enduit monocouche gratté m2 240")["ligne"] == 4


def test_lignes_vides_et_numeros_exacts(fichier):
    chemin = fichier(_classeur({"F": _lignes(["Titre du bordereau"], [], [], [], ["Dépose des menuiseries anciennes"])}))
    a = _ancre(chemin, "Dépose des menuiseries anciennes")
    assert a["niveau"] == "passage" and a["ligne"] == 5 and a["cellules"] == ["A"]


def test_cellule_fusionnee_ligne_de_la_cellule_d_origine(fichier):
    chemin = fichier(_classeur({"F": _lignes(["Libellé", "Prix"], ["Sujétions générales de chantier", None], ["Autre", 3])},
                               fusions={"F": ["A2:B2"]}))
    a = _ancre(chemin, "Sujétions générales de chantier")
    assert a["niveau"] == "passage" and a["ligne"] == 2 and a["cellules"] == ["A"]


def test_feuilles_multiples_le_passage_d_une_seule_feuille(fichier):
    chemin = fichier(_classeur({"Tranche ferme": DPGF,
                                "Tranche optionnelle": _lignes(["Ravalement de la façade nord"], ["Nettoyage haute pression"])}))
    a = _ancre(chemin, "Nettoyage haute pression")
    assert (a["feuille"], a["ligne"], a["niveau"]) == ("Tranche optionnelle", 2, "passage")


def test_formule_lue_comme_l_extraction_du_dce(fichier):
    chemin = fichier(_classeur({"F": _lignes(["Mur en parpaing", 12, "=B1*45"])}))
    a = _ancre(chemin, "Mur en parpaing\t12\t=B1*45")
    assert a["niveau"] == "passage" and a["ligne"] == 1 and a["cellules"] == ["A", "B", "C"]


def test_mot_court_seulement_s_il_est_le_contenu_entier_d_une_cellule(fichier):
    chemin = fichier(_classeur({"F": _lignes(["Désignation", "Observations"], ["Forfait", "voir CCTP"], ["Dépose forfaitaire", "x"])}))
    a = _ancre(chemin, "Forfait")        # 7 lettres : cellule entière, une seule ligne
    assert a["niveau"] == "passage" and a["ligne"] == 2
    assert _ancre(chemin, "ens")["niveau"] == "aucun"        # moins de 4 lettres


# ─── Ambiguïté : jamais de devinette ──────────────────────────────────────────

def test_passage_present_sur_deux_lignes_niveau_page(fichier):
    chemin = fichier(_classeur({"Lot 05": DPGF + [(8, 2, "Échafaudage de pied")]}))
    a = _ancre(chemin, "Échafaudage de pied")
    assert (a["niveau"], a["feuille"], a["ligne"], a["cellules"]) == ("page", "Lot 05", None, [])


def test_passage_present_dans_deux_feuilles_aucun(fichier):
    chemin = fichier(_classeur({"A": _lignes(["Installation de chantier"]), "B": _lignes(["Installation de chantier"])}))
    a = _ancre(chemin, "Installation de chantier")
    assert a["niveau"] == "aucun" and a["feuille"] is None and a["ligne"] is None


def test_mot_court_repete_aucun(fichier):
    chemin = fichier(_classeur({"F": _lignes(["Forfait"], ["Forfait"])}))
    a = _ancre(chemin, "Forfait")
    assert a["niveau"] == "page" and a["ligne"] is None        # deux lignes de la même feuille


def test_extrait_de_deux_lignes_consecutives_niveau_page(fichier):
    chemin = fichier(_classeur({"Lot 05": DPGF}))
    a = _ancre(chemin, "Échafaudage de pied\tens\t1\nEnduit monocouche gratté\tm2\t240")
    assert a["niveau"] == "page" and a["feuille"] == "Lot 05" and a["ligne"] is None


def test_passage_introuvable_aucun(fichier):
    chemin = fichier(_classeur({"Lot 05": DPGF}))
    assert _ancre(chemin, "Un passage qui n'existe nulle part dans ce bordereau")["niveau"] == "aucun"
    assert _ancre(chemin, "")["niveau"] == "aucun"


def test_passage_a_cheval_sur_deux_cellules_d_autres_lignes_pas_de_faux_positif(fichier):
    # « pied » se termine la cellule B3 et « ens » commence C3 : un extrait court sur la frontière
    # n'est jamais retenu (contenu entier d'une cellule exigé sous 12 lettres)
    chemin = fichier(_classeur({"Lot 05": DPGF}))
    assert _ancre(chemin, "pied ens")["niveau"] == "aucun"


# ─── Tableur piégé ────────────────────────────────────────────────────────────

def test_borne_de_lignes_une_ligne_au_dela_interdit_de_surligner(fichier, monkeypatch):
    # le même texte plus loin que la borne peut exister : on ne peut pas affirmer l'unicité
    monkeypatch.setattr(tableur_ancre, "MAX_LIGNES", 10)
    cellules = [(3, 1, "Réseau d'eaux pluviales")] + [(i, 1, f"Poste {i}") for i in range(4, 10)] + [(15, 1, "Réseau d'eaux pluviales")]
    chemin = fichier(_classeur({"F": cellules}))
    a = _ancre(chemin, "Réseau d'eaux pluviales")
    assert a["niveau"] == "page" and a["feuille"] == "F" and a["ligne"] is None


def test_borne_de_lignes_sans_donnees_au_dela_reste_surlignable(fichier, monkeypatch):
    monkeypatch.setattr(tableur_ancre, "MAX_LIGNES", 10)
    chemin = fichier(_classeur({"F": [(3, 1, "Réseau d'eaux pluviales"), (4, 1, "Poste")]}))
    assert _ancre(chemin, "Réseau d'eaux pluviales")["niveau"] == "passage"


def test_borne_de_colonnes(fichier, monkeypatch):
    monkeypatch.setattr(tableur_ancre, "MAX_COLONNES", 4)
    chemin = fichier(_classeur({"F": [(1, 1, "Dépose des garde-corps"), (2, 9, "Dépose des garde-corps")]}))
    # la 2e occurrence est au-delà de la borne de colonnes : unicité non démontrable
    assert _ancre(chemin, "Dépose des garde-corps")["niveau"] == "page"


def test_borne_de_cellules(fichier, monkeypatch):
    monkeypatch.setattr(tableur_ancre, "MAX_CELLULES", 5)
    cellules = [(i, 1, f"Poste numéro {i}") for i in range(1, 12)]
    chemin = fichier(_classeur({"F": cellules}))
    a = _ancre(chemin, "Poste numéro 2")
    assert a["niveau"] == "page"        # lu jusqu'à la borne seulement : pas de surlignage


def test_dimension_declaree_enorme_lecture_bornee_sans_surlignage(fichier):
    octets = _classeur({"F": _lignes(["Désignation", "Qté"], ["Mur de soutènement", 3])})
    source = zipfile.ZipFile(io.BytesIO(octets))
    sortie = io.BytesIO()
    with zipfile.ZipFile(sortie, "w") as z:
        for info in source.infolist():
            donnees = source.read(info)
            if info.filename.startswith("xl/worksheets/sheet"):
                assert b"<dimension" in donnees
                donnees = donnees.replace(b'<dimension ref="A1:B2"/>', b'<dimension ref="A1:XFD1048576"/>')
            z.writestr(info, donnees)
    chemin = fichier(sortie.getvalue())
    a = _ancre(chemin, "Mur de soutènement")
    # le fichier annonce un million de lignes : lues jusqu'à la borne seulement, unicité non démontrable
    assert a["niveau"] == "page" and a["ligne"] is None


def test_bombe_de_decompression_refusee_avant_ouverture(fichier, monkeypatch):
    from tests.test_garde_tableurs import _bombe_xlsx

    def pas_ouvert(*a, **k):
        raise AssertionError("openpyxl ne doit pas être appelé")
    monkeypatch.setattr(openpyxl, "load_workbook", pas_ouvert)
    with pytest.raises(ArchiveDemesuree):
        _ancre(fichier(_bombe_xlsx()), "Mur de soutènement en béton")


# ─── Autres formats ───────────────────────────────────────────────────────────

def test_xls_biff(fichier):
    import xlwt

    classeur = xlwt.Workbook()
    feuille = classeur.add_sheet("Bordereau")
    for i, (a, b) in enumerate([("Désignation", "Unité"), ("Terrassement en déblai", "m3"), ("Évacuation des terres", "m3")]):
        feuille.write(i, 0, a)
        feuille.write(i, 1, b)
    flux = io.BytesIO()
    classeur.save(flux)
    a = _ancre(fichier(flux.getvalue(), "BPU.xls"), "Évacuation des terres")
    assert (a["feuille"], a["ligne"], a["cellules"], a["niveau"]) == ("Bordereau", 3, ["A"], "passage")


def test_xlsx_renomme_en_xls(fichier):
    chemin = fichier(_classeur({"F": _lignes(["Désignation"], ["Mur de clôture en parpaings"])}), "DQE.xls")
    assert _ancre(chemin, "Mur de clôture en parpaings")["ligne"] == 2


def _ods(feuilles: dict) -> bytes:
    def cellule(v):
        if v is None:
            return "<table:table-cell/>"
        if isinstance(v, (int, float)):
            return f'<table:table-cell office:value-type="float" office:value="{v}"><text:p>{v}</text:p></table:table-cell>'
        return f'<table:table-cell office:value-type="string"><text:p>{v}</text:p></table:table-cell>'

    def ligne(valeurs):
        if not valeurs:
            return '<table:table-row table:number-rows-repeated="3"><table:table-cell table:number-columns-repeated="8"/></table:table-row>'
        return "<table:table-row>" + "".join(cellule(v) for v in valeurs) + "</table:table-row>"

    tables = "".join(f'<table:table table:name="{nom}">' + "".join(ligne(v) for v in lignes) + "</table:table>"
                     for nom, lignes in feuilles.items())
    contenu = ('<?xml version="1.0" encoding="UTF-8"?><office:document-content '
               'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
               'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
               'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">'
               f"<office:body><office:spreadsheet>{tables}</office:spreadsheet></office:body></office:document-content>")
    flux = io.BytesIO()
    with zipfile.ZipFile(flux, "w") as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.spreadsheet")
        z.writestr("content.xml", contenu)
    return flux.getvalue()


def test_ods_numeros_de_ligne_exacts_apres_des_lignes_vides_repetees(fichier):
    chemin = fichier(_ods({"Lot": [["Désignation", "Unité"], [], ["Faux plafond acoustique", "m2"]]}), "DPGF.ods")
    # trois lignes vides répétées (2 à 4) : la ligne citée est la 5
    a = _ancre(chemin, "Faux plafond acoustique")
    assert (a["feuille"], a["ligne"], a["niveau"]) == ("Lot", 5, "passage")


# ─── La fenêtre affichée (réutilisée par la route) ────────────────────────────

def test_fenetre_entete_et_ligne_citee(fichier):
    chemin = fichier(_classeur({"Lot 05": DPGF}))
    f = fenetre(str(chemin), "Lot 05", 4)
    assert f["colonnes"] == ["A", "B", "C", "D"]
    assert f["entete"] == {"n": 2, "cellules": ["N°", "Désignation", "Unité", "Quantité"]}
    cible = [r for r in f["lignes"] if r["cible"]]
    assert [r["n"] for r in cible] == [4] and cible[0]["cellules"] == ["2", "Enduit monocouche gratté", "m2", "240"]
    assert [r["n"] for r in f["lignes"]] == [1, 3, 4, 5]     # l'en-tête n'est pas répété


def test_fenetre_bornee_autour_de_la_ligne(fichier):
    cellules = [(1, 1, "Désignation"), (1, 2, "Unité")] + [(i, 1, f"Ouvrage {i}") for i in range(2, 200)]
    chemin = fichier(_classeur({"F": cellules}))
    f = fenetre(str(chemin), "F", 100, avant=30, apres=30)
    numeros = [r["n"] for r in f["lignes"]]
    assert min(numeros) == 70 and max(numeros) == 130 and len(numeros) == 61
    assert f["entete"]["n"] == 1


def test_fenetre_colonnes_bornees_gardent_les_colonnes_citees(fichier):
    ligne = [(1, c, f"v{c}") for c in range(1, 41)]
    chemin = fichier(_classeur({"F": ligne}))
    f = fenetre(str(chemin), "F", 1, max_colonnes=5)
    assert len(f["colonnes"]) == 5 and f["colonnes_tronquees"] is True


def test_fenetre_feuille_inconnue_ou_sans_ligne(fichier):
    chemin = fichier(_classeur({"F": DPGF}))
    assert fenetre(str(chemin), "Autre", 3) is None
    haut = fenetre(str(chemin), "F", None)
    assert haut["ligne"] is None and not any(r["cible"] for r in haut["lignes"])


def test_fenetre_valeurs_en_texte_sans_calcul(fichier):
    chemin = fichier(_classeur({"F": _lignes(["Désignation", "Quantité", "Prix"], ["Ouvrage", 12.0, 1234.5], ["Ouvrage 2", 3, True])}))
    f = fenetre(str(chemin), "F", 2)
    assert f["lignes"][0]["cellules"] == ["Ouvrage", "12", "1234.5"]
    assert f["lignes"][1]["cellules"] == ["Ouvrage 2", "3", "Vrai"]


# ─── À la fin de l'analyse : calcul dans le processus, par pièce ──────────────

@pytest.fixture(autouse=True)
def _processus_propres():
    pdfium_processus.arreter()
    yield
    pdfium_processus.arreter()


@pytest.fixture
def projet(db_session, test_org, tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage, "UPLOADS_ROOT", tmp_path)
    dossier = tmp_path / "projects" / "p-tab"
    dossier.mkdir(parents=True)
    (dossier / "dpgf.xlsx").write_bytes(_classeur({"Lot 05": DPGF}))
    db_session.add(Project(id="p-tab", organization_id=test_org.id, name="AO"))
    db_session.add_all([
        ProjectDocument(id="d-dpgf", project_id="p-tab", type="dpgf_template", file_name="dpgf.xlsx",
                        file_url="/uploads/projects/p-tab/dpgf.xlsx"),
        ProjectDocument(id="d-bpu", project_id="p-tab", type="autre", file_name="bpu.xlsx",
                        file_url="/uploads/projects/p-tab/bpu.xlsx"),     # fichier absent du disque
    ])

    def exigence(id_, doc, extrait):
        db_session.add(ComplianceItem(id=id_, project_id="p-tab", exigence_text="e", source_document=doc,
                                      source_page=None, source_excerpt=extrait))
    exigence("t1", "dpgf.xlsx", "Échafaudage de pied")
    exigence("t2", "dpgf.xlsx", "Peinture de finition des soubassements")
    exigence("t3", "dpgf.xlsx", "Un poste que le bordereau ne contient pas")
    exigence("t4", "bpu.xlsx", "Échafaudage de pied")
    db_session.commit()
    return db_session


def _rangees(db):
    db.expire_all()
    return {c.id: c.ancre for c in db.query(ComplianceItem).filter_by(project_id="p-tab")}


def test_ancres_calculees_et_rangees_a_la_fin_de_l_analyse(projet):
    bilan = ancres_projet.calculer_et_stocker(projet, "p-tab")
    a = _rangees(projet)
    assert a["t1"]["format"] == "tableur" and a["t1"]["ligne"] == 3 and a["t1"]["doc_id"] == "d-dpgf"
    assert a["t2"]["niveau"] == "passage" and a["t2"]["ligne"] == 5 and a["t2"]["feuille"] == "Lot 05"
    assert a["t3"]["niveau"] == "aucun" and a["t3"]["format"] == "tableur"     # pièce lue, rien à montrer : rangé
    assert a["t4"] is None                                                      # fichier absent : pas d'ancre
    assert bilan["pieces"] == 1 and bilan["passage"] == 2 and bilan["aucune"] == 1


def test_un_seul_aller_retour_par_tableur(projet, monkeypatch):
    appels = []
    vrai = pdfium_processus.executer
    monkeypatch.setattr(pdfium_processus, "executer", lambda *a, **k: appels.append(a[0].__name__) or vrai(*a, **k))
    ancres_projet.calculer_et_stocker(projet, "p-tab")
    assert appels == ["calculer_ancres"]


def test_tableur_piege_ne_casse_pas_l_analyse(projet, tmp_path):
    from tests.test_garde_tableurs import _bombe_xlsx

    (tmp_path / "projects" / "p-tab" / "dpgf.xlsx").write_bytes(_bombe_xlsx())
    bilan = ancres_projet.calculer_et_stocker(projet, "p-tab")
    assert bilan["echecs"] == 1 and _rangees(projet)["t1"] is None
