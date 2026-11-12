"""B3 — « Votre équipe face au dossier » : simple recoupement de mots, aucune règle juridique, aucune IA.

Les exigences du dossier (RC, CCAP, CCTP déjà lus par l'analyse) qui CITENT une habilitation ou une qualification sont
mises en face de ce que l'entreprise a déclaré dans « Mon entreprise » :
  • habilitations par type (``memoire_configs.habilitations`` : SST, CACES, habilitation électrique, amiante SS3 et
    SS4, travail en hauteur, autre) — nombre de personnes et date de validité, jamais un nom ;
  • qualifications, labels et certifications (table ``qualifications``, migration 0029) ;
  • certifications écrites sur les fiches de l'équipe (``team_members.certifications``).

Une ligne par habilitation citée, dans l'ordre où le dossier la cite, avec TOUTES les exigences qui la citent (sources).
« Dans votre profil » : le profil déclare cette habilitation, valable à la date du jour, avec les codes cités (CACES R482,
Qualibat 2112) quand le dossier en cite. Sinon « À confirmer », avec ce que le profil dit déjà. Rien n'est jugé : le
patron confirme. Les définitions affichées (CACES, SST, AIPR…) passent par le lexique sourcé de l'écran.

Détection (texte sans accents ni casse) :
  • CACES (et ses recommandations R3xx/R4xx), SST ou « sauveteur secouriste », AIPR ou « autorisation d'intervention à
    proximité des réseaux », « habilitation électrique », Qualibat (et ses codes à 4 chiffres écrits juste après), RGE ;
  • amiante : seulement avec la sous-section (3 ou 4) ou un mot de formation, de certification ou de compétence
    (« le diagnostic amiante est joint » ne cite aucune habilitation) ;
  • travail en hauteur : seulement avec un mot de formation ou d'habilitation (« la hauteur sous plafond » non plus).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterable, Optional

DANS_PROFIL = "dans_profil"
A_CONFIRMER = "a_confirmer"
_ETATS = {DANS_PROFIL: "Dans votre profil", A_CONFIRMER: "À confirmer"}
LIEN_MOYENS = "/company?rubrique=moyens"
LIEN_CERTIFICATIONS = "/company?rubrique=certifications"
_EXTRAIT = 200

# clé → (libellé, sigle du lexique de l'écran ou None, rubrique de « Mon entreprise »)
HABILITATIONS: dict[str, tuple[str, Optional[str], str]] = {
    "sst": ("Sauveteurs secouristes du travail (SST)", "SST", LIEN_MOYENS),
    "caces": ("CACES", "CACES", LIEN_MOYENS),
    "aipr": ("AIPR", "AIPR", LIEN_MOYENS),
    "habilitation_electrique": ("Habilitation électrique", None, LIEN_MOYENS),
    "amiante_ss3": ("Amiante sous-section 3", None, LIEN_MOYENS),
    "amiante_ss4": ("Amiante sous-section 4", None, LIEN_MOYENS),
    "amiante": ("Amiante (formation ou certification)", None, LIEN_MOYENS),
    "travail_hauteur": ("Travail en hauteur", None, LIEN_MOYENS),
    "qualibat": ("Qualification Qualibat", None, LIEN_CERTIFICATIONS),
    "rge": ("Label RGE", "RGE", LIEN_CERTIFICATIONS),
}
_COURT = {"sst": "SST", "caces": "CACES", "habilitation_electrique": "habilitation électrique",
          "amiante_ss3": "amiante SS3", "amiante_ss4": "amiante SS4", "travail_hauteur": "travail en hauteur"}

_CACES = re.compile(r"\bcaces\b")
_CODE_CACES = re.compile(r"\br\s?([34]\d{2})\b")
_SST = re.compile(r"\bsst\b|sauveteurs?[\s-]+secouristes?")
_AIPR = re.compile(r"\baipr\b|autorisations?\s+d.?\s?intervention\s+a\s+proximite\s+des\s+reseaux")
_ELEC = re.compile(r"habilitations?\s+electriques?")
_SS3 = re.compile(r"sous[\s-]*sections?\s*3\b|\bss\s?3\b")
_SS4 = re.compile(r"sous[\s-]*sections?\s*4\b|\bss\s?4\b")
_FORMATION = re.compile(r"\bforme[es]?\b|formation|certifi|qualifi|habilit|competence|attestation")
_HAUTEUR = re.compile(r"trava(?:il|ux)\s+(?:en|a)\s+hauteur")
_QUALIBAT = re.compile(r"qualibat([^.;:\n]{0,60})")
_CODE_QUALIBAT = re.compile(r"\b(\d{4})\b")
_RGE = re.compile(r"\brge\b")


def _norm(texte: Any) -> str:
    t = str(texte or "").lower().replace("’", "'").replace("œ", "oe")
    return "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))


def habilitations_citees(texte: str) -> dict[str, set[str]]:
    """Les habilitations et qualifications qu'une exigence cite : ``{clé: codes cités}`` (codes : « R482 », « 2112 »)."""
    t = _norm(texte)
    trouve: dict[str, set[str]] = {}
    if _SST.search(t):
        trouve["sst"] = set()
    if _CACES.search(t):
        trouve["caces"] = {f"R{m}" for m in _CODE_CACES.findall(t)}
    if _AIPR.search(t):
        trouve["aipr"] = set()
    if _ELEC.search(t):
        trouve["habilitation_electrique"] = set()
    if "amiante" in t:
        if _SS3.search(t):
            trouve["amiante_ss3"] = set()
        if _SS4.search(t):
            trouve["amiante_ss4"] = set()
        if not (_SS3.search(t) or _SS4.search(t)) and _FORMATION.search(t):
            trouve["amiante"] = set()
    if _HAUTEUR.search(t) and _FORMATION.search(t):
        trouve["travail_hauteur"] = set()
    q = _QUALIBAT.search(t)
    if q:
        trouve["qualibat"] = set(_CODE_QUALIBAT.findall(q.group(1)))
    if _RGE.search(t):
        trouve["rge"] = set()
    return trouve


