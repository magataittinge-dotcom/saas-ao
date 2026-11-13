"""FIN-SRV, point 1 — les textes que le client lit s'accordent au moment où le serveur les écrit : jamais de pluriel
entre parenthèses (« 605 exigence(s) extraite(s) »). « 0 » et « 1 » au singulier. Valeurs inventées.

Le balayage parcourt le code du serveur (hors tests, migrations et scripts) et refuse toute chaîne de caractères qui
porterait de nouveau « (s) », « (e) », « (es) »… Il ne lit ni les commentaires, ni les docstrings, ni les journaux
(appels `logger.*`, `journal.*`, `print`). Les fichiers des textes envoyés au modèle sont exclus nommément : aucun
prompt ne change (règle du projet)."""
import ast
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from schemas.profil_entreprise import LigneEffectif, LigneHabilitation
from services import depot_extraction
from services.accords import accord, mot
from services.visuels import moyens
from services.visuels.couleurs import Theme

RACINE = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("n,attendu", [(0, "0 exigence extraite"), (1, "1 exigence extraite"),
                                       (2, "2 exigences extraites"), (605, "605 exigences extraites")])
def test_accord_zero_et_un_au_singulier(n, attendu):
    assert accord(n, "exigence extraite", "exigences extraites") == attendu


def test_mot_sans_le_nombre():
    assert mot(1, "autre élément", "autres éléments") == "autre élément"
    assert mot(4, "autre élément", "autres éléments") == "autres éléments"


# ── Famille « documents téléchargés » : la vignette des moyens matériels du mémoire ─────────────────────────────

@pytest.mark.parametrize("en_trop,attendu", [(1, "et 1 autre élément du profil"), (3, "et 3 autres éléments du profil")])
def test_vignette_materiels_accorde_le_reste(en_trop, attendu):
    lignes = "\n".join(f"Engin inventé {i}" for i in range(moyens.MAX_MATERIELS + en_trop))
    svg, _ = moyens.synoptique_materiels(moyens.lignes_materiel(lignes), Theme("#1E40AF"))
    assert attendu in svg
    assert "(s)" not in svg


def test_vignette_materiels_sans_reste_n_ecrit_rien():
    lignes = "\n".join(f"Engin inventé {i}" for i in range(moyens.MAX_MATERIELS))
    svg, _ = moyens.synoptique_materiels(moyens.lignes_materiel(lignes), Theme("#1E40AF"))
    assert "autre" not in svg


# ── Famille « propositions du dépôt » : « remplace 3 personnes » dans Mon entreprise ────────────────────────────

def _ctx(effectif: int, nombre: int):
    config = SimpleNamespace(effectifs_par_categorie=[{"categorie": "ouvrier", "specialite": "maçon", "effectif": effectif}],
                             habilitations=[{"type": "sst", "nombre": nombre}])
    return SimpleNamespace(config=config)


@pytest.mark.parametrize("actuel,attendu", [(0, "0 personne"), (1, "1 personne"), (3, "3 personnes")])
def test_propositions_personnel_remplace_accorde(actuel, attendu):
    v = {"effectifs": [LigneEffectif(categorie="ouvrier", specialite="maçon", effectif=7)],
         "habilitations": [LigneHabilitation(type="sst", nombre=7)]}
    sortie = depot_extraction._propositions_personnel(None, v, "macon sst", _ctx(actuel, actuel), frozenset())
    assert [b.remplace for b in sortie] == [attendu, attendu]


# ── Balayage : aucune chaîne montrée au client ne porte de nouveau un pluriel entre parenthèses ──────────────────

PLURIEL_ENTRE_PARENTHESES = re.compile(r"[A-Za-zÀ-ÿ]\((?:s|e|es|x|le|ne|nes)\)")

# Liste fermée des fichiers du tas b (textes envoyés au modèle), exclus avec leur raison.
EXCLUS_TEXTES_AU_MODELE = {
    "services/ai/prompts.py": "prompts système du pipeline (« renseigné(e) », « référence(s) ») : aucun prompt ne change",
    "services/ai/prompts_fonctions_c.py": "prompts des fonctions C1 à C4 (éteintes) : aucun prompt ne change",
    "services/ai/memoire_generator.py": "le plan transmis au modèle (« sert le(s) sous-critère(s) ») : aucun prompt ne change",
}
DOSSIERS_HORS_CHAMP = {"tests", "alembic", "scripts", "venv", ".venv", "uploads", "node_modules", "__pycache__"}
JOURNAUX = {"debug", "info", "warning", "warn", "error", "exception", "critical", "log"}


def _fichiers_du_serveur():
    for chemin in sorted(RACINE.rglob("*.py")):
        relatif = chemin.relative_to(RACINE)
        if relatif.parts[0] in DOSSIERS_HORS_CHAMP or any(p in DOSSIERS_HORS_CHAMP for p in relatif.parts):
            continue
        yield relatif.as_posix(), chemin


def _hors_lecture_client(arbre: ast.AST) -> set[int]:
    """Les nœuds des docstrings et des appels de journal : pas lus par le client."""
    ignores: set[int] = set()
    for noeud in ast.walk(arbre):
        if isinstance(noeud, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            corps = getattr(noeud, "body", [])
            if corps and isinstance(corps[0], ast.Expr) and isinstance(corps[0].value, ast.Constant):
                ignores.add(id(corps[0].value))
        if isinstance(noeud, ast.Call):
            f = noeud.func
            journal = (isinstance(f, ast.Name) and f.id == "print") or (isinstance(f, ast.Attribute) and f.attr in JOURNAUX)
            if journal:
                ignores.update(id(n) for n in ast.walk(noeud))
    return ignores


def test_aucun_pluriel_entre_parentheses_dans_les_textes_du_serveur():
    fautes = []
    vus = 0
    for relatif, chemin in _fichiers_du_serveur():
        if relatif in EXCLUS_TEXTES_AU_MODELE:
            continue
        vus += 1
        arbre = ast.parse(chemin.read_text(encoding="utf-8"))
        ignores = _hors_lecture_client(arbre)
        for noeud in ast.walk(arbre):
            if isinstance(noeud, ast.Constant) and isinstance(noeud.value, str) and id(noeud) not in ignores:
                if PLURIEL_ENTRE_PARENTHESES.search(noeud.value):
                    fautes.append(f"{relatif}:{noeud.lineno} « {noeud.value.strip()[:80]} »")
    assert vus > 100, "le balayage n'a pas trouvé le code du serveur"
    assert fautes == [], "pluriel entre parenthèses dans un texte lu par le client :\n" + "\n".join(fautes)


def test_les_fichiers_exclus_existent_encore():
    for relatif in EXCLUS_TEXTES_AU_MODELE:
        assert (RACINE / relatif).is_file(), f"{relatif} n'existe plus : le retirer de la liste fermée"
