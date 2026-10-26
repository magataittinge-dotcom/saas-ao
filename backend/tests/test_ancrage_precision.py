"""Bloc 2, tranche 5 — précision de l'ancrage sur un petit DCE figé (CI).

Un DCE inventé reprend les pièges mesurés sur Gueux (G2 : 12 sources fausses
sur 40) : aimants (en-têtes, sommaire, tableau des lots), CCTP d'un autre lot
que l'IA n'a pas reçu, mots vides, paquet d'étiquettes de plan. L'extrait de
l'IA est copié, retouché, condensé, paraphrasé ou recollé, comme en réalité.

Juste : la source rendue contient la clé attendue dans la bonne pièce ;
attendu None : aucune source n'est juste (le texte n'est que dans un aimant,
ou dans une pièce que l'IA n'a pas reçue). Chaînes inventées.
"""
from services.ai.excerpt_anchor import anchor_requirements


def _pages(entete, pied, pages):
    """Pièce sur plusieurs pages, jointes comme à l'extraction (« \\n\\n »)."""
    return "\n\n".join(f"{entete}\n{p}\n{pied} – page {n}\n" for n, p in enumerate(pages, 1))


RC = _pages("RC – École des Tilleuls – Restructuration", "Commune d'Exempleville", [
    "ARTICLE 1 – OBJET\nLa consultation porte sur la restructuration de l'école des Tilleuls.\n"
    "Le marché est décomposé en 4 lots.\nNUMÉRO DU LOT\nDÉSIGNATION\n01\nGros œuvre – Maçonnerie\n"
    "02\nÉtanchéité – Couverture\n03\nMenuiseries extérieures\n05\nFaçades – Isolation par l'extérieur",
    "ARTICLE 2 – CANDIDATURE\nLe candidat produit une lettre de candidature DC1 et une déclaration DC2.\n"
    "Il joint les attestations d'assurance de responsabilité civile et décennale en cours de validité.",
    "ARTICLE 3 – REMISE DES OFFRES\nLes offres sont remises sur la plateforme de dématérialisation avant la date limite.\n"
    "Une copie de sauvegarde peut être envoyée sur clé USB sous pli cacheté.",
])
CCAP = _pages("CCAP – École des Tilleuls", "Commune d'Exempleville", [
    "ARTICLE 4 – PÉNALITÉS\nEn cas de retard dans l'exécution, le titulaire subit une pénalité de 300 € par jour calendaire.\n"
    "Le retard dans le nettoyage du chantier entraîne une pénalité de 150 € par constat.",
    "ARTICLE 5 – RETENUE DE GARANTIE\nUne retenue de garantie de 5 % est appliquée sur chaque acompte.\n"
    "Elle peut être remplacée par une garantie à première demande.",
    "ARTICLE 6 – ASSURANCES\nLe titulaire justifie d'une assurance de responsabilité décennale par une attestation de son assureur.",
])
CCTP_05 = _pages("Lot 05 – Façades / École des Tilleuls / DCE", "Cabinet Exemple – 1 rue Imaginaire", [
    "SOMMAIRE\nARTICLE 1 – PRÉPARATION DES SUPPORTS .................... 2\n"
    "ARTICLE 2 – ISOLATION .................... 3\nARTICLE 3 – ENDUIT .................... 4",
    "ARTICLE 1 – PRÉPARATION DES SUPPORTS\nLes supports seront propres, secs et dépoussiérés avant la pose de l'isolant.\n"
    "Les fissures de plus de 2 mm seront ouvertes, nettoyées et rebouchées au mortier.",
    "ARTICLE 2 – ISOLATION\nL'isolant en laine de roche de 180 mm sera fixé par chevilles à rosace.\n"
    "Les panneaux seront posés à joints décalés, sans pont thermique.",
    "ARTICLE 3 – ENDUIT\nL'enduit de finition sera appliqué en deux passes croisées.\n"
    "La teinte sera choisie par l'architecte sur échantillon.",
])
CCTP_02 = ("ARTICLE 1 – SUPPORTS\nLes supports d'étanchéité seront propres et secs avant la pose de l'isolant.\n"
           "L'isolant en laine de roche sera fixé mécaniquement sur le bac acier.\n"
           "Le relevé d'étanchéité aura une hauteur de 15 cm au-dessus de la protection.\n")
CARNET = "\n".join(["DÉTAIL 1", "ISOLATION 180 MM", "LAINE DE ROCHE", "ENDUIT", "CHEVILLE À ROSACE",
                    "MUR EXISTANT", "NIVEAU FINI", "ARBRE EXISTANT", "ACCÈS CHANTIER"]) + "\n"

# Ce que l'IA a reçu : passe 1 (RC, CCAP) pour le tronc commun ; CCTP du lot 05 et
# carnet commun pour le lot 05. Le CCTP du lot 02 n'est jamais une source pour eux.
PORTEES = {
    "commun": ({"RC.pdf": RC, "CCAP.pdf": CCAP}, {"RC.pdf": 1, "CCAP.pdf": 1}),
    "lot5": ({"CCTP lot 05.pdf": CCTP_05, "Carnet de détails.pdf": CARNET},
             {"CCTP lot 05.pdf": 0, "Carnet de détails.pdf": 1}),
}

