"""Le mémoire remis à l'acheteur ne nomme jamais l'outil qui l'a préparé (recette du 2/11, mémoire réel).

Sur le mémoire frais du lot 05, le modèle a recopié la consigne du prompt : « Le visuel de localisation … sera
dessiné par Synorix à partir des adresses renseignées. » et « L'organigramme graphique est dessiné par Synorix à
partir des données de l'entreprise. » (alors qu'aucun organigramme n'était dessiné : pas de données d'équipe).
L'export (Word, donc PDF) retire toute phrase qui nomme l'outil ; le reste du paragraphe reste intact.
Contenu inventé."""
import io

from docx import Document

from services.docx_exporter import build_memoire_docx_ex
from services.mentions_outil import retirer_mentions_outil

CONTENU = {
    "preambule": "Engagement fictif de l'entreprise.",
    "partie_a": {
        "implantation": (
            "Siège fictif à Exemple-sur-Mer. Le visuel de localisation sera dessiné par Synorix à partir des "
            "adresses renseignées. Une seconde phrase fictive sur la réactivité."
        ),
        "organigramme": (
            "L'équipe fictive compte quatre compagnons. L'organigramme graphique est dessiné par SYNORIX à partir "
            "des données de l'entreprise ; nous en décrivons ci-dessous la structure.\n"
            "- Chef de chantier fictif : pilotage quotidien."
        ),
    },
    "partie_b": {},
    "partie_c": {},
}


def _texte(octets: bytes) -> str:
    doc = Document(io.BytesIO(octets))
    morceaux = [p.text for p in doc.paragraphs]
    for t in doc.tables:
        for ligne in t.rows:
            morceaux.extend(c.text for c in ligne.cells)
    return "\n".join(morceaux)


def test_le_word_ne_nomme_jamais_l_outil():
    texte = _texte(build_memoire_docx_ex(CONTENU, "AO fictif", "Entreprise fictive").octets)
    assert "synorix" not in texte.lower()
    assert "Siège fictif à Exemple-sur-Mer." in texte
    assert "Une seconde phrase fictive sur la réactivité." in texte
    assert "L'équipe fictive compte quatre compagnons." in texte
    assert "Chef de chantier fictif : pilotage quotidien." in texte


def test_phrase_retiree_sans_toucher_au_reste():
    assert retirer_mentions_outil("A fictif. B dessiné par Synorix. C fictif.") == "A fictif. C fictif."
    assert retirer_mentions_outil("Rien à retirer ici.") == "Rien à retirer ici."
    # une ligne qui n'était que cela disparaît ; les autres lignes et la mise en forme restent
    assert retirer_mentions_outil("- point fictif\nLe visuel est dessiné par Synorix.\n**Titre fictif**") == (
        "- point fictif\n**Titre fictif**"
    )
    # une cellule de tableau Markdown garde ses barres
    assert retirer_mentions_outil("| a | Carte dessinée par Synorix. |") == "| a |  |"


def test_le_prompt_ne_nomme_plus_l_outil_pour_les_visuels():
    from services.ai import prompts
    textes = [v for v in vars(prompts).values() if isinstance(v, str)]
    assert not any("DESSINÉS par Synorix" in t for t in textes)
