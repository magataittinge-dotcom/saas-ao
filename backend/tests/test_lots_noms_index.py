"""T4 (plan H §2.7) — noms des lots sans la colonne d'index de révision du CCAP.

Lu rangée par rangée sur une seule ligne (pdfium), le tableau des lots du CCAP
accole son index de révision à l'intitulé : « 02 - Etanchéité - Couverture
BT 49 », « 08 - Peinture – Sol souple 50% BT 46 + 50% BT10 ». Ce libellé, plus
long que celui du RC, gagnait la fusion (_best_label garde le plus long) et
s'affichait partout, jusqu'à la page de garde du mémoire.

Chaînes inventées, de même forme que le CCAP de Gueux.
"""
import re
from types import SimpleNamespace

import services.lot_detector as ld

# Tableau du CCAP tel que pdfium le rend : une rangée par ligne, index au bout.
CCAP_TABLEAU = """CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES
ARTICLE 4 – VARIATION DANS LES PRIX
Les prix sont révisables par application des index suivants :
N° lot Désignation des lots Index
01 - Terrassement – Gros œuvre – Charpente métallique 70% BT01 + 30% BT16b
02 - Etanchéité - Couverture BT 49
03 - Menuiseries extérieures alu – Serrurerie – Garde-corps BT 43
04 - Peinture – Sols souples 50% BT 46 + 50% BT10
05 - Voirie – Réseaux divers TP 02
06 - Plomberie – Sanitaires (BT 38)
ARTICLE 5 – AVANCE
"""

# Liste du RC, tableau aplati verticalement (format du RC de Gueux) : sans index.
RC_LISTE = """RÈGLEMENT DE LA CONSULTATION
MARCHE PASSE PAR LOTS SEPARES
LOT
INTITULE
01
Terrassement – Gros œuvre – Charpente métallique
02
Etanchéité - Couverture
03
Menuiseries extérieures alu – Serrurerie – Garde-corps
04
Peinture – Sols souples
05
Voirie – Réseaux divers
06
Plomberie – Sanitaires
1.2 DÉCOMPOSITION EN TRANCHES
"""

ATTENDUS = {
    "lot1": "Lot 01 — Terrassement – Gros œuvre – Charpente métallique",
    "lot2": "Lot 02 — Etanchéité - Couverture",
    "lot3": "Lot 03 — Menuiseries extérieures alu – Serrurerie – Garde-corps",
    "lot4": "Lot 04 — Peinture – Sols souples",
    "lot5": "Lot 05 — Voirie – Réseaux divers",
    "lot6": "Lot 06 — Plomberie – Sanitaires",
}
_INDEX = re.compile(r"\b(?:BT|TP)\s*\d|%")


def test_colonne_index_retiree_du_libelle():
    assert ld._sans_colonne_index("Etanchéité - Couverture BT 49") == "Etanchéité - Couverture"
    assert ld._sans_colonne_index("Peinture – Sol souple 50% BT 46 + 50% BT10") == "Peinture – Sol souple"
    assert ld._sans_colonne_index("Charpente bois 70% BT01 + 30% BT16b") == "Charpente bois"
    assert ld._sans_colonne_index("Voirie – Réseaux divers TP 02") == "Voirie – Réseaux divers"
    assert ld._sans_colonne_index("Espaces verts TP10a") == "Espaces verts"
    assert ld._sans_colonne_index("Plomberie (BT 38)") == "Plomberie"
    assert ld._sans_colonne_index("Couverture – index BT 49") == "Couverture"


def test_libelles_sans_index_inchanges():
    for libelle in ("Électricité courants forts – Réseau HTA/BT",
                    "Éclairage public BT",
                    "Bâtiment B – niveau 2",
                    "Logements T2 et T3",
                    "Démolition – GO – Charpente bois - Ossature bois"):
        assert ld._sans_colonne_index(libelle) == libelle


def test_lot_02_etancheite_couverture_bt_49():
    """§4.4 n° 7 : « Lot 02 — Etanchéité - Couverture BT 49 » donne « Etanchéité - Couverture »."""
    lots = {d.id: d.nom for d in ld._detect_lots_from_rc_text(CCAP_TABLEAU, "ccap")}
    assert lots["lot2"] == "Lot 02 — Etanchéité - Couverture"


def test_tableau_du_ccap_sur_une_ligne_noms_sans_index():
    """Index retiré AVANT la coupe à 60 caractères : sinon le lot 03 garderait « … BT »."""
    lots = {d.id: d.nom for d in ld._detect_lots_from_rc_text(CCAP_TABLEAU, "ccap")}
    assert lots == ATTENDUS


def test_mention_en_ligne_sans_index():
    texte = "CCTP\nLot 07 Chape – Carrelage – Faïence BT 09\nLes travaux comprennent la chape.\n"
    lots = {d.id: d.nom for d in ld._detect_lots_from_rc_text(texte, "autre")}
    assert lots["lot7"] == "Lot 07 — Chape – Carrelage – Faïence"


def test_rc_et_ccap_noms_affiches_sans_index():
    """Détection complète, RC puis CCAP : les noms sont ceux du RC, sans index."""
    docs = [SimpleNamespace(file_name="RC.pdf", type="rc", file_url=None, extracted_text=RC_LISTE),
            SimpleNamespace(file_name="CCAP.pdf", type="ccap", file_url=None, extracted_text=CCAP_TABLEAU)]
    lots = {l["id"]: l["nom"] for l in ld.detect_all_lots(docs, uploads_root=None)}
    assert lots == ATTENDUS
    assert not any(_INDEX.search(nom) for nom in lots.values())
