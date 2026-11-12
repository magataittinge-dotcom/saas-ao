"""B7 — contrôle d'un formulaire rempli déposé en PDF (DC1, DC2, acte d'engagement…).

Avant : n'importe quel PDF importé comme formulaire rempli comptait « prêt » sans contrôle (RECETTE-OZCAN, détail
« 1 prête sans contrôle »). Désormais, le texte lu dans le PDF au moment du dépôt doit contenir la raison sociale OU
le SIRET de l'entreprise (profil « Mon entreprise ») ; sinon la ligne passe « À relire ». Un scan sans texte passe
« À relire » aussi. Simple recoupement de chaînes, aucune règle juridique, aucune IA ; jamais bloquant (le fichier
part dans le dossier). Le texte lu n'est pas conservé : une pièce remplie par l'entreprise n'est jamais une source.

Fonction pure, testée sans base : ``controle_formulaire_rempli``.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional

# Moins de caractères utiles que ça : rien à lire (scan, image, page blanche).
_TEXTE_MINIMAL = 20

# Formes juridiques retirées de la raison sociale avant la comparaison : « SARL Maçonnerie du Bocage » se lit
# « Maçonnerie du Bocage » sur un formulaire où la forme est écrite dans une autre case.
_FORMES = frozenset({
    "sarl", "sarlu", "sas", "sasu", "sa", "eurl", "snc", "scop", "sci", "scs", "sca", "sel", "selarl",
    "ei", "eirl", "gie", "sem", "scic",
})

MOTIF_SANS_TEXTE = ("Le texte de ce PDF ne se lit pas (scan ou image) : relisez-le avant le dépôt pour vérifier "
                    "qu’il est bien rempli au nom de votre entreprise.")
MOTIF_PROFIL = ("Renseignez votre raison sociale ou votre SIRET dans « Mon entreprise » : Synorix pourra alors "
                "vérifier que ce formulaire est rempli à votre nom. En attendant, relisez-le avant le dépôt.")
MOTIF_AUTRE_NOM = ("Ni votre raison sociale ni votre SIRET n’apparaissent dans le texte de ce formulaire : "
                   "relisez-le avant le dépôt.")


def _forme(texte: str) -> str:
    """Minuscules, sans accents, lettres et chiffres séparés par une espace (« Maçonnerie-du  Bocage » →
    « maconnerie du bocage »)."""
    sans_accents = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode("ascii")
    return " ".join(re.findall(r"[a-z0-9]+", sans_accents.lower()))


def _nom_sans_forme(raison_sociale: str) -> str:
    mots = _forme(raison_sociale).split()
    while mots and mots[0] in _FORMES:
        mots.pop(0)
    while mots and mots[-1] in _FORMES:
        mots.pop()
    return " ".join(mots)


def _chiffres_colles(texte: str) -> str:
    """Les chiffres séparés par des espaces, points, tirets (« 123 456 789 00012 ») recollés."""
    return re.sub(r"(?<=\d)[\s.\-  ]+(?=\d)", "", texte or "")


def contient_raison_sociale(texte: str, raison_sociale: str) -> bool:
    nom = _nom_sans_forme(raison_sociale)
    if len(nom.replace(" ", "")) < 3:
        return False
    return f" {nom} " in f" {_forme(texte)} "


def contient_siret(texte: str, siret: Optional[str]) -> bool:
    chiffres = re.sub(r"\D", "", siret or "")
    if len(chiffres) != 14:
        return False
    return re.search(rf"(?<!\d){chiffres}(?!\d)", _chiffres_colles(texte)) is not None


def controle_formulaire_rempli(texte: str, *, raison_sociale: str, siret: Optional[str]) -> Optional[str]:
    """``None`` si le formulaire porte la raison sociale ou le SIRET de l'entreprise ; sinon le motif « À relire »
    à afficher (une phrase, sans « manquant », « incomplet » ni « absent »)."""
    if len(re.sub(r"\s", "", texte or "")) < _TEXTE_MINIMAL:
        return MOTIF_SANS_TEXTE
    nom_connu = len(_nom_sans_forme(raison_sociale).replace(" ", "")) >= 3
    siret_connu = len(re.sub(r"\D", "", siret or "")) == 14
    if not nom_connu and not siret_connu:
        return MOTIF_PROFIL
    if contient_raison_sociale(texte, raison_sociale) or contient_siret(texte, siret):
        return None
    return MOTIF_AUTRE_NOM
