"""B4 (PLAN § 7.3, reste) — chaque exigence de contenu technique du règlement pointe vers le paragraphe du mémoire
qui la traite, sinon « À couvrir ». Déterministe, sans IA, recalculé à chaque lecture (rien n'est écrit).

Quelles exigences : celles que l'analyse a classées « offre » (documents et contenu de l'offre) ou
« critères de notation », lues dans le RÈGLEMENT (le routeur garde celles dont le document source est un RC), avec
leur source. Sont écartées avant tout calcul : les pièces et formulaires (DC1, DC2, DUME, acte d'engagement, DPGF,
attestations…), la forme (nombre de pages, format, police), et tout ce qui parle de prix (frontière chiffrage :
``memoire_criteres._est_prix``). Une exigence générale (« la valeur technique de l'offre »), sans mot précis, se lit
sur l'ensemble du mémoire : elle n'est pas listée (même règle que les sous-critères).

Le rapprochement : MÊME normalisation que ``memoire_criteres`` (accents, casse, ligatures, pluriels et féminins,
racine de 7 lettres, mots vides, mots d'usage courant du BTP), plus les verbes et noms de consigne du règlement
(« le candidat précisera les modalités… ») qui ne désignent aucun contenu. Deux racines se valent si elles sont
égales ou si l'une commence l'autre (4 lettres au moins ; « évacués » / « évacuation »).

  • Un paragraphe (ligne non vide d'une section) traite l'exigence quand il porte au moins la moitié de ses mots
    précis (et au moins deux, sauf exigence d'un seul mot) : le paragraphe qui en porte le plus, puis le premier.
  • À défaut, une section qui, à elle seule, en porte la moitié : son paragraphe qui en porte le plus.
  • Le préambule, qui résume tout le mémoire, ne sert qu'à défaut d'une partie qui traite l'exigence.
  • Sinon : « À couvrir », avec la section la plus proche (celle qui en porte le plus, s'il y en a une).

Mots positifs seulement : « Traitée », « À couvrir » ; jamais « manquant », « incomplet » ni « absent ».
"""
from __future__ import annotations

import re
from typing import Any, Iterable, Optional

from services.memoire_criteres import _COURANTES, _est_prix, _racines, _sans_accents
from services.relecture_memoire import _LIMITE_PAGES, sections_du_memoire

TRAITEE = "traitee"
A_COUVRIR = "a_couvrir"
_LIBELLES = {TRAITEE: "Traitée", A_COUVRIR: "À couvrir"}
CATEGORIES_CONTENU = ("offre", "criteres_notation")
_EXTRAIT = 160
_TEXTE = 400

# Verbes et noms de consigne : ils disent ce que le candidat doit faire, pas de quoi le mémoire parle.
_CONSIGNE = _racines(
    "candidat candidats soumissionnaire titulaire preciser precisera precise indiquer indiquera detailler detaillera "
    "decrire decrira presenter presentera presentation fournir fournira justifier justifiera expliquer expliquera "
    "developper developpera exposer exposera mentionner mentionnera comprendre comprendra notamment modalite "
    "modalites memoire note methodologique cadre reponse doit devra devront sera seront ensemble element elements "
    "dispositions disposition chaque toute tous permettant permettre envisagees envisages prevues prevus "
    "pts point points"
)

# Pièces, formulaires et forme : ce n'est pas le contenu du mémoire.
_PIECE_OU_FORME = re.compile(
    r"\b(?:dc\s?1|dc\s?2|dc\s?4|dume|acte\s+d.?\s?engagement|ae|dpgf|bpu|dqe|kbis|urssaf|attestations?|"
    r"certificats?\s+(?:fiscal|social)|signe[es]?|signature|formats?|police|a4|a3|exemplaires?|cle\s+usb|"
    r"plateforme|profil\s+(?:d.?\s?)?acheteur|plis?|fichiers?|dossiers?\s+electroniques?|nommer|nommage|"
    r"renseignements?\s+complementaires|questions?\s+ecrites?)\b")


def _racines_contenu(texte: str) -> frozenset[str]:
    return frozenset(r for r in _racines(texte) if r not in _COURANTES and r not in _CONSIGNE)


def _meme_racine(a: str, b: str) -> bool:
    if a == b:
        return True
    court, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if len(court) >= 4:
        return long_.startswith(court)
    return len(court) == 3 and len(long_) == 4 and long_.startswith(court)


def _communes(exigence: frozenset[str], texte: frozenset[str]) -> int:
    return sum(1 for r in exigence if any(_meme_racine(r, t) for t in texte))


def _suffit(n: int, total: int) -> bool:
    if total == 1:
        return n == 1
    return n >= 2 and 2 * n >= total


def est_contenu_technique(e: dict) -> bool:
    """Exigence de contenu de l'offre technique (catégorie, pas de pièce, de forme ni de prix), avec une source."""
    texte = str(e.get("texte") or "").strip()
    if not texte or e.get("categorie") not in CATEGORIES_CONTENU or not e.get("source"):
        return False
    norm = _sans_accents(texte)
    if _est_prix(texte) or _PIECE_OU_FORME.search(norm) or _LIMITE_PAGES.search(norm):
        return False
    return bool(_racines_contenu(texte))


