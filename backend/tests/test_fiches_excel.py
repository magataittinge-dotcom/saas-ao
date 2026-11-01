"""Fiches « Mon entreprise » en Excel (F1) : le classeur généré est ROUVERT par openpyxl et vérifié.

Identité et Moyens : UNE SEULE feuille « Fiche » (chiffres clés puis chaque section l'une sous l'autre, tableau à
deux colonnes) ; Références : une feuille par section et une feuille « Références ». En-tête figé, formats des
montants et des dates, aucune ligne vide, références avec TOTAL, injection de formules neutralisée, route ``format=xlsx``
(nom de fichier, type MIME, isolation entre entreprises). Données inventées (tests/fiches_fabrique.py).
"""
import io

import pytest
from openpyxl import load_workbook

from services import fiches_donnees as fd
from services import fiches_excel as xl
from tests import fiches_fabrique as fab
from tests.test_fiches_entreprise import _se_connecter_comme, deux_entreprises  # noqa: F401  (fixture)

BASE = "/api/entreprise/fiches"


@pytest.fixture
def entreprise(db_session):
    org = fab.creer_entreprise(db_session)
    fab.creer_documents(db_session, org.id)
    return org


def _classeur(db, org, rubrique, **surcharges):
    d = fab.donnees(db, org, rubrique)
    b = fab.bordereau(rubrique, **surcharges)
    return load_workbook(io.BytesIO(xl.generer_xlsx(d, b, fd.palette(b["couleur"])))), d, b


def _lignes(ws):
    return [[c.value for c in ligne] for ligne in ws.iter_rows()]


def _aucune_ligne_vide(wb):
    for ws in wb.worksheets:
        for i, ligne in enumerate(ws.iter_rows(min_row=1, max_row=ws.max_row), start=1):
            assert any(c.value not in (None, "") for c in ligne), f"{ws.title} : ligne {i} vide"


def _titres_de_section(ws):
    """Lignes de titre de section (colonne A seule renseignée, police de titre) d'une feuille unique."""
    return [str(l[0]) for l in _lignes(ws)[3:] if l[0] and not any(c not in (None, "") for c in l[1:])]


@pytest.mark.parametrize("rubrique", ["identite", "moyens"])
def test_identite_et_moyens_une_seule_feuille_fiche(db_session, entreprise, rubrique):
    wb, d, _ = _classeur(db_session, entreprise, rubrique)
    assert wb.sheetnames == ["Fiche"]
    ws = wb["Fiche"]
    assert [c.value for c in ws[3]][:2] == ["INFORMATION", "VALEUR"]
    titres = _titres_de_section(ws)
    assert titres[0] == "Chiffres clés"
    attendus = [f"{s['id']} {s['titre']}" for s in d["sections"] if not s["vide"]]
    assert titres[1:] == attendus                                   # chaque section, dans l'ordre, sous son intitulé
    assert all(s["vide"] or f"{s['id']} {s['titre']}" in titres for s in d["sections"])
    _aucune_ligne_vide(wb)


def _sans_echeance(d):
    for section in d["sections"]:
        for l in section["lignes"]:
            l["fin"] = None
    for l in d.get("lignes_cles") or []:
        l["fin"] = None


def test_moyens_une_feuille_les_sections_l_une_sous_l_autre_en_deux_colonnes(db_session, entreprise):
    d = fab.donnees(db_session, entreprise, "moyens")
    _sans_echeance(d)
    b = fab.bordereau("moyens")
    ws = load_workbook(io.BytesIO(xl.generer_xlsx(d, b, fd.palette(b["couleur"]))))["Fiche"]
    assert ws.max_column == 2                                       # aucune ligne datée : Information · Valeur seulement
    lignes = _lignes(ws)
    assert any("Chefs d'équipe" in str(l[1]) for l in lignes[3:])
    i_humains = next(i for i, l in enumerate(lignes) if l[0] == "01 Moyens humains")
    i_info = next(i for i, l in enumerate(lignes) if l[0] == "02 Moyens informatiques")
    i_chefs = next(i for i, l in enumerate(lignes) if "Chefs d'équipe" in str(l[1]))
    assert i_humains < i_chefs < i_info
    assert lignes[2][:2] == ["INFORMATION", "VALEUR"] and ws.freeze_panes == "A4"
    assert ws.print_title_rows == "$3:$3" and ws.page_setup.orientation == "portrait"
    assert ws.page_setup.fitToWidth == 1 and ws.page_setup.fitToHeight == 0


