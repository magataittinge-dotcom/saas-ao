"""« Relire mon mémoire » : un contrôle DÉTERMINISTE d'un mémoire rédigé (phase F, 0 € : aucun appel au modèle).

Fonction pure, sans base : elle reçoit le contenu du mémoire et ce que l'analyse a déjà lu (critères et
sous-critères du règlement de consultation, pièces de la checklist, liste des DTU autorisés, limite de pages
éventuelle) et rend UNE LISTE COURTE, une ligne par point à reprendre. Cinq contrôles :

  1. « À couvrir »  : chaque sous-critère du RC est nommé dans le mémoire. Un sous-critère est « nommé » quand
     tous ses mots significatifs (sans accents, casse, mots vides ni pluriel simple) figurent dans un même
     paragraphe du mémoire.
  2. « À citer »    : les pièces de l'offre technique demandées par le RC sont citées. Règle simple : les pièces
     de la checklist dont le type est un contenu de l'offre technique (planning, organigramme, références de
     travaux, effectifs) doivent apparaître par leur mot dans le mémoire. Les attestations et formulaires
     administratifs (Kbis, URSSAF, DC1…) n'ont pas à y être cités.
  3. « À compléter » : les passages « [À COMPLÉTER : …] » restants, comptés par section, avec la MÊME règle que
     l'export Word (``docx_exporter``), plus la raison sociale de la page de garde quand elle est inconnue.
  4. « Hors liste autorisée » : les DTU cités qui ne sont pas dans la liste du lot (``dtu_autorises.regle_dtu``).
  5. « À resserrer » : la longueur estimée dépasse la limite de pages du RC, SI l'analyse a relevé une limite
     (dans les exigences). Sans limite relevée, la ligne n'apparaît pas : rien n'est inventé.

Mots positifs seulement : jamais « manquant », « incomplet » ni « absent ».
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from services.ai.dtu_autorises import trouver_dtu
from services.docx_exporter import _A_COMPLETER_RE, _PART_A, _PART_B, _PART_C, sections_de_la_partie

A_COUVRIR = "À couvrir"
A_CITER = "À citer"
A_COMPLETER = "À compléter"
HORS_LISTE = "Hors liste autorisée"
A_RESSERRER = "À resserrer"

MESSAGE_RAS = ("Le mémoire nomme chaque sous-critère du règlement, cite les pièces attendues et ne contient "
               "aucun passage à compléter ni DTU hors liste.")

# Mots vides : n'identifient pas un sous-critère (« moyens humains ET matériels affectés AU chantier »).
_MOTS_VIDES = frozenset({
    "a", "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "en", "et", "la", "le", "les", "leur", "leurs",
    "l", "d", "s", "n", "qu", "ou", "par", "pour", "sur", "un", "une", "son", "sa", "ses", "est", "sont", "ete",
    "selon", "sous", "vers", "entre", "plus", "moins", "tres", "bien", "tout", "tous", "toute", "toutes",
})

# Pièces de l'offre technique, par type canonique de la checklist (checklist_typology) :
# (mots cherchés dans le mémoire, ancre de la section où la pièce est citée).
_PIECES_TECHNIQUES: dict[str, tuple[tuple[str, ...], str]] = {
    "planning": (("planning", "calendrier"), "sec-respect_planning"),
    "organigramme_doc": (("organigramme",), "sec-organigramme"),
    "attestation_travaux": (("reference", "references"), "sec-references"),
    "effectifs": (("effectif", "effectifs"), "sec-effectifs"),
}

_LIBELLES_PIECES = {
    "planning": "Planning prévisionnel",
    "organigramme_doc": "Organigramme de l'entreprise",
    "attestation_travaux": "Références de travaux",
    "effectifs": "Déclaration des effectifs",
}

_TITRES: dict[str, str] = {}
for _part, _lettre, _liste in (("partie_a", "A", _PART_A), ("partie_b", "B", _PART_B), ("partie_c", "C", _PART_C)):
    for _cle, _titre in _liste:
        _TITRES[f"sec-{_cle}"] = f"Partie {_lettre} · {_titre}"
_TITRES["preambule"] = "Préambule"


def _sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texte or "") if not unicodedata.combining(c))


def _mot_simple(mot: str) -> str:
    """Pluriel simple retiré (« critères » = « critère », « travaux » = « travau » des deux côtés)."""
    if len(mot) > 3 and mot[-1] in "sx":
        return mot[:-1]
    return mot


def mots_significatifs(texte: str) -> list[str]:
    """Mots d'un texte, sans accents ni casse, sans mots vides, pluriel simple ramené au singulier."""
    brut = re.findall(r"[a-z0-9]+", _sans_accents(texte).lower())
    return [_mot_simple(m) for m in brut if m not in _MOTS_VIDES and len(m) > 1]


@dataclass(frozen=True)
class Section:
    ancre: str       # « preambule » ou « sec-<clé> » (ancres de StepMemoire.tsx)
    titre: str
    texte: str


