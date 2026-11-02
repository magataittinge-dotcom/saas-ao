"""Le plan du mémoire (B1) : proposé SANS IA, modifiable par le patron, puis validé.

Une « partie » du plan est une sous-section du mémoire (les 25 du modèle du générateur, ou une partie ajoutée
« ajout_<n> » rattachée à A, B ou C). Le service est pur : il reçoit les critères du RC et les textes du dossier,
il ne lit ni base ni fichier, il n'appelle aucun modèle.

- ``proposer`` : les parties du modèle, plus celles que le RC ou le CCTP annoncent (« le mémoire technique
  comprendra : … ») quand le dossier en donne la liste ;
- ``rattacher_criteres`` : pour chaque partie, les sous-critères du RC qu'elle sert (table de thèmes de
  ``memoire_criteres``, AVANT toute rédaction), et ceux qu'aucune partie ne sert : « À couvrir ». Le critère prix
  est écarté avant tout calcul (frontière chiffrage) ;
- ``extraire_parties_attendues`` : la liste annoncée par le dossier, avec sa source ; rien n'est inventé quand il
  n'y a pas de liste ;
- ``valider`` : la forme du plan (clés connues, titres, ordre A/B/C, au moins une partie gardée).
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any, Iterable

from services.docx_exporter import _PART_A, _PART_B, _PART_C
from services.memoire_criteres import (
    PARTIES, _THEMES, _racines, _racines_precises, _unites,
)

MAX_PARTIES = 60
MAX_TITRE = 120
MAX_TEXTE_LIBRE = 1000
FICHE_VIDE = {"references": None, "personnes": None, "materiel": None, "voulu": ""}


def _sans_numero(titre: str) -> str:
    return re.sub(r"^\d+\.\s*", "", titre).strip()


def parties_de_base() -> list[dict]:
    """Les 25 sous-sections du modèle du générateur, dans l'ordre du document, avec le titre du Word (sans numéro)."""
    sortie = []
    for partie, liste in zip(PARTIES, (_PART_A, _PART_B, _PART_C)):
        for sous, titre in liste:
            sortie.append({"cle": f"{partie}.{sous}", "partie": partie, "titre": _sans_numero(titre)})
    return sortie


_CLES_BASE = {p["cle"] for p in parties_de_base()}
_TITRES_BASE = {p["cle"]: p["titre"] for p in parties_de_base()}
_RE_AJOUT = re.compile(r"^(partie_[abc])\.ajout_([1-9]\d{0,3})$")


def _partie(cle: str, titre: str, attendue: str | None = None) -> dict:
    return {"cle": cle, "partie": cle.split(".")[0], "titre": titre, "retiree": False,
            "attendue": attendue, "fiche": dict(FICHE_VIDE)}


# ── Parties attendues par le dossier ──────────────────────────────────────────

def _fond(texte: str) -> str:
    """Minuscules sans accents, MÊME LONGUEUR que le texte (les positions restent celles de l'original). La table de
    correspondance est faite sur les caractères DISTINCTS du texte : rapide même sur un règlement de plusieurs centaines de
    milliers de caractères."""
    def un(c: str) -> str:
        bas = c.lower().replace("’", "'")
        if len(bas) != 1:
            return c
        d = unicodedata.normalize("NFKD", bas)
        return d[0] if d and ord(d[0]) < 128 else bas
    table = {ord(c): un(c) for c in set(texte or "")}
    return (texte or "").translate(table)


_OBJET = r"(?:memoire(?:\s+(?:technique|justificatif))?|note\s+methodologique|offre\s+technique|note\s+technique)"
_VERBE = (r"(?:comprendra|comportera|contiendra|comprend|comporte|contient|devra\s+(?:comprendre|comporter|contenir|"
          r"presenter|traiter)|doit\s+(?:comprendre|comporter|contenir|presenter|traiter)|sera\s+compose|"
          r"presentera|traitera|developpera)")
