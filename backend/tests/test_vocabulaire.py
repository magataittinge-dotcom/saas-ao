"""1.5 — Mots calmes côté serveur : aucun mot interdit ni franglais dans ce que
l'utilisateur lit (messages d'erreur de l'API, notifications et e-mails,
libellés de progression).

Toutes les chaînes des routeurs et des services de notification sont lues,
sauf les docstrings, les journaux (logger, print) et les identifiants
techniques (un seul mot sans espace : statuts, clés, chemins)."""
import ast
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
FICHIERS = sorted((RACINE / "routers").glob("*.py")) + [
    RACINE / "services" / "notifications.py",
    RACINE / "services" / "quota.py",
    RACINE / "services" / "pipeline_tracker.py",
]

INTERDITS = [
    (re.compile(r"manquant", re.I), "« manquant »"),
    (re.compile(r"incompl[eè]t", re.I), "« incomplet »"),
    (re.compile(r"\babsente?s?\b", re.I), "« absent »"),
    (re.compile("❌"), "« ❌ »"),
    (re.compile(r"\bAttention\s*:"), "« Attention : »"),
    (re.compile(r"automatiquement rejet", re.I), "« automatiquement rejetée »"),
    (re.compile(r"(?<!/)\bupload", re.I), "« upload » (franglais)"),
    (re.compile(r"\bdeadline\b", re.I), "« deadline » (franglais)"),
    (re.compile(r"\bupgrade\b", re.I), "« upgrade » (franglais)"),
]

_JOURNAUX = re.compile(r"^(logger|logging|log|_log|print|warnings)\b")


def _docstrings(arbre: ast.AST) -> set[int]:
    ids = set()
    for n in ast.walk(arbre):
        if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.body:
            premier = n.body[0]
            if isinstance(premier, ast.Expr) and isinstance(premier.value, ast.Constant) and isinstance(premier.value.value, str):
                ids.add(id(premier.value))
    return ids


def _dans_un_journal(arbre: ast.AST) -> set[int]:
    ids = set()
    for n in ast.walk(arbre):
        if isinstance(n, ast.Call) and _JOURNAUX.match(ast.unparse(n.func)):
            for enfant in ast.walk(n):
                ids.add(id(enfant))
    return ids


def textes_utilisateur(fichier: Path) -> list[tuple[int, str]]:
    arbre = ast.parse(fichier.read_text(encoding="utf-8"))
    exclus = _docstrings(arbre) | _dans_un_journal(arbre)
    res = []
    for n in ast.walk(arbre):
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in exclus:
            texte = n.value
            if not texte.strip() or re.fullmatch(r"[\w./:{}\-*%]*", texte):
                continue  # identifiant technique (statut, clé, chemin, motif)
            res.append((n.lineno, texte))
    return res


def test_aucun_mot_interdit_ni_franglais_dans_les_textes_serveur():
    fautes = []
    for f in FICHIERS:
        for ligne, texte in textes_utilisateur(f):
            for motif, nom in INTERDITS:
                if motif.search(texte):
                    fautes.append(f"{f.relative_to(RACINE)}:{ligne} {nom} — « {texte.strip()[:90]} »")
    assert fautes == []
