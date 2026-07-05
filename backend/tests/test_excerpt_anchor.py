"""
Ancrage verbatim des excerpts (fix « sourcé, jamais halluciné »).

Mesuré sur 448 exigences réelles : 7 % verbatim exact, 20 % retrouvables
après normalisation (apostrophes ’, retours ligne intra-phrase), 73 %
introuvables (l'IA condense avec « … » et recolle des morceaux).

anchor_requirements() garantit : source_excerpt est TOUJOURS un extrait
verbatim du texte source (ré-ancré), sinon None (pas de bouton source).
"""
from services.ai.excerpt_anchor import anchor_excerpt, anchor_requirements

DOC = (
    "RDC Travaux – Ecole élémentaire de GUEUX\n"
    "Le candidat devra produire dans un dossier\n"
    "« Candidature » les pièces suivantes :\n"
    "1/ Une lettre de candidature (DC1 ou équivalent) comportant l’ensemble des indications permettant\n"
    "d’identifier le candidat ou l’ensemble des membres du groupement.\n"
    "◼ L’indication des mesures de gestion environnementale que le candidat pourra appliquer lors de\n"
    "l’exécution du marché.\n"
    "L’absence de chiffrage d’une ou plusieurs prestations supplémentaires éventuelles emportera la\n"
    "qualification d’offre irrégulière.\n"
)


def test_exact_excerpt_kept():
    exc = "Le candidat devra produire dans un dossier"
    assert anchor_excerpt(exc, DOC) == exc


def test_normalized_reanchored_to_real_text():
    """Excerpt avec apostrophe droite + espaces simples → ré-ancré sur le
    verbatim RÉEL du PDF (apostrophe ’, retour ligne intra-phrase)."""
    exc = "Une lettre de candidature (DC1 ou équivalent) comportant l'ensemble des indications permettant d'identifier le"
    out = anchor_excerpt(exc, DOC)
    assert out is not None
    assert out in DOC                       # verbatim GARANTI
    assert "l’ensemble" in out              # texte réel, pas celui de l'IA


def test_condensed_excerpt_recovered_from_key_terms():
    """« … » de condensation IA → récupération par termes clés : la phrase
    RÉELLE du document est retrouvée et retournée en entier."""
    exc = "L'indication des mesures de gestion environnementale… lors de l'exécution"
    out = anchor_excerpt(exc, DOC)
    assert out is not None
    assert out in DOC
    assert "gestion environnementale" in out
    assert len(out) >= 60                   # phrase entière, pas un fragment


def test_unanchorable_returns_none():
    assert anchor_excerpt("Texte totalement inventé par une IA rêveuse", DOC) is None
    assert anchor_excerpt("", DOC) is None
    assert anchor_excerpt("abc", "") is None


def test_resolve_pages_fixes_wrong_ia_page(tmp_path):
    """La page estimée par l'IA est fausse → resolve_pages localise la page
    réelle de l'excerpt ancré (sinon le viewer ouvre une page sans rien)."""
    import fitz
    from services.ai.excerpt_anchor import resolve_pages

    pdf = tmp_path / "rc.pdf"
    doc = fitz.open()
    doc.new_page().insert_text((72, 100), "Page une sans grand interet ici.")
    doc.new_page().insert_text((72, 100), "Le candidat fournira une attestation de vigilance URSSAF.")
    doc.save(str(pdf))
    doc.close()

    reqs = [{"source_document": "rc.pdf", "source_page": 1,
             "source_excerpt": "Le candidat fournira une attestation de vigilance URSSAF."}]
    fixed = resolve_pages(reqs, {"rc.pdf": str(pdf)})
    assert fixed == 1
    assert reqs[0]["source_page"] == 2


def test_anchor_requirements_batch(caplog):
    reqs = [
        {"exigence": "a", "source_document": "RC",
         "source_excerpt": "Le candidat devra produire dans un dossier"},
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
