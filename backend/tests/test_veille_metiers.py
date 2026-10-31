"""A3 — correspondance CPV / descripteurs BOAMP / objet → métiers de la veille."""
import pytest

from services.veille.metiers import LIBELLES, deduire_metiers, normaliser


@pytest.mark.parametrize("cpv, attendu", [
    ("45261210", "couverture"),          # travaux de couverture
    ("45261420", "etancheite"),          # travaux d'étanchéification (cas le plus fréquent du corpus)
    ("45223220", "gros_oeuvre"),         # gros œuvre
    ("45262522", "gros_oeuvre"),         # maçonnerie
    ("45310000", "electricite"),
    ("45311200", "electricite"),         # appareillage électrique
    ("45316110", "electricite"),         # éclairage routier
    ("45314000", "cfo_cfa"),             # réseaux de télécommunication
    ("45313100", "ascenseurs"),
    ("45330000", "plomberie"),
    ("45332200", "plomberie"),
    ("45331000", "cvc"),
    ("45331210", "cvc"),                 # ventilation
    ("45421000", "menuiseries"),
    ("45421131", "menuiseries"),         # pose de portes
    ("45421141", "platrerie"),           # cloisons
    ("45421146", "platrerie"),           # faux plafonds
    ("45410000", "platrerie"),
    ("45431000", "carrelage"),
    ("45432111", "carrelage"),           # revêtements de sol souples
    ("45442100", "peinture"),
    ("45443000", "facade_ite"),
    ("45262650", "facade_ite"),          # bardage
    ("45262660", "demolition"),          # désamiantage
    ("45111100", "demolition"),
    ("45233141", "vrd"),                 # entretien de routes
    ("45232410", "vrd"),                 # canalisation d'égouts
    ("45112710", "espaces_verts"),
    ("45342000", "serrurerie"),          # clôtures
    ("45343000", "cfo_cfa"),             # prévention d'incendie
])
def test_cpv_division_45(cpv, attendu):
    assert deduire_metiers([cpv], [], None) == [attendu]


def test_cpv_avec_tiret_de_controle_et_en_nombre():
    assert deduire_metiers(["45261210-4"], [], None) == ["couverture"]
    assert deduire_metiers([45330000], [], None) == ["plomberie"]


def test_cpv_hors_division_45_ne_donne_rien():
    assert deduire_metiers(["30200000", "09310000", "44316500"], [], None) == ["autre"]
    assert deduire_metiers(["45"], [], None) == ["autre"]


def test_cpv_generique_ne_designe_aucun_metier():
    assert deduire_metiers(["45000000", "45200000", "45100000"], [], None) == ["autre"]


@pytest.mark.parametrize("descripteur, attendu", [
    ("105", "electricite"), ("222", "menuiseries"), ("264", "peinture"), ("144", "gros_oeuvre"),
    ("270", "plomberie"), ("366", "vrd"), ("61", "cvc"), ("116", "espaces_verts"), ("74", "couverture"),
    ("87", "demolition"), ("117", "etancheite"), ("63", "platrerie"), ("53", "carrelage"),
    ("321", "serrurerie"), ("17", "ascenseurs"), ("30", "facade_ite"), ("415", "cfo_cfa"),
])
def test_descripteur_par_code(descripteur, attendu):
    assert deduire_metiers([], [descripteur], None) == [attendu]


def test_descripteur_par_libelle_ou_dictionnaire():
    assert deduire_metiers([], ["Couverture"], None) == ["couverture"]
    assert deduire_metiers([], ["Plomberie (travaux)"], None) == ["plomberie"]
    assert deduire_metiers([], [{"code": "74", "libelle": "Couverture"}], None) == ["couverture"]


def test_descripteur_inconnu_ou_hors_batiment():
    assert deduire_metiers([], ["999", "345", "33", "Tous corps d'état"], None) == ["autre"]


def test_les_indices_se_cumulent_dans_l_ordre_du_contrat():
    metiers = deduire_metiers(["45331000"], ["105", "270"], "peu importe")
    assert metiers == ["cvc", "plomberie", "electricite"]
    assert metiers == [m for m in LIBELLES if m in metiers]


def test_le_repli_objet_ne_joue_que_sans_indice():
    # CPV et descripteur désignent déjà la couverture : l'objet (« peinture ») est ignoré.
    assert deduire_metiers(["45261210"], [], "Travaux de peinture") == ["couverture"]
    assert deduire_metiers([], [], "Travaux de peinture des façades") == ["facade_ite", "peinture"]


@pytest.mark.parametrize("objet, attendu", [
    ("Remplacement de la plomberie de l'école", ["plomberie"]),
    ("Réfection de la toiture du gymnase", ["couverture"]),
    ("Mise en conformité de l'ascenseur", ["ascenseurs"]),
    ("Désamiantage et démolition d'un hangar", ["demolition"]),
    ("Lot 4 : Menuiseries extérieures", ["menuiseries"]),
    ("Remplacement de la chaudière : chauffage et ventilation", ["cvc"]),
    ("Travaux de voirie et d'assainissement", ["vrd"]),
    ("Création d'espaces verts", ["espaces_verts"]),
    ("Pose de carrelage et faïence", ["carrelage"]),
    ("Étanchéité des terrasses", ["etancheite"]),
])
def test_repli_objet_par_mots_entiers(objet, attendu):
    assert deduire_metiers([], [], objet) == attendu


def test_piege_plomb_n_attrape_pas_plomberie_et_inversement():
    assert deduire_metiers([], [], "Diagnostic plomb avant travaux") == ["autre"]
    assert deduire_metiers([], [], "Peintures au plomb : dépose") == ["peinture"]
    assert deduire_metiers([], [], "Plombier : contrat d'entretien") == ["autre"]   # « plombier » n'est pas un mot-clé
    assert deduire_metiers([], [], "Travaux de plomberie") == ["plomberie"]


def test_pieges_sous_chaines_ne_matchent_pas():
    assert deduire_metiers([], [], "Terrasses et terrassements") == ["vrd"]          # « terrasse » seul ne compte pas
    assert deduire_metiers([], [], "Cloisonnement d'un parking") == ["autre"]        # « cloison » dans « cloisonnement »
    assert deduire_metiers([], [], "Béton de décoration électroniquement") == ["gros_oeuvre"]  # « electrique » ≠ « electroniquement »
    assert deduire_metiers([], [], "Peintureries industrielles") == ["autre"]
    assert deduire_metiers([], [], "Électricité générale") == ["electricite"]


def test_accents_casse_et_apostrophes_sont_normalises():
    assert normaliser("ÉTANCHÉITÉ d'œuvre") == "etancheite d oeuvre"
    assert deduire_metiers([], [], "GROS ŒUVRE – MAÇONNERIE") == ["gros_oeuvre"]
    assert deduire_metiers([], [], "isolation thermique par l'extérieur") == ["facade_ite"]


def test_entrees_vides_donnent_autre():
    assert deduire_metiers(None, None, None) == ["autre"]
    assert deduire_metiers([], [], "") == ["autre"]
    assert deduire_metiers([None, ""], [None], "   ") == ["autre"]


def test_tous_les_metiers_du_contrat_ont_un_libelle():
    attendus = {"gros_oeuvre", "cvc", "cfo_cfa", "menuiseries", "facade_ite", "peinture", "plomberie",
                "electricite", "couverture", "vrd", "demolition", "etancheite", "carrelage", "platrerie",
                "serrurerie", "ascenseurs", "espaces_verts", "autre"}
    assert set(LIBELLES) == attendus
    assert all(isinstance(v, str) and v for v in LIBELLES.values())