@dataclass
class Profil:
    """Ce que l'entreprise a déclaré. ``habilitations`` : lignes de ``memoire_configs.habilitations`` ;
    ``qualifications`` : ``{famille, intitule, organisme, perimetre, numero, date_fin}`` ; ``certifications_equipe`` :
    le texte des certifications de chaque fiche de l'équipe."""
    habilitations: list[dict] = field(default_factory=list)
    qualifications: list[dict] = field(default_factory=list)
    certifications_equipe: list[str] = field(default_factory=list)


def _date(valeur: Any) -> Optional[date]:
    if isinstance(valeur, date):
        return valeur
    try:
        return date.fromisoformat(str(valeur)[:10])
    except ValueError:
        return None


def _nombre(valeur: Any) -> int:
    try:
        return max(int(valeur), 0)
    except (TypeError, ValueError):
        return 0


@dataclass
class _Trouve:
    profil: Optional[str] = None       # ce que le profil déclare, en clair
    valable: bool = False
    fin_passee: Optional[date] = None
    texte: str = ""                    # où chercher les codes cités
    declares: list = field(default_factory=list)   # ce que le profil écrit (intitulés, libellés), pour le détail


def _dans_le_profil(cle: str, profil: Profil, aujourdhui: date) -> _Trouve:
    """Ce que le profil déclare pour une habilitation (type déclaré, qualification, certifications de l'équipe)."""
    r = _Trouve()
    equipe = " ; ".join(c for c in profil.certifications_equipe if c)
    equipe_norm = _norm(equipe)
    types = {"amiante": ("amiante_ss3", "amiante_ss4")}.get(cle, (cle,))
    if cle in ("sst", "caces", "habilitation_electrique", "amiante_ss3", "amiante_ss4", "amiante", "travail_hauteur",
               "aipr"):
        for h in profil.habilitations:
            if not isinstance(h, dict):
                continue
            type_, libelle = str(h.get("type") or ""), str(h.get("libelle") or "")
            if not (type_ in types or (cle == "aipr" and type_ == "autre" and _AIPR.search(_norm(libelle)))):
                continue
            n = _nombre(h.get("nombre"))
            if not n:
                continue
            fin = _date(h.get("valide_jusqu"))
            r.texte += f" {libelle}"
            if libelle.strip():
                r.declares.append(libelle.strip())
            if fin is not None and fin < aujourdhui:
                r.fin_passee = max(r.fin_passee or fin, fin)
                continue
            r.valable = True
            nom = _COURT.get(type_) or libelle or HABILITATIONS[cle][0]
            r.profil = f"{n} personne{'s' if n > 1 else ''} déclarée{'s' if n > 1 else ''} ({nom})"
            break
    if cle in ("qualibat", "rge", "amiante_ss3", "amiante_ss4", "amiante"):
        for q in profil.qualifications:
            texte = " ".join(str(q.get(k) or "") for k in ("intitule", "organisme", "perimetre", "numero"))
            n = _norm(texte)
            if cle == "qualibat" and "qualibat" not in n:
                continue
            if cle == "rge" and q.get("famille") != "rge" and not _RGE.search(n):
                continue
            if cle.startswith("amiante") and ("amiante" not in n or (cle == "amiante_ss3" and not _SS3.search(n))
                                              or (cle == "amiante_ss4" and not _SS4.search(n))):
                continue
            r.texte += f" {texte}"
            r.declares.append(str(q.get("intitule") or "").strip())
            fin = _date(q.get("date_fin"))
            if fin is not None and fin < aujourdhui:
                r.fin_passee = max(r.fin_passee or fin, fin)
                continue
            r.valable = True
            r.profil = r.profil or str(q.get("intitule") or HABILITATIONS[cle][0])
    motifs = {"sst": _SST, "caces": _CACES, "aipr": _AIPR, "habilitation_electrique": _ELEC, "travail_hauteur": re.compile("hauteur"),
              "rge": _RGE, "qualibat": re.compile("qualibat")}
    motif = motifs.get(cle)
    if cle.startswith("amiante"):
        sous = {"amiante_ss3": _SS3, "amiante_ss4": _SS4}.get(cle)
        trouve = "amiante" in equipe_norm and (sous is None or sous.search(equipe_norm))
    else:
        trouve = bool(motif and motif.search(equipe_norm))
    if trouve:
        r.texte += f" {equipe}"
        r.declares.append(equipe.strip())
        if not r.valable:
            r.valable = True
            r.profil = "Dans les certifications de l'équipe"
    return r


