"""DEC-1 — l'annexe du lot 00 est découpée par article ; un article n'autorise ses
DTU que s'il est rattaché au lot choisi avec certitude (décision de Mohamed du
27/10). Chaînes inventées : aucun texte de DCE."""
from types import SimpleNamespace

from services.ai.dtu_autorises import (
    DtuAutorise, LotCible, decouper_articles, dtu_autorises, rattache_article,
)

LOTS = [
    {"id": "lot1", "nom": "Lot 01 — Gros œuvre"},
    {"id": "lot2", "nom": "Lot 02 — Couverture zinguerie"},
    {"id": "lot3", "nom": "Lot 03 — Menuiseries extérieures PVC"},
    {"id": "lot4", "nom": "Lot 04 — Menuiseries extérieures alu"},
    {"id": "lot5", "nom": "Lot 05 — Revêtement de façade – ITE"},
    {"id": "lot6", "nom": "Lot 06 — Peinture"},
]

ANNEXE = """SOMMAIRE
ARTICLE 1
LOT GROS ŒUVRE ................ 3
ARTICLE 2
LOT FAÇADE ................ 5
Texte d'accueil avant tout article : NF DTU 99.9.
ARTICLE 1
LOT GROS ŒUVRE
Les ouvrages respectent le NF DTU 13.1 et le DTU 21.
Page 6 / 40
ARTICLE 2
LOT FAÇADE
Le complexe d'isolation respecte le NF DTU 55.2.
POSTE 1. MURS
Voir aussi le DTU 20.1 P1-1.
ARTICLE 3
LOT COUVERTURE ZINGUERIE
Selon le NF DTU 40.41.
ARTICLE 4
LOT MENUISERIES EXTÉRIEURES
Selon le NF DTU 36.5.
ARTICLE 5
Aucun titre ici : NF DTU 31.2.
ARTICLE 6
LOT 05 – DIVERS
Selon le NF DTU 42.1.
"""


def _lot(numero="5", designation="Revêtement de façade – ITE"):
    autres = tuple((str(i), n) for i, n in [(1, "Gros œuvre"), (2, "Couverture zinguerie"),
                  (3, "Menuiseries extérieures PVC"), (4, "Menuiseries extérieures alu"),
                  (6, "Peinture")] if str(i) != numero)
    return LotCible(numero, designation, autres)


def _doc(nom, texte, type_="autre", lots=("0",)):
    return SimpleNamespace(file_name=nom, type=type_, extracted_text=texte,
                           related_lots=list(lots), is_user_completed=False)


def test_decoupe_par_article_avec_titre_a_la_ligne_suivante():
    arts = decouper_articles("ARTICLE 1\nLOT GROS ŒUVRE\ncorps\nART. 2 – FAÇADES\ncorps")
    assert [a.titre for a in arts] == ["LOT GROS ŒUVRE", "FAÇADES"]


def test_titres_de_lot_quand_il_n_y_a_pas_d_article():
    arts = decouper_articles("Intro\nLOT 05 – FAÇADES\ncorps\nLOT 06 – PEINTURE\ncorps")
    assert [a.titre for a in arts] == ["LOT 05 – FAÇADES", "LOT 06 – PEINTURE"]


def test_titres_numerotes_en_dernier_recours():
    arts = decouper_articles("Intro\n3. FAÇADES ET ITE\ncorps\n4. PEINTURE\ncorps")
    assert [a.titre for a in arts] == ["3. FAÇADES ET ITE", "4. PEINTURE"]


def test_piece_non_decoupable():
    assert decouper_articles("Un texte sans aucun titre. NF DTU 20.1 y figure.") == []


def test_rattachement_par_les_mots_de_la_designation():
    lot = _lot()
    assert rattache_article("LOT FAÇADE", lot) is True
    assert rattache_article("Lot façades", lot) is True            # pluriel, casse
    assert rattache_article("LOT GROS ŒUVRE", lot) is False
    assert rattache_article("LOT FAÇADE ET BARDAGE", lot) is False  # mot hors désignation : incertain
    assert rattache_article(None, lot) is False