# Puces des listes d'un règlement (lues dans les PDF : tirets, ronds, carrés, flèches, symboles Wingdings en zone privée).
_PUCES = "-–—•·*▪►◼■□●○◦➢➤✓✔\uf0b7\uf0a7\uf0d8\uf0fc\uf076"
# L'annonce peut tenir sur plusieurs lignes (« Le mémoire\ncomprend : ») : seuls . : ; coupent la phrase.
_DECLENCHEUR = re.compile(_OBJET + r"[^.:;]{0,120}?\b" + _VERBE + r"[^:]{0,60}:")
_COUPE_DE_PHRASE = re.compile(r"\.\s+(?=[A-ZÀ-Ý0-9])")
_MAX_ZONE = 900


def _libelle(brut: str) -> str:
    t = _COUPE_DE_PHRASE.split(brut, maxsplit=1)[0]       # le dernier élément s'arrête à la fin de sa phrase
    t = re.sub(r"\s+", " ", t).strip(f" \t\n{_PUCES};,.:")
    t = re.sub(r"^\(?[A-Za-z]\)\s+", "", t)          # « b) la liste » : la lettre de l'énumération n'est pas le titre
    t = re.sub(r"^(?:et|ou)\s+", "", t)
    if not t:
        return ""
    t = t[0].upper() + t[1:]
    if len(t) > MAX_TITRE:                                  # jamais coupé au milieu d'un mot
        t = t[: MAX_TITRE - 1].rsplit(" ", 1)[0].rstrip(" ,;:-–") + "…"
    return t


def _elements_de_la_liste(zone: str) -> list[str]:
    """Éléments d'une énumération : puces / numéros en début de ligne (un élément peut tenir sur plusieurs lignes), lettres
    ou « ; » dans la phrase."""
    zone = zone.split("\n\n")[0]
    lignes = re.split(rf"(?:^|\n)[ \t]*(?:[{re.escape(_PUCES)}]|\(?\d{{1,2}}[.)]|\d{{1,2}}°)[ \t]*", zone)
    morceaux: list[str] = []
    for ligne in lignes:
        morceaux.extend(re.split(r"\s*;\s*|\s+\(?[a-z]\)\s+|^\(?[a-z]\)\s+", ligne))
    return [m for m in (_libelle(x) for x in morceaux) if m]


def extraire_parties_attendues(textes: Iterable[dict]) -> list[dict]:
    """Les parties que le dossier annonce pour le mémoire. ``textes`` : des ``{"texte", "source"}``.

    Seul un déclencheur explicite (« le mémoire technique comprendra : … ») suivi d'une liste de 2 à 15 éléments
    produit des parties ; sinon rien. Rend ``[{"id", "libelle", "source"}]`` sans doublon."""
    vus: dict[str, dict] = {}
    for entree in textes:
        texte = entree.get("texte") or ""
        fond = _fond(texte)
        for m in _DECLENCHEUR.finditer(fond):
            zone = texte[m.end(): m.end() + _MAX_ZONE]
            elements = _elements_de_la_liste(zone)
            # la liste s'arrête au premier élément qui commence un nouvel article / paragraphe numéroté
            propres = []
            for e in elements:
                if re.match(r"(?i)^(article|chapitre|titre)\s+\d", e) or len(e) > 160:
                    break
                propres.append(e)
            if not 2 <= len(propres) <= 15:
                continue
            for e in propres:
                cle = re.sub(r"[^a-z0-9]+", " ", _fond(e)).strip()
                if len(cle) < 3 or cle in vus:
                    continue
                vus[cle] = {"id": "att_" + hashlib.sha1(cle.encode()).hexdigest()[:10], "libelle": e,
                            "source": entree.get("source") or {}}
    return list(vus.values())


# ── Proposition ───────────────────────────────────────────────────────────────

_POUR_A = _racines("entreprise presentation reference certification historique siege agence")
_POUR_B = _racines("demarrage interlocuteur planning delai securite dechet environnement qualite controle reception")


def _partie_d_une_attendue(racines: frozenset[str]) -> str:
    """Où ranger une partie nouvelle : B si elle parle d'organisation / suivi / sécurité / déchets, A si elle parle de
    l'entreprise, sinon C (méthodologie)."""
    if racines & _POUR_B:
        return "partie_b"
    if racines & _POUR_A:
        return "partie_a"
    return "partie_c"