def _codes_du_profil(codes: set[str], texte: str) -> set[str]:
    """Les codes cités par le dossier que le profil n'écrit pas (« R490 », « 2112 »)."""
    t = _norm(texte).replace(" ", "")
    return {c for c in codes if c.lower() not in t}


def _fr(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def equipe_face_au_dossier(exigences: Iterable[dict], profil: Profil, aujourdhui: date) -> list[dict]:
    """``exigences`` : ``[{id, texte, source}]`` (source ``{type: "exigence", id, document, page}``), dans l'ordre du
    dossier. Rend ``[{cle, libelle, sigle, statut, etat, profil, detail, sources, lien}]``, une ligne par habilitation
    citée, dans l'ordre de sa première citation."""
    citees: dict[str, dict] = {}
    for e in exigences:
        source = e.get("source")
        if not isinstance(source, dict):
            continue                      # une ligne sans source ne se montre pas
        for cle, codes in habilitations_citees(e.get("texte") or "").items():
            bloc = citees.setdefault(cle, {"codes": set(), "sources": []})
            bloc["codes"] |= codes
            texte = " ".join(str(e.get("texte") or "").split())
            bloc["sources"].append({**source, "extrait": texte if len(texte) <= _EXTRAIT
                                    else texte[:_EXTRAIT].rsplit(" ", 1)[0] + " …"})
    lignes: list[dict] = []
    for cle, bloc in citees.items():
        libelle, sigle, lien = HABILITATIONS[cle]
        trouve = _dans_le_profil(cle, profil, aujourdhui)
        manque = _codes_du_profil(bloc["codes"], trouve.texte) if trouve.valable else set()
        detail = None
        if trouve.valable and not manque:
            statut = DANS_PROFIL
        else:
            statut = A_CONFIRMER
            if manque:
                cites = ", ".join(sorted(manque))
                declares = ", ".join(d for d in trouve.declares if d) or trouve.profil
                detail = f"Le dossier cite {cites} ; votre profil indique : {declares}."
            elif trouve.fin_passee:
                detail = f"Date de validité passée dans votre profil : {_fr(trouve.fin_passee)}."
        lignes.append({
            "cle": cle, "libelle": libelle, "sigle": sigle, "statut": statut, "etat": _ETATS[statut],
            "profil": trouve.profil if trouve.valable else None, "detail": detail,
            "codes": sorted(bloc["codes"]), "sources": bloc["sources"], "lien": lien,
        })
    return lignes


def resume(lignes: list[dict]) -> dict:
    dans = sum(1 for l in lignes if l["statut"] == DANS_PROFIL)
    return {"lignes": lignes, "dans_profil": dans, "a_confirmer": len(lignes) - dans}