def test_feuille_unique_ajoute_la_colonne_echeance_quand_une_ligne_porte_une_date(db_session, entreprise):
    d = fab.donnees(db_session, entreprise, "moyens")
    _sans_echeance(d)
    d["sections"][0]["lignes"][0]["fin"] = "2027-03-31"
    b = fab.bordereau("moyens")
    ws = load_workbook(io.BytesIO(xl.generer_xlsx(d, b, fd.palette(b["couleur"]))))["Fiche"]
    assert [c.value for c in ws[3]] == ["INFORMATION", "VALEUR", "ÉCHÉANCE"]
    datees = [l[2] for l in ws.iter_rows(min_row=4) if l[2].value is not None]
    assert len(datees) == 1 and datees[0].number_format == "DD/MM/YYYY" and datees[0].value.year == 2027


def test_certifications_garde_une_feuille_par_section(db_session, entreprise):
    wb, d, _ = _classeur(db_session, entreprise, "certifications")
    assert wb.sheetnames[0] == "Chiffres clés" and "Références" in wb.sheetnames
    for section in d["sections"]:
        if not section["vide"]:
            assert any(n.startswith(f"{section['id']} ") for n in wb.sheetnames), (section["id"], wb.sheetnames)
    assert max(len(n) for n in wb.sheetnames) <= 31


def test_entete_de_classeur_et_en_tete_fige(db_session, entreprise):
    wb, d, b = _classeur(db_session, entreprise, "identite", titre="FICHE POUR LA CONSULTATION")
    for ws in wb.worksheets:
        assert "SIRET 12345678900019" in ws["A1"].value and "Lambert Maçonnerie" in ws["A1"].value
        assert ws["A2"].value.startswith("FICHE POUR LA CONSULTATION")
        assert ws.freeze_panes == "A4"                                      # les intitulés (ligne 3) restent à l'écran
        assert ws.print_title_rows == "$3:$3"
        assert ws.page_setup.fitToWidth == 1 and ws.sheet_properties.pageSetUpPr.fitToPage
        assert str(ws.page_setup.paperSize) == ws.PAPERSIZE_A4
    assert wb.properties.title == "FICHE POUR LA CONSULTATION"
    ws = wb["Fiche"]
    lignes = _lignes(ws)
    i = next(i for i, l in enumerate(lignes) if l[0] == "01 Identité de l'entreprise")
    assert ["Raison sociale", "Forme juridique", "SIRET"] == [r[0] for r in lignes[i + 1:i + 4]]
    assert ws.column_dimensions["A"].width >= 30 and ws.column_dimensions["B"].width >= 60


def test_references_colonnes_montants_nombres_et_total(db_session, entreprise):
    wb, d, _ = _classeur(db_session, entreprise, "certifications")
    ws = wb["Références"]
    assert [c.value for c in ws[3]] == ["N°", "CLIENT / DONNEUR D'ORDRE", "INTERVENTION",
                                        "CHANTIER ET TRAVAUX RÉALISÉS", "MONTANT HT"]
    ref = d["references"]
    n = len(ref["lignes"])
    premiere = [c.value for c in ws[4]]
    assert premiere[0] == 1 and premiere[1].startswith(ref["lignes"][0]["client"])
    assert premiere[4] == ref["lignes"][0]["montant_valeur"] and isinstance(premiere[4], (int, float))
    assert ws["E4"].number_format == xl.FORMAT_EUROS
    total = [c.value for c in ws[4 + n]]
    assert total[1].startswith(f"TOTAL · {n} chantiers") and total[4] == pytest.approx(ref["total"]["montant_valeur"])
    assert total[4] == pytest.approx(sum(l["montant_valeur"] for l in ref["lignes"]))
    assert ws.cell(5 + n, 1).value == ref["note"]                          # la note suit le total, sans ligne vide
    assert ws.max_row == 5 + n
    assert ws.page_setup.orientation == "landscape"                         # tableau large : paysage, une page de large
    assert any(c.data_type == "s" and "\n" in str(c.value) for c in ws["D"][3:])   # chantier, lieu et travaux dans la cellule