def test_rattachement_par_le_numero_et_aucun_autre_lot():
    lot = _lot()
    assert rattache_article("LOT 05 – DIVERS", lot) is True
    assert rattache_article("Lot n° 5", lot) is True
    assert rattache_article("LOT 4 – FAÇADE", lot) is False        # nomme un autre lot
    assert rattache_article("LOT 5 ET 6", lot) is False            # deux lots


def test_designation_partagee_par_deux_lots_est_ambigue():
    lot3 = LotCible("3", "Menuiseries extérieures PVC",
                    (("4", "Menuiseries extérieures alu"),))
    # « menuiseries extérieures » pourrait être le lot 3 comme le lot 4
    assert rattache_article("LOT MENUISERIES EXTÉRIEURES", lot3) is False
    assert rattache_article("LOT MENUISERIES EXTÉRIEURES PVC", lot3) is True


def test_seuls_les_articles_du_lot_autorisent_leurs_dtu():
    docs = [_doc("annexe.pdf", ANNEXE)]
    res = dtu_autorises(docs, selected_lot="lot5", lot_nom="Lot 05 — Revêtement de façade – ITE",
                        lots_detectes=LOTS)
    # article 2 (façade) et article 6 (numéro du lot) ; ni gros œuvre, ni couverture,
    # ni menuiseries (ambigu), ni l'article sans titre, ni le texte avant les articles
    assert sorted(res) == ["20.1", "42.1", "55.2"]
    assert all(isinstance(v, DtuAutorise) for v in res.values())


def test_page_et_piece_gardees_pour_un_article_retenu():
    texte = "Pied / Page 1 / 3\nARTICLE 2\nLOT FAÇADE\nPied / Page 2 / 3\nSelon NF DTU 55.2."
    res = dtu_autorises([_doc("annexe.pdf", texte)], selected_lot="lot5",
                        lot_nom="Lot 05 — Revêtement de façade – ITE", lots_detectes=LOTS)
    assert res["55.2"].sources == [("annexe.pdf", 2)]


def test_piece_du_lot_00_sans_article_n_autorise_rien():
    docs = [_doc("annexe.pdf", "Texte continu : NF DTU 20.1 et DTU 41.2.")]
    assert dtu_autorises(docs, selected_lot="lot5", lot_nom="Lot 05 — Façade",
                         lots_detectes=LOTS) == {}


def test_sans_connaitre_le_lot_une_piece_du_lot_00_n_autorise_rien():
    assert dtu_autorises([_doc("annexe.pdf", ANNEXE)]) == {}


def test_le_cctp_du_lot_garde_tous_ses_dtu():
    cctp = _doc("cctp 5.pdf", "Selon NF DTU 41.2, DTU 52.2.\nARTICLE 9\nLOT PEINTURE\nDTU 59.1",
                type_="cctp", lots=("5",))
    res = dtu_autorises([cctp, _doc("annexe.pdf", ANNEXE)], selected_lot="lot5",
                        lot_nom="Lot 05 — Revêtement de façade – ITE", lots_detectes=LOTS)
    assert {"41.2", "52.2", "59.1"} <= set(res)


def test_cctp_du_lot_00_est_traite_comme_l_annexe():
    gen = _doc("generalites.pdf", "ARTICLE 1\nLOT PEINTURE\nSelon NF DTU 59.1.", type_="cctp")
    assert dtu_autorises([gen], selected_lot="lot5", lot_nom="Lot 05 — Revêtement de façade – ITE",
                         lots_detectes=LOTS) == {}


def test_deja_filtre_ne_refiltre_pas_les_pieces():
    docs = [_doc("cctp.pdf", "NF DTU 41.2", type_="cctp", lots=("5", "5a"))]
    res = dtu_autorises(docs, selected_lot="lot5", lot_nom="Lot 05 — Façade", deja_filtre=True)
    assert list(res) == ["41.2"]


