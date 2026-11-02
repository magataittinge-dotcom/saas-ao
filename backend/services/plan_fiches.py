"""La fiche de chaque partie du plan (B2) : ce que le dossier exige, ce que l'entreprise peut mettre en avant.

Tout est déterministe, sans IA, et recalculé à chaque lecture. Trois règles simples, testées :

1. Exigences (RC, CCTP, CCAP déjà lues par l'analyse) : une exigence va à une partie quand elle emploie au moins DEUX
   mots du thème de la partie, ou un mot du thème ET un mot du titre de la partie. Les exigences de candidature
   (pièces administratives) et celles qui parlent de prix ne sont jamais rattachées (frontière chiffrage). Huit au plus.
2. Cases proposées : une référence, une personne, un matériel est PRÉCOCHÉ quand il partage au moins un mot avec le thème
   de la partie ; les parties « humaines » (organigramme, rôles, interlocuteur, effectifs) précochent l'équipe,
   les parties « matériel » le matériel, la partie « Références » les 5 à 8 références les plus proches du lot.
3. Seul ce que le patron a choisi (case cochée ou décochée, ligne libre) part au modèle ; une fiche non touchée n'envoie rien.

Le texte libre n'est jamais une consigne : voir ``bloc_notes`` (délimité, nettoyé).
"""
from __future__ import annotations

import re
from typing import Any

from services.memoire_criteres import _COURANTES, _racines, _racines_precises, _est_prix
from services.plan_memoire import _theme_de

MAX_EXIGENCES = 8
MAX_REFERENCES = 35
MAX_PERSONNES = 20
MAX_MATERIEL = 30
_TEXTE_EXIGENCE = 400

_PARTIES_HUMAINES = frozenset({"partie_a.organigramme", "partie_a.roles_missions", "partie_b.interlocuteur",
                               "partie_c.effectifs"})
_PARTIES_MATERIEL = frozenset({"partie_a.materiel", "partie_c.materiels"})
_PARTIE_REFERENCES = "partie_a.references"


# ── Exigences ─────────────────────────────────────────────────────────────────

def exigences_par_partie(plan: list[dict], exigences: list[dict]) -> dict[str, list[dict]]:
    """``exigences`` : ``[{"id", "texte", "categorie", "source"}]``. Rend ``{cle de partie: [exigence…]}`` (gardées seulement)."""
    candidates = []
    for e in exigences:
        texte = (e.get("texte") or "").strip()
        if not texte or e.get("categorie") == "candidature" or _est_prix(texte):
            continue
        candidates.append((e, _racines(texte)))
    sortie: dict[str, list[dict]] = {}
    for p in plan:
        if p.get("retiree"):
            continue
        theme = _theme_de(p["cle"], p["titre"]) - _COURANTES
        titre = _racines_precises(p["titre"])
        notes = []
        for rang, (e, racines) in enumerate(candidates):
            communs = racines & theme
            if len(communs) >= 2 or (communs and racines & titre):
                notes.append((-len(communs), rang, e))
        notes.sort(key=lambda n: (n[0], n[1]))
        sortie[p["cle"]] = [{"id": e.get("id"), "texte": e["texte"].strip()[:_TEXTE_EXIGENCE], "source": e.get("source")}
                            for _s, _r, e in notes[:MAX_EXIGENCES]]
    return sortie


# ── Cases proposées ───────────────────────────────────────────────────────────

def _chevauchement(texte: str, theme: frozenset[str]) -> int:
    return len(_racines(texte) & theme)


def _references(cle: str, theme: frozenset[str], references: list[Any], lot: frozenset[str]) -> list[dict]:
    notees = []
    for r in references:
        texte = " ".join(str(x) for x in (r.intitule, getattr(r, "lot", None), getattr(r, "description", None)) if x)
        racines = _racines(texte)
        notees.append((len(racines & theme) * 2 + len(racines & lot), r.annee or 0, r, len(racines & theme)))
    notees.sort(key=lambda n: (-n[0], -n[1]))
    if cle == _PARTIE_REFERENCES:
        gardees = notees[:MAX_REFERENCES]
        precoches = min(8, max(5, len(gardees))) if gardees else 0
        return [_ligne_reference(r, i < precoches) for i, (_s, _a, r, _t) in enumerate(gardees)]
    return [_ligne_reference(r, True) for _s, _a, r, du_theme in notees[:8] if du_theme > 0]   # le thème de la partie décide


