"""FIN-SRV, point 2 — les extraits du contrat montrés à Décider ne se coupent jamais dans un mot, finissent à la fin
d'une phrase ou sur « … », ne débordent pas sur le titre de l'article suivant, commencent par « … » au milieu d'une
phrase. La règle s'applique à la lecture (AO déjà analysés compris) ; l'extrait exact reste à côté.

Textes inventés, de la même forme que les deux cas du jury (tour 4 : `decider-penalites`, `decider-tresorerie-detail`)."""
import re
from types import SimpleNamespace

import pytest

from services.critical_fields import _find_in_docs, _PENALITE_CTX
from services.extrait import extrait_lisible, extraits_lisibles
from services.tresorerie import build_tresorerie

REMPLISSAGE = ("Le titulaire tient le chantier propre et signale sans délai tout désordre constaté au maître d'œuvre. "
               "Les réunions de chantier ont lieu chaque semaine en présence des entreprises convoquées. ")


def _mots(texte: str) -> set[str]:
    return set(re.findall(r"[\wÀ-ÿ'’€%]+", texte))


def _sans_mot_coupe(affiche: str, source: str) -> bool:
    """Chaque mot montré est un mot entier de la source."""
    return _mots(affiche.replace("…", " ")) <= _mots(source)


# ── La fonction ──────────────────────────────────────────────────────────────────────────────────────────────────

def test_texte_court_et_propre_inchange():
    for texte in ("Visite des lieux facultative sur rendez-vous.", "Critères", "Les plis sont remis le douze mars à midi."):
        assert extrait_lisible(texte) == texte
    assert extrait_lisible(None) is None


def test_ne_coupe_jamais_dans_un_mot_et_finit_sur_points_de_suspension():
    source = ("L'entreprise peut demander une avance plus faible que le plafond indiqué plus haut aux conditions "
              "habituelles décrites dans le présent cahier et suivant les règles rappelées dans le contrat signé")
    fenetre = source[:-3]                                    # « … le contrat si » : la fenêtre coupe un mot
    affiche = extrait_lisible(fenetre)
    assert affiche.endswith("contrat…")
    assert _sans_mot_coupe(affiche, source)


def test_ne_finit_pas_sur_un_mot_outil():
    fenetre = ("Ce taux constitue un plafond pour l'avance consentie à l'entreprise ; elle peut toutefois en demander une "
               "plus faible et l'acheteur la verse alors aux conditions de l'acompte, l'entreprise peut demander le vers")
    affiche = extrait_lisible(fenetre)
    assert affiche.endswith("peut demander…")


def test_finit_a_la_fin_de_phrase_quand_elle_tient():
    fenetre = ("L'acheteur retient une somme de 120 € HT pour chaque jour calendaire de dépassement relevé par le "
               "maître d'œuvre. Ces retenues s'ajoutent aux autres sommes prév")
    affiche = extrait_lisible(fenetre)
    assert affiche.endswith("relevé par le maître d'œuvre.")


def test_s_arrete_au_titre_de_l_article_suivant():
    fenetre = ("L'acheteur retient une somme de 120 € HT pour chaque jour de dépassement, sans courrier préalable de "
               "sa part. 8.2 NETTOYAGE DES ABORDS DU SITE Le nettoyage des terrains qui auront")
    affiche = extrait_lisible(fenetre)
    assert "NETTOYAGE" not in affiche and "8.2" not in affiche
    assert affiche.endswith("sans courrier préalable de sa part.")


def test_le_titre_de_l_article_du_fait_ne_se_soude_pas_a_sa_phrase():
    fenetre = ("aucune remise n'est accordée sur les prestations. 6 RETENUE DE GARANTIE Une part de 5 % est prélevée "
               "sur chaque acompte comme sur le solde, aux conditions prévues par les textes qui la régissent p")
    affiche = extrait_lisible(fenetre)
    assert affiche.startswith("Une part de 5 %")
    assert "RETENUE DE GARANTIE" not in affiche and affiche.endswith("…")


def test_commence_par_points_de_suspension_au_milieu_d_une_phrase():
    fenetre = ("rticle 4.1 plus bas, l'acheteur retient une somme de 120 € HT pour chaque jour de dépassement du délai "
               "inscrit à l'acte d'engagement, sans courrier préalable de sa part.")
    affiche = extrait_lisible(fenetre)
    assert affiche.startswith("… ") and not affiche.startswith("… rticle")
    assert affiche.endswith("sans courrier préalable de sa part.")