def sections_du_memoire(contenu: dict[str, Any]) -> list[Section]:
    """Préambule puis les sections des parties A, B, C, dans l'ordre du document (mêmes sections que l'export)."""
    sections: list[Section] = []
    pre = contenu.get("preambule")
    if isinstance(pre, str) and pre.strip():
        sections.append(Section("preambule", _TITRES["preambule"], pre))
    for cle, lettre, defaut in (("partie_a", "A", _PART_A), ("partie_b", "B", _PART_B), ("partie_c", "C", _PART_C)):
        partie = contenu.get(cle)
        if not isinstance(partie, dict):
            continue
        liste = sections_de_la_partie(contenu, cle, defaut)
        for sous_cle, titre in liste:
            texte = partie.get(sous_cle)
            if isinstance(texte, str) and texte.strip():
                ancre = f"sec-{sous_cle}"
                # plan suivi : titre du patron sans son numéro ; sinon le titre du modèle
                propre = _TITRES[ancre] if liste is defaut else f"Partie {lettre} · {titre.split('. ', 1)[-1]}"
                sections.append(Section(ancre, propre, texte))
    return sections


def estimation_pages(sections: Iterable[Section]) -> int:
    """~500 mots par page (même ordre de grandeur que l'estimation de l'écran d'export), au moins 1."""
    mots = sum(len(s.texte.split()) for s in sections)
    return max(1, mots // 500)


# ── 1. Sous-critères ───────────────────────────────────────────────────────────

def _paragraphes(sections: list[Section]) -> list[tuple[str, set[str]]]:
    """(ancre, mots significatifs) de chaque paragraphe (ligne) du mémoire."""
    out: list[tuple[str, set[str]]] = []
    for s in sections:
        for ligne in s.texte.split("\n"):
            mots = set(mots_significatifs(ligne))
            if mots:
                out.append((s.ancre, mots))
    return out


def sous_criteres_du_rc(criteres: Any) -> list[tuple[str, str]]:
    """(critère, sous-critère) de ``projects.criteres_jugement``. Un critère sans sous-critère ne produit rien."""
    out: list[tuple[str, str]] = []
    for c in criteres if isinstance(criteres, list) else []:
        if not isinstance(c, dict):
            continue
        for sc in c.get("sous_criteres") or []:
            nom = sc.get("nom") if isinstance(sc, dict) else None
            if isinstance(nom, str) and nom.strip():
                out.append((str(c.get("nom") or ""), nom.strip()))
    return out


def _controle_sous_criteres(sections: list[Section], criteres: Any, source: Optional[dict]) -> list[dict]:
    paragraphes = _paragraphes(sections)
    par_section: dict[str, set[str]] = {}
    for ancre, mots in paragraphes:
        par_section.setdefault(ancre, set()).update(mots)
    lignes: list[dict] = []
    deja: set[str] = set()
    for critere, nom in sous_criteres_du_rc(criteres):
        mots = set(mots_significatifs(nom))
        cle = " ".join(sorted(mots))
        if not mots or cle in deja:
            continue
        deja.add(cle)
        if any(mots <= p for _, p in paragraphes):
            continue
        # Section la plus proche : celle qui porte le plus de mots du sous-critère (préambule à défaut).
        ancre = max(par_section, key=lambda a: len(mots & par_section[a]), default="preambule")
        if not (mots & par_section.get(ancre, set())):
            ancre = "preambule"
        lignes.append(_ligne("sous_critere", A_COUVRIR, nom, ancre, source, detail=critere or None))
    return lignes


# ── 2. Pièces de l'offre technique ─────────────────────────────────────────────

def _controle_pieces(sections: list[Section], pieces: Iterable[dict]) -> list[dict]:
    mots_memoire = {m for s in sections for m in mots_significatifs(s.texte)}
    lignes: list[dict] = []
    deja: set[str] = set()
    for p in pieces:
        type_ = p.get("type")
        if type_ not in _PIECES_TECHNIQUES or type_ in deja:
            continue
        deja.add(type_)
        mots, ancre = _PIECES_TECHNIQUES[type_]
        if any(_mot_simple(m) in mots_memoire for m in mots):
            continue
        lignes.append(_ligne("piece", A_CITER, _LIBELLES_PIECES[type_], ancre, p.get("source")))
    return lignes


# ── 3. Passages « À compléter » ────────────────────────────────────────────────

def _controle_a_completer(sections: list[Section], raison_sociale_vide: bool) -> list[dict]:
    lignes: list[dict] = []
    for s in sections:
        trouves = [" ".join((m.group(1) or "").split()) for m in _A_COMPLETER_RE.finditer(s.texte)]
        if not trouves:
            continue
        libelles = [t for t in trouves if t]
        texte = f"{len(trouves)} passage{'s' if len(trouves) > 1 else ''}"
        if libelles:
            texte += " : " + " ; ".join(libelles[:3]) + (" …" if len(libelles) > 3 else "")
        ligne = _ligne("a_completer", A_COMPLETER, texte, s.ancre, None)
        ligne["nombre"] = len(trouves)
        lignes.append(ligne)
    if raison_sociale_vide:
        # Même règle que l'export : la page de garde porte un passage de plus, compté.
        ligne = _ligne("a_completer", A_COMPLETER, "Raison sociale, page de garde", None, None)
        ligne["nombre"] = 1
        ligne["lien"] = "/company?rubrique=identite"
        lignes.append(ligne)
    return lignes


# ── 4. DTU hors liste ──────────────────────────────────────────────────────────

def _controle_dtu(sections: list[Section], autorises: set[str]) -> list[dict]:
    lignes: list[dict] = []
    vus: set[str] = set()
    for s in sections:
        for mention in trouver_dtu(s.texte):
            if mention.numero in autorises or mention.numero in vus:
                continue
            vus.add(mention.numero)
            lignes.append(_ligne("dtu", HORS_LISTE, f"DTU {mention.numero}", s.ancre, None))
    return lignes


# ── 5. Longueur ────────────────────────────────────────────────────────────────

_DEPASSER = (r"(?:ne\s+(?:doit|devra|pourra|peut)\s+pas\s+(?:depasser|exceder)|n['’]excedera\s+pas|ne\s+depassera\s+pas"
             r"|ne\s+depassant\s+pas|maximum|max\.?|limite[es]?\s+a|au\s+plus|pas\s+plus\s+de)")
_LIMITE_PAGES = re.compile(_DEPASSER + r"[^.\n]{0,40}?(\d{1,3})\s*pages?\b")
_OFFRE_TECHNIQUE = re.compile(r"memoire|note\s+methodologique|offre\s+technique|note\s+technique")


def limite_de_pages(exigences: Iterable[dict]) -> Optional[dict]:
    """La limite de pages du mémoire, SI une exigence relevée par l'analyse la porte
    (« le mémoire technique ne devra pas dépasser 20 pages ») : ``{pages, source}``. Sinon None."""
    for e in exigences:
        texte = _sans_accents(str(e.get("texte") or "")).lower().replace("’", "'")
        if not _OFFRE_TECHNIQUE.search(texte):
            continue
        m = _LIMITE_PAGES.search(texte)
        if m and int(m.group(1)) > 0:
            return {"pages": int(m.group(1)), "source": e.get("source")}
    return None


def _controle_longueur(sections: list[Section], limite: Optional[dict]) -> list[dict]:
    if not limite:
        return []
    pages = estimation_pages(sections)
    if pages <= limite["pages"]:
        return []
    return [_ligne("longueur", A_RESSERRER, f"environ {pages} pages pour {limite['pages']} au plus",
                   "preambule", limite.get("source"))]


# ── Assemblage ─────────────────────────────────────────────────────────────────

def _ligne(type_: str, libelle: str, texte: str, ancre: Optional[str], source: Optional[dict],
           detail: Optional[str] = None) -> dict:
    return {
        "type": type_, "libelle": libelle, "texte": texte,
        "ancre": ancre, "section": _TITRES.get(ancre or ""),
        "source": source if isinstance(source, dict) else None,
        "detail": detail,
    }


@dataclass
class Relecture:
    lignes: list[dict] = field(default_factory=list)
    pages_estimees: int = 0
    limite_pages: Optional[int] = None

    def en_dict(self) -> dict:
        return {
            "lignes": self.lignes,
            "nombre": len(self.lignes),
            "message": MESSAGE_RAS if not self.lignes else None,
            "pages_estimees": self.pages_estimees,
            "limite_pages": self.limite_pages,
        }


def relire_memoire(
    contenu: dict[str, Any],
    *,
    criteres: Any = None,
    source_criteres: Optional[dict] = None,
    pieces: Iterable[dict] = (),
    dtu_autorises: Iterable[str] = (),
    exigences: Iterable[dict] = (),
    raison_sociale_vide: bool = False,
) -> Relecture:
    """Le contrôle complet. ``pieces`` : ``[{type, source}]`` (type canonique de la checklist) ; ``exigences`` : ``[{texte, source}]`` ;
    ``source`` : ``{type: "champ", document, page, excerpt}`` ou ``{type: "exigence", id}`` (voir le routeur)."""
    sections = sections_du_memoire(contenu or {})
    limite = limite_de_pages(exigences)
    lignes = (
        _controle_sous_criteres(sections, criteres, source_criteres)
        + _controle_pieces(sections, pieces)
        + _controle_a_completer(sections, raison_sociale_vide)
        + _controle_dtu(sections, set(dtu_autorises))
        + _controle_longueur(sections, limite)
    )
    titres = {sec.ancre: sec.titre for sec in sections}      # plan suivi : le titre du patron, pas celui du modèle
    for ligne in lignes:
        if ligne.get("ancre") in titres:
            ligne["section"] = titres[ligne["ancre"]]
    return Relecture(lignes, estimation_pages(sections), limite["pages"] if limite else None)
