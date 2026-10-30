"""Un titre de partie ne sort dans le Word que si la partie a du contenu.

Avant : « PARTIE B — PRÉSENTATION DE LA PRESTATION » s'imprimait seul, suivi de rien, quand la partie B
était vide (mémoire partiel, ou sections non rédigées). Contenu inventé.
"""
import io

from docx import Document

from services.docx_exporter import build_memoire_docx

TITRE_A = "PARTIE A"
TITRE_B = "PARTIE B"
TITRE_C = "PARTIE C"


def _titres(octets: bytes) -> str:
    return "\n".join(p.text for p in Document(io.BytesIO(octets)).paragraphs)


def _export(contenu: dict) -> str:
    return _titres(build_memoire_docx(contenu, "Chantier fictif", "Entreprise fictive"))


def test_partie_b_vide_n_imprime_pas_son_titre():
    texte = _export({
        "partie_a": {"historique": "Entreprise fictive fondée il y a longtemps."},
        "partie_b": {},
        "partie_c": {"delai": "Phasage fictif."},
    })
    assert TITRE_A in texte
    assert TITRE_B not in texte
    assert TITRE_C in texte


def test_partie_b_avec_contenu_imprime_son_titre():
    texte = _export({
        "partie_a": {"historique": "Entreprise fictive."},
        "partie_b": {"securite": "Mesures fictives."},
        "partie_c": {},
    })
    assert TITRE_B in texte
    assert TITRE_C not in texte


def test_sections_blanches_comptent_comme_vides():
    texte = _export({"partie_a": {"historique": "   \n  "}, "partie_b": {"securite": ""}, "partie_c": None})
    for titre in (TITRE_A, TITRE_B, TITRE_C):
        assert titre not in texte


def test_toutes_les_parties_absentes_ne_plante_pas():
    texte = _export({})
    assert "PARTIE" not in texte