def _ligne_reference(r: Any, coche: bool) -> dict:
    detail = " · ".join(str(x) for x in (r.maitre_ouvrage, r.annee) if x)
    return {"id": r.id, "libelle": r.intitule, "detail": detail or None, "coche": coche}


def _personnes(cle: str, theme: frozenset[str], equipe: list[Any]) -> list[dict]:
    lignes = []
    for m in equipe:
        texte = " ".join(str(x) for x in (m.role, getattr(m, "specialite", None), getattr(m, "certifications", None),
                                          getattr(m, "experience_resume", None)) if x)
        if cle in _PARTIES_HUMAINES or _chevauchement(texte, theme) > 0:
            lignes.append({"id": m.id, "libelle": m.name, "detail": m.role, "coche": True})
    return lignes[:MAX_PERSONNES]


def _materiel(cle: str, theme: frozenset[str], materiel: list[dict]) -> list[dict]:
    lignes = []
    for ligne in materiel:
        designation = str(ligne.get("designation") or "").strip()
        if not designation:
            continue
        texte = f"{designation} {ligne.get('famille') or ''}"
        if cle in _PARTIES_MATERIEL or _chevauchement(texte, theme) > 0:
            quantite = ligne.get("quantite")
            detail = f"{quantite} {ligne.get('unite') or ''}".strip() if quantite not in (None, "") else None
            lignes.append({"id": designation[:160], "libelle": designation, "detail": detail, "coche": True})
    return lignes[:MAX_MATERIEL]


def propositions(plan: list[dict], references: list[Any], equipe: list[Any], materiel: list[dict],
                 nom_du_lot: str | None) -> dict[str, dict]:
    """Les cases proposées pour chaque partie gardée : ``{cle: {references, personnes, materiel}}`` (précochées par pertinence)."""
    lot = _racines_precises(nom_du_lot or "")
    sortie = {}
    for p in plan:
        if p.get("retiree"):
            continue
        theme = _theme_de(p["cle"], p["titre"]) - _COURANTES
        sortie[p["cle"]] = {
            "references": _references(p["cle"], theme, references, lot),
            "personnes": _personnes(p["cle"], theme, equipe),
            "materiel": _materiel(p["cle"], theme, materiel),
        }
    return sortie


# ── Vers le générateur ────────────────────────────────────────────────────────

from services.texte_libre import texte_libre_propre  # noqa: E402,F401  (réexporté)


def lignes_de_la_fiche(fiche: dict | None, references: dict[str, Any], equipe: dict[str, Any],
                       materiel: set[str]) -> list[str]:
    """Les choix du patron pour une partie, en lignes de texte. ``references`` / ``equipe`` : seulement les objets de
    SON organisation, indexés par id (un id étranger est ignoré). Fiche non touchée : liste vide."""
    f = fiche or {}
    lignes = []
    refs = [references[i] for i in (f.get("references") or []) if i in references]
    if refs:
        lignes.append("Références à mettre en avant : " + " ; ".join(
            f"{r.intitule}" + (f" ({', '.join(str(x) for x in (r.maitre_ouvrage, r.annee) if x)})" if (r.maitre_ouvrage or r.annee) else "")
            for r in refs))
    gens = [equipe[i] for i in (f.get("personnes") or []) if i in equipe]
    if gens:
        lignes.append("Personnes à présenter : " + " ; ".join(f"{m.name} ({m.role})" for m in gens))
    mats = [m for m in (f.get("materiel") or []) if m in materiel]
    if mats:
        lignes.append("Matériel à citer : " + " ; ".join(mats))
    return lignes


def pour_generation(plan: list[dict], rattachement: dict, references: dict[str, Any], equipe: dict[str, Any],
                    materiel: set[str]) -> list[dict]:
    """Le plan validé tel que le générateur le lit : les parties GARDÉES, dans l'ordre, avec titre, sous-critères servis
    (hors prix, par le thème), lignes de la fiche et ligne libre. ``rattachement`` : ``rattacher_criteres(plan, …)``."""
    sortie = []
    for p in plan:
        if p.get("retiree"):
            continue
        fiche = p.get("fiche") or {}
        sortie.append({
            "partie": p["partie"], "sous_cle": p["cle"].split(".", 1)[1], "titre": p["titre"],
            "ajout": ".ajout_" in p["cle"],
            "criteres": [{"nom": s["nom"], "poids": s["poids"]} for s in rattachement["par_partie"].get(p["cle"], [])],
            "lignes": lignes_de_la_fiche(fiche, references, equipe, materiel),
            "voulu": texte_libre_propre(fiche.get("voulu")),
        })
    return sortie
