"""
Ancrage verbatim des excerpts (fix « sourcé, jamais halluciné »).

Mesuré sur 448 exigences réelles : 7 % verbatim exact, 20 % retrouvables
après normalisation (apostrophes ’, retours ligne intra-phrase), 73 %
introuvables (l'IA condense avec « … » et recolle des morceaux).

anchor_requirements() garantit : source_excerpt est TOUJOURS un extrait
verbatim du texte source (ré-ancré), sinon None (pas de bouton source).
"""
from services.ai.excerpt_anchor import anchor_excerpt, anchor_requirements

# Document INVENTÉ, de la même forme qu'un règlement de consultation : apostrophes
# typographiques, retours à la ligne au milieu des phrases, puce « ◼ ».
DOC = (
    "RC Travaux – Groupe scolaire des Tilleuls\n"
    "Le soumissionnaire remettra dans un pli\n"
    "« Offre technique » les éléments suivants :\n"
    "1/ Une note méthodologique (cadre de réponse ou équivalent) décrivant l’ensemble des dispositions permettant\n"
    "d’organiser le chantier ou l’ensemble des interventions des sous-traitants.\n"
    "◼ L’indication des dispositions de tri des déchets que le soumissionnaire mettra en œuvre pendant\n"
    "la durée du chantier.\n"
    "L’omission d’une ou plusieurs variantes obligatoires dans le cadre de décomposition entraînera le\n"
    "classement de l’offre comme irrégulière.\n"
)


def test_exact_excerpt_kept():
    exc = "Le soumissionnaire remettra dans un pli"
    assert anchor_excerpt(exc, DOC) == exc


def test_normalized_reanchored_to_real_text():
    """Excerpt avec apostrophe droite + espaces simples → ré-ancré sur le
    verbatim RÉEL du PDF (apostrophe ’, retour ligne intra-phrase)."""
    exc = "Une note méthodologique (cadre de réponse ou équivalent) décrivant l'ensemble des dispositions permettant d'organiser le"
    out = anchor_excerpt(exc, DOC)
    assert out is not None
    assert out in DOC                       # verbatim GARANTI
    assert "l’ensemble" in out              # texte réel, pas celui de l'IA


def test_condensed_excerpt_recovered_from_key_terms():
    """« … » de condensation IA → récupération par termes clés : la phrase
    RÉELLE du document est retrouvée et retournée en entier."""
    exc = "L'indication des dispositions de tri des déchets… pendant la durée du chantier"
    out = anchor_excerpt(exc, DOC)
    assert out is not None
    assert out in DOC
    assert "tri des déchets" in out
    assert len(out) >= 60                   # phrase entière, pas un fragment


def test_unanchorable_returns_none():
    assert anchor_excerpt("Texte totalement inventé par une IA rêveuse", DOC) is None
    assert anchor_excerpt("", DOC) is None
    assert anchor_excerpt("abc", "") is None


def test_resolve_pages_fixes_wrong_ia_page(tmp_path):
    """La page estimée par l'IA est fausse → resolve_pages localise la page
    réelle de l'excerpt ancré (sinon le viewer ouvre une page sans rien)."""
    from services.ai.excerpt_anchor import resolve_pages
    from tests.pdf_fabrique import ecrire_pdf

    pdf = ecrire_pdf(tmp_path / "rc.pdf", [
        "Page une sans grand interet ici.",
        "Le candidat fournira une attestation de vigilance URSSAF.",
    ])

    reqs = [{"source_document": "rc.pdf", "source_page": 1,
             "source_excerpt": "Le candidat fournira une attestation de vigilance URSSAF."}]
    fixed = resolve_pages(reqs, {"rc.pdf": str(pdf)})
    assert fixed == 1
    assert reqs[0]["source_page"] == 2


def test_anchor_requirements_batch(caplog):
    reqs = [
        {"exigence": "a", "source_document": "RC",
         "source_excerpt": "Le soumissionnaire remettra dans un pli"},
        {"exigence": "b", "source_document": "RC",
         "source_excerpt": "phrase inventée sans aucun rapport ni terme commun xyzabc"},
        {"exigence": "c", "source_document": "INCONNU",
         "source_excerpt": "peu importe"},
    ]
    with caplog.at_level("INFO"):
        out = anchor_requirements(reqs, {"RC": DOC})
    assert out[0]["source_excerpt"] in DOC
    assert out[1]["source_excerpt"] is None          # invalide → pas d'ancre
    assert out[2]["source_excerpt"] is None          # doc introuvable → pas d'ancre
    assert any("ancrage" in r.message.lower() for r in caplog.records)
