"""Bloc 2, tranche 3 — les « aimants » ne servent plus de source.

Sur Gueux, 133 extraits sur 410 reposaient sur un aimant (G2) : en-tête ou
pied de page répété, ligne de sommaire, tableau des lots du RC. Dans
l'échantillon jugé à la main, 10 des 12 sources fausses étaient des aimants.

Désormais :
- un passage fait surtout de lignes d'en-tête ou de pied de page (lignes au
  bord d'au moins la moitié des pages) ou de lignes de sommaire n'est jamais
  une source ;
- un passage pris dans le tableau des lots non plus, sauf pour une exigence
  qui porte sur l'allotissement ;
- un texte retrouvé tel quel, mais seulement dans des aimants : pas de source.
Chaînes inventées.
"""
from services.ai.excerpt_anchor import anchor_excerpt, anchor_requirements

ENTETE = "Lot 05 – Façades / École des Tilleuls / DCE"
PIED = "Cabinet Exemple – 1 rue Imaginaire – 00000 Ville"
CORPS = [
    "ARTICLE 1 – ÉCHAFAUDAGES\nLes échafaudages de pied seront conformes à la norme NF EN 12811.",
    "ARTICLE 2 – ISOLATION\nL'isolant en laine de roche sera fixé par chevilles à rosace.",
    "ARTICLE 3 – ENDUIT\nL'enduit de finition sera appliqué en deux passes croisées.",
    "ARTICLE 4 – NETTOYAGE\nLe nettoyage des façades est dû en fin de chantier.",
]
# Pages comme à l'extraction : chaque page finit par « \n », jointes par « \n\n ».
CCTP = "\n\n".join(f"{ENTETE}\n{c}\n{PIED}\nPage {n} / 4\n" for n, c in enumerate(CORPS, 1))
SOMMAIRE = ("SOMMAIRE\nARTICLE 1 – ÉCHAFAUDAGES .................... 2\n"
            "ARTICLE 3 – ENDUIT .................... 4\n\n\n") + CCTP

RC = ("RÈGLEMENT DE LA CONSULTATION\n"
      "Le marché est décomposé en 4 lots.\n"
      "NUMÉRO DU LOT\nDÉSIGNATION\n"
      "01\nGros œuvre – Maçonnerie\n"
      "02\nCharpente – Couverture\n"
      "03\nRevêtement de façade – Isolation par l'extérieur\n"
      "04\nPeinture – Revêtements de sols\n"
      "ARTICLE 2 – CONDITIONS\nLes variantes ne sont pas autorisées.\n")


def _req(exigence, extrait, piece="RC"):
    return {"exigence": exigence, "source_document": piece, "source_page": None, "source_excerpt": extrait}


def test_en_tete_de_page_jamais_source():
    assert anchor_excerpt(ENTETE, CCTP) is None


def test_pied_de_page_jamais_source():
    """Une paraphrase du pied de page ne s'y ancre plus par termes."""
    assert anchor_excerpt("Cabinet Exemple, 1 rue Imaginaire, Ville", CCTP) is None


def test_ligne_de_sommaire_jamais_source():
    assert anchor_excerpt("ARTICLE 3 – ENDUIT .................... 4", SOMMAIRE) is None


def test_un_titre_du_sommaire_est_pris_dans_le_corps():
    """Le même titre existe au sommaire et dans le corps : le corps gagne."""
    out = anchor_excerpt("ARTICLE 3 – ENDUIT", SOMMAIRE)
    assert out == "ARTICLE 3 – ENDUIT"
    reqs = [_req("Enduit", "ARTICLE 3 – ENDUIT", piece="CCTP")]
    anchor_requirements(reqs, {"CCTP lot 05.pdf": SOMMAIRE})
    assert reqs[0]["source_excerpt"] == "ARTICLE 3 – ENDUIT"


def test_le_contenu_d_une_page_reste_source():
    phrase = "L'isolant en laine de roche sera fixé par chevilles à rosace."
    assert anchor_excerpt(phrase, CCTP) == phrase


def test_tableau_des_lots_jamais_source_d_une_exigence_technique():
    reqs = [_req("Réaliser l'isolation par l'extérieur de la façade",
                 "Revêtement de façade – Isolation par l'extérieur")]
    anchor_requirements(reqs, {"RC.pdf": RC})
    assert reqs[0]["source_excerpt"] is None


def test_le_meme_texte_hors_du_tableau_des_lots_est_pris():
    pieces = {"RC.pdf": RC,
              "CCTP lot 02.pdf": "ARTICLE 1\nCharpente – Couverture : la charpente sera en sapin traité classe 2.\n"}
    reqs = [_req("Charpente et couverture du préau", "Charpente – Couverture")]
    anchor_requirements(reqs, pieces)
    assert reqs[0]["source_document"] == "CCTP lot 02.pdf"


def test_tableau_des_lots_source_d_une_exigence_sur_les_lots():
    reqs = [_req("Remettre une offre pour un ou plusieurs lots parmi les 4 lots",
                 "01\nGros œuvre – Maçonnerie\n02\nCharpente – Couverture")]
    anchor_requirements(reqs, {"RC.pdf": RC})
    assert reqs[0]["source_excerpt"] == "01\nGros œuvre – Maçonnerie\n02\nCharpente – Couverture"


# Plan ou carnet : des étiquettes sans ponctuation, une par ligne.
PLAN = "\n".join(["NGF 95,60", "EU", "ÉCOLE", "ONDULEUR", "ISOLATION", "MUR", "FAÇADE",
                  "ARBRE À PLANTER", "EXISTANT", "COMPLEXE",
                  "COMPLEXE ITE SUR MUR ANCIEN - ISOLANT 14 CM +", "PLAQUETTE BRIQUE"])


def test_un_paquet_d_etiquettes_n_est_pas_une_source():
    """Les termes épars d'un plan ne se réunissent plus en une fausse « phrase »."""
    exc = "Mettre en œuvre le complexe d'isolation sur le mur existant de la façade de l'école"
    assert anchor_excerpt(exc, PLAN.replace("COMPLEXE ITE SUR MUR ANCIEN - ISOLANT 14 CM +\n", "")) is None


def test_une_etiquette_precise_reste_trouvee():
    out = anchor_excerpt("Complexe ITE sur mur existant, isolation de 18 cm", PLAN)
    assert out is not None and "COMPLEXE ITE SUR MUR ANCIEN" in out


def test_un_titre_de_lot_numerote_n_est_pas_un_tableau_des_lots():
    """« LOT N° 7 : … » est le titre d'un seul lot, pas l'en-tête du tableau des lots."""
    cctp = ("LOT N° 7 : PLOMBERIE – PRESCRIPTIONS TECHNIQUES\n1 fabricant : au choix de l'entreprise\n"
            "2 modèle : robinet thermostatique\n3 finition : à soumettre au maître d'œuvre\n")
    reqs = [_req("Robinet thermostatique", "2 modèle : robinet thermostatique", piece="CCTP")]
    anchor_requirements(reqs, {"CCTP lot 07.pdf": cctp})
    assert reqs[0]["source_excerpt"] == "2 modèle : robinet thermostatique"