def test_particulier_et_adresse_du_client_dans_la_cellule_client(db_session, entreprise):
    wb, d, _ = _classeur(db_session, entreprise, "certifications")
    ws = wb["Références"]
    cellules = [str(c.value) for c in ws["B"][3:]]
    assert any("(particulier)" in c and "4 rue des Roses" in c for c in cellules)


def test_dates_au_format_jj_mm_aaaa_dans_la_colonne_echeance(db_session, entreprise):
    wb, d, _ = _classeur(db_session, entreprise, "certifications")
    trouve = False
    for ws in wb.worksheets:
        if ws.title == "Références" or ws.max_column < 3:
            continue
        assert [c.value for c in ws[3]][2] == "ÉCHÉANCE"
        for ligne in ws.iter_rows(min_row=4):
            if ligne[2].value is not None:
                trouve = True
                assert ligne[2].number_format == "DD/MM/YYYY" and hasattr(ligne[2].value, "year")
    assert trouve


def test_aucune_ligne_vide_nulle_part(db_session, entreprise):
    for rubrique in fd.TITRES:
        wb, _, _ = _classeur(db_session, entreprise, rubrique)
        _aucune_ligne_vide(wb)


def test_lignes_libres_dans_leur_section_et_ligne_sans_valeur_ignoree(db_session, entreprise):
    wb, _, _ = _classeur(db_session, entreprise, "moyens", lignes_libres=[
        {"section": "02", "libelle": "Logiciel", "valeur": "Suite de métrés XYZ"},
        {"section": "02", "libelle": "Sans valeur", "valeur": "  "}])
    textes = " ".join(str(c) for l in _lignes(wb["Fiche"]) for c in l)
    assert "Suite de métrés XYZ" in textes and "Sans valeur" not in textes
    lignes = _lignes(wb["Fiche"])
    i_logiciel = next(i for i, l in enumerate(lignes) if l[0] == "Logiciel")
    i_titre = max(i for i, l in enumerate(lignes[:i_logiciel]) if l[0] == "02 Moyens informatiques")
    assert i_titre < i_logiciel                                         # la ligne libre est dans SA section


@pytest.mark.parametrize("debut", ["=", "+", "-", "@", "\t", "\r"])
def test_injection_de_formules_neutralisee_partout(db_session, entreprise, debut):
    piege = f"{debut}HYPERLINK(\"http://x.example\",\"cliquez\")"
    d = fab.donnees(db_session, entreprise, "certifications")
    d["societe"]["nom"] = piege
    d["references"]["lignes"][0]["client"] = piege
    d["references"]["lignes"][0]["chantier"] = piege
    d["sections"][0]["lignes"].insert(0, {"libelle": piege, "valeur": piege})
    d["tuiles"][0]["libelle"] = piege
    b = fab.bordereau("certifications", titre=piege, sous_titre=piege,
                      lignes_libres=[{"section": "02", "libelle": piege, "valeur": piege}])
    octets = xl.generer_xlsx(d, b, fd.palette(b["couleur"]))
    wb = load_workbook(io.BytesIO(octets))
    vus = 0
    for ws in wb.worksheets:
        for ligne in ws.iter_rows():
            for c in ligne:
                assert c.data_type != "f", (ws.title, c.coordinate)         # aucune formule dans le classeur
                if isinstance(c.value, str):
                    assert not c.value.startswith(("=", "+", "-", "@", "\t", "\r")), (ws.title, c.coordinate, c.value)
                    vus += "HYPERLINK" in c.value
    assert vus >= 6
    assert wb["Références"]["B4"].value.startswith("'" + debut)