# (portée, exigence, extrait de l'IA, pièce désignée, sources justes [(pièce, clé)] ; [] = aucune)
CAS = [
    ("lot5", "Supports propres et secs", "Les supports seront propres, secs et dépoussiérés avant la pose de l'isolant.",
     "CCTP", [("CCTP lot 05.pdf", "propres, secs et dépoussiérés")]),
    ("lot5", "Isolant laine de roche", "L’isolant en laine de roche de 180 mm sera fixé par chevilles à rosace",
     "CCTP", [("CCTP lot 05.pdf", "fixé par chevilles à rosace")]),
    ("lot5", "Fissures rebouchées", "Les fissures de plus de 2 mm … rebouchées au mortier.",
     "CCTP", [("CCTP lot 05.pdf", "rebouchées au mortier")]),
    ("lot5", "Joints décalés", "Poser les panneaux à joints décalés sans pont thermique",
     "CCTP", [("CCTP lot 05.pdf", "joints décalés")]),
    ("lot5", "Enduit deux passes", "L'enduit de finition est appliqué en deux passes croisées",
     "CCTP", [("CCTP lot 05.pdf", "deux passes croisées")]),
    ("lot5", "Fixation des panneaux", "Fixation de l'isolant par cheville à rosace",
     "Carnet", [("CCTP lot 05.pdf", "chevilles à rosace"), ("Carnet de détails.pdf", "CHEVILLE À ROSACE")]),
    ("lot5", "Teinte", "La teinte sera choisie par l'architecte sur échantillon.",
     "CCTP lot 05", [("CCTP lot 05.pdf", "choisie par l'architecte")]),
    # autre lot : le texte n'existe que dans le CCTP du lot 02, que l'IA n'a pas reçu
    ("lot5", "Relevé d'étanchéité", "Le relevé d'étanchéité aura une hauteur de 15 cm au-dessus de la protection.",
     "CCTP", []),
    ("lot5", "Fixation sur bac acier", "Isolant fixé mécaniquement sur le bac acier", "CCTP", []),
    # mots vides
    ("lot5", "Pièces à fournir", "Le titulaire devra fournir dans les délais toutes les pièces pour la réception",
     "CCTP", []),
    # aimants : en-tête, ligne de sommaire, paquet d'étiquettes de plan
    ("lot5", "En-tête", "Lot 05 – Façades / École des Tilleuls / DCE", "CCTP", []),
    ("lot5", "Sommaire", "ARTICLE 2 – ISOLATION .................... 3", "CCTP", []),
    ("lot5", "Accès", "Accès chantier par l'arbre existant au niveau fini du mur", "Carnet", []),
    # tronc commun
    ("commun", "DC1 et DC2", "Le candidat produit une lettre de candidature DC1 et une déclaration DC2.",
     "RC", [("RC.pdf", "lettre de candidature DC1")]),
    ("commun", "Attestations d'assurance",
     "Fournir les attestations d'assurance de responsabilité civile et décennale en cours de validité",
     "RC", [("RC.pdf", "responsabilité civile et décennale"), ("CCAP.pdf", "attestation de son assureur")]),
    ("commun", "Pénalité de retard", "Pénalité de 300 € par jour calendaire de retard dans l'exécution",
     "CCAP", [("CCAP.pdf", "300 € par jour calendaire")]),
    ("commun", "Retenue de garantie", "Retenue de garantie de 5 % appliquée sur chaque acompte",
     "CCAP", [("CCAP.pdf", "retenue de garantie de 5 %")]),
    ("commun", "Remise et copie", "Les offres sont remises sur la plateforme de dématérialisation avant la date limite. "
     "Une copie de sauvegarde est possible sur clé USB.", "RC", [("RC.pdf", "plateforme de dématérialisation")]),
    ("commun", "Allotissement", "Le marché est décomposé en 4 lots.", "RC", [("RC.pdf", "décomposé en 4 lots")]),
    ("commun", "Remettre une offre pour un ou plusieurs lots", "01\nGros œuvre – Maçonnerie\n02\nÉtanchéité – Couverture",
     "RC", [("RC.pdf", "Gros œuvre – Maçonnerie")]),
    # aimants du tronc commun : tableau des lots pour une exigence technique, en-tête
    ("commun", "Réaliser l'isolation par l'extérieur des façades", "Façades – Isolation par l'extérieur", "RC", []),
    ("commun", "En-tête du RC", "RC – École des Tilleuls – Restructuration", "RC", []),
    # pièce non reçue par la passe 1
    ("commun", "Enduit", "L'enduit de finition sera appliqué en deux passes croisées.", "CCTP", []),
]


def _evaluer():
    verdicts = []
    for portee, exigence, extrait, piece, justes in CAS:
        textes, rangs = PORTEES[portee]
        req = {"exigence": exigence, "source_document": piece, "source_page": None, "source_excerpt": extrait}
        anchor_requirements([req], textes, rangs)
        source = req["source_excerpt"]
        if source is None:
            verdicts.append("aucun" if justes else "abstention juste")
        elif any(req["source_document"] == p and cle in source for p, cle in justes):
            verdicts.append("juste")
        else:
            verdicts.append(f"faux : {req['source_document']} « {source[:60]} »")
    return verdicts


def test_precision_et_rappel_sur_le_dce_fige():
    verdicts = _evaluer()
    justes = verdicts.count("juste")
    faux = [(c[1], v) for c, v in zip(CAS, verdicts) if v.startswith("faux")]
    avec_source = sum(1 for c in CAS if c[4])
    precision = justes / max(justes + len(faux), 1)
    rappel = justes / avec_source
    assert precision >= 0.95 and rappel >= 0.9, (precision, rappel, faux,
                                                 [(c[1], v) for c, v in zip(CAS, verdicts) if v == "aucun"])


def test_aucun_piege_ne_donne_de_source():
    verdicts = _evaluer()
    pieges = [(c[1], v) for c, v in zip(CAS, verdicts) if not c[4] and v != "abstention juste"]
    assert pieges == []
