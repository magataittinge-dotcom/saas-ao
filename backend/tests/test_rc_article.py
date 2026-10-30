"""Article du RC qui porte un passage (bloc 9, tranche 4) — RC inventés, jamais de texte réel."""
from services.rc_article import article_avant

RC = """RÈGLEMENT DE LA CONSULTATION
Commune de Valdoie-sur-Mer

ARTICLE 4 – Contenu du dossier
Le dossier comprend les pièces suivantes.

Article 5.2 : Présentation des candidatures
Les candidats remettent les formulaires DC1 et DC2.
Les formulaires doivent être signés par une personne habilitée à engager l'entreprise.
1. Un extrait Kbis de moins de trois mois
2. Une attestation d'assurance

6.1 Jugement des offres
Les offres sont jugées selon les critères pondérés ci-dessous.
"""


def test_cite_l_article_qui_precede_le_passage():
    assert article_avant(RC, "Les formulaires doivent être signés par une personne habilitée") \
        == "Article 5.2 — Présentation des candidatures"


def test_numero_a_points_sans_mot_article():
    assert article_avant(RC, "Les offres sont jugées selon les critères pondérés") \
        == "Article 6.1 — Jugement des offres"


def test_un_element_de_liste_n_est_pas_un_article():
    assert article_avant(RC, "Une attestation d'assurance") == "Article 5.2 — Présentation des candidatures"


def test_premier_article_et_accents_ou_casse_indifferents():
    assert article_avant(RC, "LE DOSSIER COMPREND LES PIECES SUIVANTES") == "Article 4 — Contenu du dossier"


def test_aucun_intitule_avant_le_passage_ou_extrait_introuvable():
    assert article_avant(RC, "Commune de Valdoie-sur-Mer, maître de l'ouvrage") is None
    assert article_avant(RC, "Un passage qui n'existe pas du tout dans ce texte") is None
    assert article_avant(None, "x" * 30) is None and article_avant(RC, None) is None
    assert article_avant(RC, "trop court") is None
