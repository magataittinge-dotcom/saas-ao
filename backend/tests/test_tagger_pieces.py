"""Rattachement des pièces aux lots (services/document_tagger.py) — bloc 2.

Ce rattachement décide quelles pièces l'IA reçoit. Avant, les motifs de nom
« info » (diagnostic, plan) étaient testés AVANT le type et en sous-chaînes :
« Plomberie » contient « plomb », « Facade » est un motif de plan, « coupe-feu »
commence par « coupe »… Sur le DCE de Gueux, le CCTP et la DPGF du lot 10
(« Plomberie Sanitaires ») n'allaient jamais à l'IA.

Noms de fichiers inventés, de même forme que les vrais.
"""
import pytest

from models.project import TYPE_AE, TYPE_DPGF
from services.document_tagger import assign_document_lots


@pytest.mark.parametrize("nom,type_,attendu", [
    # Pièces techniques : le type décide, le nom ne les rend jamais « info ».
    ("EQ2501_Ecole Exemple_lot 10 Plomberie Sanitaires_DCE.pdf", "cctp", ["10"]),
    ("CCTP Lot05_Facade_ITE.pdf", "cctp", ["5"]),
    ("CCTP lot 07 Portes coupe-feu.pdf", "cctp", ["7"]),
    ("CCTP lot 06 Plafonds acoustiques.pdf", "cctp", ["6"]),
    ("CCTP Niveau 2 - lot 04.pdf", "cctp", ["4"]),
    ("DPGF_lot 10 Plomberie Sanitaires.xlsx", TYPE_DPGF, ["10"]),
    ("BPU lot 03 Façades.xlsx", "bpu_template", ["3"]),
    ("DQE lot 08 Niveau 1.xlsx", "dqe_template", ["8"]),
    ("AE lot 02.pdf", TYPE_AE, ["2"]),
    ("Cadre de réponse lot 09 acoustique.docx", "cadre_reponse", ["9"]),
    ("CCTP Plomberie.pdf", "cctp", ["all"]),
    # « ilot » / « pilote » ne sont pas un lot.
    ("CCTP ilot 2 - lot 05.pdf", "cctp", ["5"]),
])
def test_le_type_decide_pour_les_pieces_techniques(nom, type_, attendu):
    assert assign_document_lots(nom, type_) == attendu


@pytest.mark.parametrize("nom,attendu", [
    # Mots entiers : un vrai diagnostic ou un vrai plan reste « info »…
    ("Diagnostic plomb avant travaux.pdf", ["info"]),
    ("DAT amiante.pdf", ["info"]),
    ("ARCH 17 FACADES.pdf", ["info"]),
    ("Coupe AA.pdf", ["info"]),
    ("Plan niveau 1.pdf", ["info"]),
    ("Etude acoustique.pdf", ["info"]),
    ("Rapport de sol G2.pdf", ["info"]),
    # … mais un mot qui en contient un autre ne compte plus.
    ("Note Plomberie.pdf", ["all"]),
    ("Portes coupe-feu.pdf", ["all"]),
    ("Planning travaux.pdf", ["all"]),
    ("Mise_a_jour_dates.pdf", ["all"]),
])
def test_motifs_en_mots_entiers_pour_les_autres_pieces(nom, attendu):
    assert assign_document_lots(nom, "autre") == attendu


def test_un_plan_reste_info():
    assert assign_document_lots("Lot 05 - Plan de façade.pdf", "plan") == ["info"]
    assert assign_document_lots("Ensemble.dwg", "autre") == ["info"]


@pytest.mark.parametrize("nom,type_", [
    ("Notice de sécurité.pdf", "autre"),
    ("EQ2501-NOTICE SÉCURITÉ.pdf", "notice"),
    ("Notice securite incendie ERP.pdf", "notice"),
])
def test_la_notice_de_securite_reste_dans_le_contexte_du_memoire(nom, type_):
    """Décision du 26/10 : une notice de sécurité incendie sert au chapitre
    « sécurité » du mémoire ; la ranger en « info » la retirerait sans bruit."""
    assert assign_document_lots(nom, type_) == ["all"]