def test_neutraliser_ne_touche_pas_aux_autres_valeurs():
    assert xl.neutraliser("Réception des travaux") == "Réception des travaux"
    assert xl.neutraliser(12) == 12 and xl.neutraliser(None) is None
    assert xl.neutraliser("=1+1") == "'=1+1" and xl.neutraliser("+33 6 00 00 00 00") == "'+33 6 00 00 00 00"


def test_noms_de_feuille_sains_et_uniques(db_session, entreprise):
    d = fab.donnees(db_session, entreprise, "certifications")
    d["sections"][0]["titre"] = "Moyens: humains/techniques [détail] ?*"
    d["sections"][1]["titre"] = d["sections"][0]["titre"]
    d["sections"][1]["id"] = d["sections"][0]["id"]
    b = fab.bordereau("certifications")
    wb = load_workbook(io.BytesIO(xl.generer_xlsx(d, b, fd.palette(b["couleur"]))))
    noms = [n.lower() for n in wb.sheetnames]
    assert len(noms) == len(set(noms)) and all(not set("\\/*?:[]") & set(n) for n in noms)


def test_fiche_sans_aucune_donnee_donne_une_feuille(db_session, entreprise):
    d = fab.donnees(db_session, entreprise, "moyens")
    d.update(tuiles=[], lignes_cles=[], sections=[], references=None)
    b = fab.bordereau("moyens")
    wb = load_workbook(io.BytesIO(xl.generer_xlsx(d, b, fd.palette(b["couleur"]))))
    assert wb.sheetnames == ["Fiche"]
    _aucune_ligne_vide(wb)


# ─── Route ─────────────────────────────────────────────────────────────────────

def test_route_generer_excel(client, deux_entreprises):
    r = client.post(f"{BASE}/certifications/generer?format=xlsx")
    assert r.status_code == 200
    assert r.headers["content-type"] == xl.TYPE_XLSX
    assert 'filename="Fiche_entreprise_references_certifications_Lambert_Ma' in r.headers["content-disposition"]
    assert r.headers["content-disposition"].split('filename="')[1].split('"')[0].endswith(".xlsx")
    assert r.headers["cache-control"] == "private, no-store"
    wb = load_workbook(io.BytesIO(r.content))
    assert "Références" in wb.sheetnames
    assert wb["Références"]["B4"].value.startswith("Ville de Reims") or wb["Références"]["B4"].value.startswith("Habitat Marne")


def test_route_excel_utilise_le_bordereau_enregistre(client, deux_entreprises):
    client.put(f"{BASE}/moyens", json={"titre": "MES MOYENS 2026", "sous_titre": "Pour la consultation"})
    wb = load_workbook(io.BytesIO(client.post(f"{BASE}/moyens/generer?format=xlsx").content))
    assert wb.worksheets[0]["A2"].value == "MES MOYENS 2026 · Pour la consultation"


def test_cross_org_le_classeur_de_b_ne_contient_pas_les_donnees_de_a(client, deux_entreprises):
    a = load_workbook(io.BytesIO(client.post(f"{BASE}/certifications/generer?format=xlsx").content))
    texte_a = " ".join(str(c.value) for ws in a.worksheets for l in ws.iter_rows() for c in l)
    assert "Groupe scolaire Jean Moulin" in texte_a and "Chantier confidentiel de B" not in texte_a
    from tests.test_fiches_entreprise import _comme_b
    _comme_b()
    b = load_workbook(io.BytesIO(client.post(f"{BASE}/certifications/generer?format=xlsx").content))
    texte_b = " ".join(str(c.value) for ws in b.worksheets for l in ws.iter_rows() for c in l)
    assert "Chantier confidentiel de B" in texte_b
    assert "Groupe scolaire Jean Moulin" not in texte_b and "Lambert" not in texte_b


def test_route_format_inconnu_refuse(client, deux_entreprises):
    assert client.post(f"{BASE}/moyens/generer?format=xls").status_code == 422