def test_les_pointilles_d_un_sommaire_tombent():
    affiche = extrait_lisible("5. CLASSEMENT DES PROPOSITIONS ET CHOIX DU TITULAIRE ..................")
    assert "...." not in affiche and affiche.startswith("5. CLASSEMENT DES PROPOSITIONS")


def test_limite_de_longueur_au_mot_entier():
    fenetre = "Le titulaire " + "fournit les plans d'exécution et les notes de calcul " * 12
    affiche = extrait_lisible(fenetre, limite=120)
    assert len(affiche) <= 120 and affiche.endswith("…")
    assert _sans_mot_coupe(affiche, fenetre)


def test_extraits_lisibles_garde_l_exact_et_ne_touche_pas_l_original():
    exact = "l'acheteur retient une somme par jour. 7.4 REPLI DES BARAQUEMENTS Les baraquements sont " * 2
    donnees = {"fields": {"penalites": {"value": {"retard": "x"}, "source": {"document": "c.pdf", "excerpt": exact}}}}
    lu = extraits_lisibles(donnees)
    src = lu["fields"]["penalites"]["source"]
    assert src["excerpt_exact"] == exact and src["excerpt"] != exact
    assert donnees["fields"]["penalites"]["source"] == {"document": "c.pdf", "excerpt": exact}   # cache intact


# ── Les deux cas du jury, texte inventé de même forme, par le service servi à Décider ────────────────────────────

CCAP_INVENTE = (
    "CCAP — Groupe scolaire des Tilleuls\n"
    + "Les eﬀets du présent article s'appliquent à toutes les oﬀres et à leurs diﬀérentes variantes… " * 30
    + REMPLISSAGE * 3
    + "5.1 AVANCE\nLe marché retient la variante B prévue par le cahier des clauses générales.\nTaux retenu pour "
      "l'avance : 12 %\nCe taux constitue un plafond ; l'entreprise peut demander une avance plus faible aux "
      "conditions habituelles décrites au présent cahier, par simple courrier adressé au service acheteur.\n"
    + REMPLISSAGE * 3
    + "7.3 PENALITES DE RETARD\nSi les travaux prennent du retard, hors report de délai accordé selon l'article 9.2 "
      "plus bas, la pénalité retenue par l'acheteur se monte à 150 € HT par jour de retard.\n7.4 REPLI DES "
      "BARAQUEMENTS ET NETTOYAGE DES TERRAINS\nL'entreprise démonte ses baraquements et nettoie les "
      "terrains utilisés avant la réception, sans supplément.\n"
    + REMPLISSAGE * 2
)


def _lignes_servies():
    doc = SimpleNamespace(type="ccap", file_name="CCAP_invente.pdf", extracted_text=CCAP_INVENTE)
    return {l["id"]: l for l in extraits_lisibles(build_tresorerie({}, [doc]))}


def test_cas_du_jury_penalites_sans_titre_voisin_et_sur_la_bonne_clause():
    src = _lignes_servies()["penalites"]["source"]
    affiche = src["excerpt"]
    assert "150 € HT par jour de retard" in affiche
    assert "REPLI" not in affiche and "7.4" not in affiche
    assert affiche.endswith("par jour de retard.")
    assert affiche[0] == "…" or affiche[0].isupper()
    assert _sans_mot_coupe(affiche, CCAP_INVENTE)
    assert " ".join(src["excerpt_exact"].split()) in " ".join(CCAP_INVENTE.split())     # l'exact reste mot pour mot


def test_cas_du_jury_tresorerie_avance_ne_finit_pas_dans_un_mot():
    affiche = _lignes_servies()["avance"]["source"]["excerpt"]
    assert "12 %" in affiche
    assert affiche.endswith(".") or affiche.endswith("…")
    assert _sans_mot_coupe(affiche, CCAP_INVENTE)


def test_la_fenetre_est_centree_sur_le_fait_malgre_les_ligatures():
    """« ﬀ » devient « ff » dans le texte normalisé : sans correspondance des positions, la fenêtre montrée tombait
    avant le fait (une ligature = un caractère de décalage ; trente lignes en décalent des dizaines)."""
    doc = SimpleNamespace(type="ccap", file_name="CCAP_invente.pdf", extracted_text=CCAP_INVENTE)
    m, source = _find_in_docs([doc], _PENALITE_CTX, ("ccap",))
    assert m is not None
    assert "150 € HT par jour" in source["excerpt"]