# ── Sigles des lots du BTP (décision de Mohamed du 27/10, tranche 1) ────────
def _lot_n(numero, designation, *autres):
    return LotCible(numero, designation, tuple(autres))


def test_go_et_gros_oeuvre_sont_equivalents_dans_les_deux_sens():
    lot1 = _lot_n("1", "Démolition – GO – Charpente bois", ("2", "Étanchéité couverture"))
    assert rattache_article("LOT GROS ŒUVRE", lot1) is True
    lot_go = _lot_n("1", "Gros œuvre", ("2", "Étanchéité couverture"))
    assert rattache_article("LOT GO", lot_go) is True
    assert rattache_article("LOT G.O. ", lot_go) is True


def test_chaque_sigle_se_deplie_dans_les_deux_sens():
    cas = [
        ("CVC", "Chauffage – Ventilation – Climatisation"),
        ("VRD", "Voirie et réseaux divers"),
        ("CFO", "Courants forts"),
        ("CFA", "Courants faibles"),
    ]
    for sigle, long in cas:
        autres = ("9", "Peinture")
        assert rattache_article(f"LOT {long.upper()}", _lot_n("5", sigle, autres)) is True, sigle
        assert rattache_article(f"LOT {sigle}", _lot_n("5", long, autres)) is True, sigle
    assert rattache_article("LOT V.R.D.", _lot_n("5", "Voirie et réseaux divers", ("9", "Peinture"))) is True


def test_un_sigle_ne_rattache_pas_a_deux_lots():
    lot1 = _lot_n("1", "Démolition – GO", ("7", "Gros œuvre"))
    assert rattache_article("LOT GROS ŒUVRE", lot1) is False   # « go » désigne aussi le lot 7
    lot_cfo = _lot_n("9", "Électricité CFO CFA", ("10", "Courants forts"))
    assert rattache_article("LOT CFO", lot_cfo) is False
    # sans autre lot qui porte le mot, le rattachement reste possible
    assert rattache_article("LOT CFO", _lot_n("9", "Électricité CFO CFA", ("10", "Plomberie"))) is True


def test_le_depliage_exige_la_formule_entiere():
    # « chauffage ventilation » seul n'est pas « CVC » (climatisation absente) : prudence
    assert rattache_article("LOT CVC", _lot_n("11", "Chauffage – Ventilation", ("9", "Peinture"))) is False


def test_tce_seul_ne_rattache_aucun_lot_de_metier():
    autres = ("9", "Peinture")
    assert rattache_article("LOT TCE", _lot_n("5", "Revêtement de façade – TCE", autres)) is False
    assert rattache_article("LOT TOUS CORPS D'ÉTAT", _lot_n("5", "Façade ITE", autres)) is False
    assert rattache_article("TCE", _lot_n("5", "Façade", autres)) is False


def test_lot_tce_unique_couvre_tous_les_articles_titres():
    tce = _lot_n("1", "TCE – Tous corps d'état")           # aucun autre lot au projet
    assert rattache_article("LOT FAÇADE", tce) is True
    assert rattache_article("LOT TCE", tce) is True
    assert rattache_article(None, tce) is False            # article sans titre : toujours non
    # avec d'autres lots au projet, « TCE » ne prouve plus rien pour un article de métier
    avec_autres = _lot_n("1", "TCE – Tous corps d'état", ("2", "VRD"))
    assert rattache_article("LOT FAÇADE", avec_autres) is False


def test_dtu_du_lot_gros_oeuvre_lus_par_le_sigle_go():
    docs = [_doc("annexe.pdf", ANNEXE)]
    res = dtu_autorises(docs, selected_lot="lot1", lot_nom="Lot 01 — Démolition – GO – Charpente bois",
                        lots_detectes=[{"id": "lot1", "nom": "Lot 01 — Démolition – GO – Charpente bois"},
                                       {"id": "lot5", "nom": "Lot 05 — Revêtement de façade – ITE"}])
    assert {"13.1", "21"} <= set(res)