def _theme_de(cle: str, titre: str) -> frozenset[str]:
    return _THEMES.get(cle) or _racines_precises(titre)


def attendue_la_plus_proche(libelle: str) -> str | None:
    """La partie du modèle qui traite déjà de ce que le dossier annonce (plus de mots de thème en commun ; à égalité,
    la première du document), ou None. Un seul mot de thème en commun ne suffit pas (« suivi connecté » n'est pas
    « interlocuteur dédié ») : il faut un mot du titre de la partie, ou deux mots de son thème."""
    racines = _racines_precises(libelle)
    meilleur, score_max = None, 1
    for p in parties_de_base():
        score = len(racines & _THEMES[p["cle"]]) + len(racines & _racines_precises(p["titre"]))
        if score > score_max:
            meilleur, score_max = p["cle"], score
    return meilleur


def proposer(criteres: Any, attendues: list[dict]) -> list[dict]:
    """Le plan proposé : les 25 parties du modèle, plus une partie nouvelle pour chaque partie annoncée par le dossier
    qu'aucune partie du modèle ne traite. Aucune partie n'est retirée d'office."""
    plan = [_partie(p["cle"], p["titre"]) for p in parties_de_base()]
    suivant = 1      # numéro d'ajout UNIQUE dans tout le plan : les ancres « sec-ajout_<n> » du mémoire ne se doublent jamais
    for att in attendues or []:
        if attendue_la_plus_proche(att["libelle"]):
            continue                      # déjà traitée : le plan l'indique par la source, sans partie en double
        partie = _partie_d_une_attendue(_racines_precises(att["libelle"]))
        plan.append(_partie(f"{partie}.ajout_{suivant}", att["libelle"][:MAX_TITRE], att["id"]))
        suivant += 1
    return valider(plan)


# ── Rattachement des sous-critères ────────────────────────────────────────────

def partie_proche(racines: frozenset[str]) -> str:
    """La partie A, B ou C dont les thèmes (sur les 25 parties du modèle, retirées comprises) recoupent le plus les mots
    d'un sous-critère ; sans recoupement, C (méthodologie)."""
    totaux = {p: 0 for p in PARTIES}
    for cle, theme in _THEMES.items():
        totaux[cle.split(".")[0]] += len(racines & theme)
    meilleur = max(PARTIES, key=lambda p: (totaux[p], p == "partie_c"))
    return meilleur if totaux[meilleur] > 0 else "partie_c"


def rattacher_criteres(plan: list[dict], criteres: Any) -> dict:
    """Pour chaque partie GARDÉE, les sous-critères hors prix qu'elle sert (thème de la partie), et ceux qu'aucune
    partie gardée ne sert. Un sous-critère général (aucun mot précis) n'est pas compté, comme dans le mémoire rédigé."""
    themes = {p["cle"]: _theme_de(p["cle"], p["titre"]) for p in plan if not p.get("retiree")}
    par_partie: dict[str, list[dict]] = {}
    a_couvrir, total, servis = [], 0, 0
    for critere, nom, poids in _unites(criteres):
        racines = _racines_precises(nom)
        if not racines:
            continue
        total += 1
        parties = [cle for cle, theme in themes.items() if racines & theme]
        fiche = {"critere": critere, "nom": nom, "poids": poids}
        for cle in parties:
            par_partie.setdefault(cle, []).append(fiche)
        if parties:
            servis += 1
        else:
            a_couvrir.append({**fiche, "partie": partie_proche(racines)})   # où proposer d'ajouter une partie pour lui
    return {"par_partie": par_partie, "a_couvrir": a_couvrir, "total": total, "servis": servis}


# ── Validation ────────────────────────────────────────────────────────────────

def _titre_propre(titre: Any) -> str:
    t = re.sub(r"[\x00-\x1f\x7f]", " ", str(titre or ""))
    return re.sub(r"\s+", " ", t).strip()


def cle_valide(cle: str) -> bool:
    return cle in _CLES_BASE or bool(_RE_AJOUT.match(cle or ""))


