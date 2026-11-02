"""R26 — l'export (Word, donc PDF) n'imprime jamais une consigne ou une note entre crochets.

Un ancien mémoire peut contenir « [Ici : … la carte est dessinée par Synorix … ] » ou « [L'organigramme
visuel n'est pas intégré … ] » : des notes de l'outil, pas du texte pour l'acheteur. Les « [À COMPLÉTER : X] »
restent des passages surlignés et comptés. Contenu inventé."""
import io

from docx import Document

from services.docx_exporter import build_memoire_docx_ex

CONTENU = {
    "preambule": "Engagement fictif.",
    "partie_a": {
        "implantation": (
            "Siège fictif à Exemple-sur-Mer, à vingt minutes du chantier.\n"
            "[Ici : localisation de l'entreprise par rapport au chantier — la carte est dessinée par Synorix à partir de l'adresse]\n"
            "Une seconde phrase fictive."
        ),
        "organigramme": "[L'organigramme visuel n'est pas intégré dans cette version du mémoire.]",
        "activites": "Gros œuvre fictif [Insérer une photo du chantier] et finitions. Voir la note [1](https://exemple.test).",
        "roles_missions": "Conducteur : [À COMPLÉTER : nom du conducteur de travaux]",
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


def test_aucune_consigne_entre_crochets_dans_le_word():
    export = build_memoire_docx_ex(CONTENU, "AO fictif", "Entreprise fictive")
    texte = _texte(export.octets)
    for interdit in ("[Ici", "[L'organigramme", "[Insérer", "Synorix à partir", "n'est pas intégré"):
        assert interdit not in texte, interdit
    assert "[" not in texte.replace("[1]", ""), texte        # le seul crochet permis : une note numérotée d'un lien
    assert "Siège fictif à Exemple-sur-Mer" in texte and "Une seconde phrase fictive." in texte
    assert "Gros œuvre fictif" in texte and "et finitions" in texte


def test_les_passages_a_completer_restent_surlignes_et_comptes():
    export = build_memoire_docx_ex(CONTENU, "AO fictif", "Entreprise fictive")
    assert [p.libelle for p in export.a_completer] == ["nom du conducteur de travaux"]
    assert "À compléter : nom du conducteur de travaux" in _texte(export.octets)
