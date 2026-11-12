"""Restes de sécurité (CORRECTIFS-SECURITE § 8) — un modèle absent de la table des tarifs n'est plus compté à 0 €.

Avant : `calculer` rendait (0, 0) pour un modèle sans tarif (par exemple `MEMOIRE_MODELE` réglé sur un modèle neuf) ;
la dépense échappait au budget d'IA du jour (`services.budget_ia`, qui somme `couts_ia`). Désormais il est compté au
tarif le plus cher de la table, avec une alerte dans le journal (le nom du modèle seulement, aucune donnée client).
"""
import logging

from services import couts_ia


def _plus_cher():
    return max(couts_ia.TARIFS.values(), key=lambda t: (t[1], t[0]))


def test_modele_sans_tarif_compte_au_tarif_le_plus_cher(caplog):
    usage = {"input_tokens": 100_000, "output_tokens": 10_000}
    with caplog.at_level(logging.WARNING, logger="services.couts_ia"):
        usd, eur = couts_ia.calculer("claude-modele-neuf-9", usage)
    entree, sortie, _, _ = _plus_cher()
    attendu = round((100_000 * entree + 10_000 * sortie) / 1_000_000, 6)
    assert usd == attendu and usd > 0
    assert eur > 0
    for modele in couts_ia.TARIFS:
        assert usd >= couts_ia.calculer(modele, usage)[0]
    assert any("claude-modele-neuf-9" in r.getMessage() for r in caplog.records)


def test_modele_connu_garde_son_tarif():
    usd, _ = couts_ia.calculer(couts_ia.HAIKU_4_5, {"input_tokens": 1_000_000})
    assert usd == 1.0


def test_l_estimation_d_un_modele_sans_tarif_n_est_jamais_nulle():
    assert couts_ia.estimer("claude-modele-neuf-9", 1000, 1000)[0] > 0
    assert couts_ia.estimer_ecriture_cache("claude-modele-neuf-9", 1000, 1000)[0] > 0
