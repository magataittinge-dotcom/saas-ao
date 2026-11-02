"""M2 (mémoire réel du 2/11) : dans un tableau, une colonne qui ne contient que « À compléter : nom » était
calculée sur « nom » seul (les balises du passage ne comptent pas le préfixe affiché) : la colonne était
écrasée et « À compléter » se coupait au milieu du mot. Contenu inventé."""
import io

from docx import Document
from docx.shared import Cm

from services.docx_exporter import build_memoire_docx_ex

LONG = "Mission fictive détaillée : pilotage, coordination, comptes rendus, réception et levée des réserves"
CONTENU = {
    "preambule": "Préambule fictif.",
    "partie_a": {
        "roles_missions": (
            "| Poste | Nom | Missions |\n|---|---|---|\n"
            f"| Directeur fictif | [À COMPLÉTER : nom] | {LONG} |\n"
            f"| Conducteur fictif | [À COMPLÉTER : nom] | {LONG} |\n"
        ),
    },
    "partie_b": {}, "partie_c": {},
}


def test_la_colonne_a_completer_garde_la_place_du_texte_affiche():
    doc = Document(io.BytesIO(build_memoire_docx_ex(CONTENU, "AO fictif", "Entreprise fictive").octets))
    tableau = next(t for t in doc.tables if t.rows[0].cells[1].text.strip() == "Nom")
    assert "À compléter" in tableau.rows[1].cells[1].text
    largeur_nom = tableau.columns[1].width
    # « À compléter : nom » tient sur deux lignes au plus, sans couper « compléter » : au moins 3 cm
    assert largeur_nom >= Cm(3), largeur_nom / 360000
