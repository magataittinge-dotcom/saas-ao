"""Bloc 2, tranche 1 — garde-fous du niveau « récupéré par termes » de l'ancrage.

Mesuré sur Gueux (40 exigences jugées à la main, G2) : 12 sources fausses sur 40.
Une des causes : la récupération par termes comptait les mots vides (« dans »,
« pour », « toutes »…), acceptait un terme contenu dans un mot (« pose » dans
« proposé ») et se contentait de 2 termes en commun sur 3.

Désormais : mots entiers (pluriel en -s/-x ramené au singulier), mots vides
exclus, au moins 3 termes significatifs en commun. Chaînes inventées.
"""
from services.ai.excerpt_anchor import anchor_excerpt

DOC = (
    "ARTICLE 3 – ORGANISATION\n"
    "Les travaux devront être réalisés dans les règles de l'art pour toutes les zones, "
    "et le titulaire devra s'y conformer.\n"
    "Il est proposé de déposer les panneaux ; les isolants supportent mal l'humidité.\n"
    "Le rapport annuel de l'essai de traction est tenu à disposition.\n"
    "L'entreprise aura à sa charge les échafaudages nécessaires à l'ensemble des façades du présent lot.\n"
)


def test_mots_vides_ne_suffisent_plus():
    """Ancien code : « dans », « pour », « toutes », « devra », « titulaire » suffisaient (5 sur 9)."""
    exc = "Le titulaire devra fournir dans les délais toutes les pièces pour la réception"
    assert anchor_excerpt(exc, DOC) is None


def test_mots_entiers_et_non_contenus():
    """Ancien code : « pose » trouvé dans « proposé », « supports » dans « supportent »."""
    exc = "Pose des panneaux isolants sur les supports"
    assert anchor_excerpt(exc, DOC) is None


def test_au_moins_trois_termes_en_commun():
    """Ancien code : 2 termes sur 3 (« rapport », « annuel ») suffisaient."""
    exc = "Rapport annuel acoustique"
    assert anchor_excerpt(exc, DOC) is None


def test_paraphrase_legitime_toujours_retrouvee():
    """Garde-fous sans perte : la phrase réelle est toujours rendue, en entier."""
    exc = "Les échafaudages sont à la charge du présent lot pour la totalité des façades"
    out = anchor_excerpt(exc, DOC)
    assert out is not None and out in DOC
    assert "échafaudages nécessaires à l'ensemble des façades" in out