def _paragraphes(contenu: Any) -> list[tuple[str, str, int, str, frozenset[str]]]:
    """(ancre, titre de section, rang du paragraphe dans la section, texte, racines) — ordre du document."""
    sortie = []
    for s in sections_du_memoire(contenu if isinstance(contenu, dict) else {}):
        rang = 0
        for ligne in s.texte.split("\n"):
            if not ligne.strip():
                continue
            sortie.append((s.ancre, s.titre, rang, ligne.strip(), frozenset(_racines(ligne))))
            rang += 1
    return sortie


def _extrait(texte: str) -> str:
    return texte if len(texte) <= _EXTRAIT else texte[:_EXTRAIT].rsplit(" ", 1)[0] + " …"


def elements_de_liste(texte: str) -> list[str]:
    """Une exigence qui énumère (« un mémoire comprenant : A, B, C ») : ses éléments, chacun relié à part. Sinon []."""
    if ":" not in texte:
        return []
    suite = texte.split(":", 1)[1]
    elements = [m.strip(" .;-–") for m in re.split(r"[,;]|\s[-–]\s|\n", suite)]
    elements = [m for m in elements if _racines_contenu(m)]
    return elements if len(elements) >= 2 else []


class _Memoire:
    """Les paragraphes et sections du mémoire, lus une fois pour toutes les exigences."""

    def __init__(self, contenu: Any):
        self.paragraphes = _paragraphes(contenu)
        self.par_section: dict[str, frozenset[str]] = {}
        self.titres: dict[str, str] = {}
        for ancre, titre, _rang, _texte, racines in self.paragraphes:
            self.par_section[ancre] = self.par_section.get(ancre, frozenset()) | racines
            self.titres[ancre] = titre
        self.ordre = {a: k for k, a in enumerate(self.par_section)}

    def relier(self, cible: frozenset[str]) -> dict:
        """``{statut, libelle, ancre, section, paragraphe, extrait}`` pour un ensemble de racines."""
        total = len(cible)
        notes = [(_communes(cible, p[4]), -i, p) for i, p in enumerate(self.paragraphes)]
        sections = [(_communes(cible, r), -self.ordre[a], a) for a, r in self.par_section.items()]
        # Le préambule résume tout le mémoire : il ne sert qu'à défaut d'une partie qui traite l'exigence.
        for avec_preambule in (False, True):
            permis = [n for n in notes if avec_preambule or n[2][0] != "preambule"]
            meilleur = max(permis, default=None)
            if meilleur and _suffit(meilleur[0], total):
                return _lien(meilleur[2])
            permises = [s for s in sections if avec_preambule or s[2] != "preambule"]
            proche = max(permises, default=None)
            if proche and _suffit(proche[0], total):
                return _lien(max(n for n in notes if n[2][0] == proche[2])[2])
        proche = max(sections, default=None)
        ancre = proche[2] if proche and proche[0] > 0 else None
        return {"statut": A_COUVRIR, "libelle": _LIBELLES[A_COUVRIR], "ancre": ancre,
                "section": self.titres.get(ancre or ""), "paragraphe": None, "extrait": None}


def _lien(p: tuple) -> dict:
    return {"statut": TRAITEE, "libelle": _LIBELLES[TRAITEE], "ancre": p[0], "section": p[1], "paragraphe": p[2],
            "extrait": _extrait(p[3])}


def relier_exigences(contenu: Any, exigences: Iterable[dict]) -> list[dict]:
    """``exigences`` : ``[{id, texte, categorie, source}]`` dans l'ordre du règlement. Rend une ligne par exigence de
    contenu technique : ``{id, texte, source, statut, libelle, ancre, section, paragraphe, extrait, elements}``.

    Une exigence qui énumère (« comprenant : A, B, C ») est « Traitée » quand CHACUN de ses éléments l'est ; ses
    ``elements`` disent lesquels (``{texte, statut, libelle, ancre, section, paragraphe, extrait}``) et la ligne
    pointe vers le premier élément à couvrir, sinon vers le premier élément."""
    memoire = _Memoire(contenu)
    lignes: list[dict] = []
    vues: set[frozenset[str]] = set()
    for e in exigences:
        if not est_contenu_technique(e):
            continue
        cible = _racines_contenu(e["texte"])
        if cible in vues:
            continue
        vues.add(cible)
        elements = [{"texte": t[:_TEXTE], **memoire.relier(_racines_contenu(t))}
                    for t in elements_de_liste(str(e["texte"]))]
        if elements:
            a_couvrir = [x for x in elements if x["statut"] == A_COUVRIR]
            tete = {k: v for k, v in (a_couvrir[0] if a_couvrir else elements[0]).items() if k != "texte"}
        else:
            tete = memoire.relier(cible)
        lignes.append({"id": e.get("id"), "texte": str(e["texte"]).strip()[:_TEXTE], "source": e.get("source"),
                       **tete, "elements": elements})
    return lignes


def resume(lignes: list[dict]) -> dict:
    """Le bloc ``exigences`` de la relecture."""
    traitees = sum(1 for l in lignes if l["statut"] == TRAITEE)
    return {"lignes": lignes, "traitees": traitees, "a_couvrir": len(lignes) - traitees}