def valider(parties: list[dict]) -> list[dict]:
    """Le plan normalisé, ou ``ValueError`` (message pour le patron). Titres nettoyés (espaces, caractères de contrôle),
    parties regroupées A, B, C sans changer l'ordre à l'intérieur d'une partie."""
    if len(parties) > MAX_PARTIES:
        raise ValueError(f"Un plan compte {MAX_PARTIES} parties au plus.")
    vues: set[str] = set()
    ajouts: set[str] = set()
    sortie = []
    for p in parties:
        cle = p.get("cle") or ""
        if not cle_valide(cle):
            raise ValueError(f"Partie inconnue : {cle[:60]}")
        if cle in vues:
            raise ValueError(f"La partie « {cle} » figure deux fois.")
        vues.add(cle)
        if ".ajout_" in cle:
            numero = cle.split(".", 1)[1]
            if numero in ajouts:
                raise ValueError("Deux parties ajoutées ne peuvent pas porter le même numéro.")
            ajouts.add(numero)
        titre = _titre_propre(p.get("titre")) or _TITRES_BASE.get(cle, "")
        if not titre:
            raise ValueError("Chaque partie ajoutée a besoin d'un titre.")
        if len(titre) > MAX_TITRE:
            raise ValueError(f"Un titre compte {MAX_TITRE} caractères au plus.")
        sortie.append({**p, "cle": cle, "partie": cle.split(".")[0], "titre": titre,
                       "retiree": bool(p.get("retiree")), "attendue": p.get("attendue"),
                       "fiche": {**FICHE_VIDE, **(p.get("fiche") or {})}})
    if not any(not p["retiree"] for p in sortie):
        raise ValueError("Gardez au moins une partie dans le plan.")
    sortie.sort(key=lambda p: PARTIES.index(p["partie"]))      # tri stable : l'ordre dans chaque partie est conservé
    return sortie


# ── Vue pour l'écran ──────────────────────────────────────────────────────────

def vue(plan: list[dict], criteres: Any, attendues: list[dict], limite_pages: dict | None) -> dict:
    """Le plan enrichi pour l'écran : sous-critères servis par partie, parties annoncées par le dossier (avec leur
    source), « À couvrir », résumé. Tout est recalculé ; rien de cela n'est enregistré."""
    rattachement = rattacher_criteres(plan, criteres)
    par_id = {a["id"]: a for a in attendues}
    annoncees: dict[str, list[dict]] = {}
    for a in attendues:
        cible = attendue_la_plus_proche(a["libelle"])
        if cible:
            annoncees.setdefault(cible, []).append({"id": a["id"], "libelle": a["libelle"], "source": a["source"]})
    parties = []
    for p in plan:
        propres = annoncees.get(p["cle"], [])
        if p.get("attendue") and p["attendue"] in par_id:
            a = par_id[p["attendue"]]
            propres = [{"id": a["id"], "libelle": a["libelle"], "source": a["source"]}] + propres
        parties.append({
            **p,
            "titre_modele": _TITRES_BASE.get(p["cle"]),
            "sous_criteres": rattachement["par_partie"].get(p["cle"], []) if not p["retiree"] else [],
            "attendues": propres,
            "source": propres[0]["source"] if propres else None,
        })
    gardees = [p for p in plan if not p["retiree"]]
    fiches = sum(1 for p in gardees if fiche_remplie(p.get("fiche")))
    return {
        "parties": parties,
        "a_couvrir": rattachement["a_couvrir"],
        "resume": {
            "parties": len(gardees), "retirees": len(plan) - len(gardees),
            "sous_criteres_total": rattachement["total"], "sous_criteres_servis": rattachement["servis"],
            "limite_pages": limite_pages["pages"] if limite_pages else None, "fiches_remplies": fiches,
        },
        "limite_pages": limite_pages,
    }


def fiche_remplie(fiche: dict | None) -> bool:
    """La fiche dit quelque chose : une case choisie (même une liste vide = un choix) ou une ligne libre."""
    f = fiche or {}
    return bool((f.get("voulu") or "").strip()) or any(f.get(k) is not None for k in ("references", "personnes", "materiel"))
