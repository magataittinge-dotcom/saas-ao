"""Les appels d'IA des fonctions C1 à C4 (éteintes par défaut : services/fonctions_ia.py), À CÔTÉ du pipeline.

Aucun prompt ni aucun appel existant n'est touché : chaque fonction a son prompt (prompts_fonctions_c.py), son appel
isolé (`_appeler`, remplacé par un modèle simulé dans les tests) et sa validation de sortie. Pièges respectés
(CLAUDE.md) : appel du SDK dans `asyncio.to_thread` (WSL2), jamais de `temperature`, réflexion de Sonnet 5.x coupée par
`between_tools` (comme la génération), prompt système stable en tête (préfixe du cache), jetons inscrits par
`ligne_jetons` (journal) et collectés pour `couts_ia` par la route. Rien n'est écrit en base ici.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Optional

from services.ai import prompts_fonctions_c as P

HAIKU = "claude-haiku-4-5-20251001"
_ACCOLADES = re.compile(r"\{.*\}", re.DOTALL)
_PREAMBULE = re.compile(r"^\s*(voici|bien s[uû]r|je propose|proposition\s*:|paragraphe\s*:)", re.IGNORECASE)


class SortieIllisible(ValueError):
    """La réponse du modèle n'a pas la forme attendue : rien n'est montré, rien n'est décompté."""


def modele_sonnet() -> str:
    """C1 et C2 : le modèle de la génération du mémoire (et de la réécriture d'aujourd'hui), `MEMOIRE_MODELE` le force."""
    from services.ai.passage_rewriter import modele_de_reecriture
    return modele_de_reecriture()


def _appeler(modele: str, systeme: str, message: str, max_tokens: int, etape: str) -> str:
    """UN appel synchrone au fournisseur (à envelopper dans `asyncio.to_thread`). Isolé pour les tests."""
    import anthropic
    from config import get_settings
    from services.jetons import ligne_jetons

    extra = ({"extra_body": {"thinking": {"type": "between_tools"}}} if modele.startswith("claude-sonnet-5") else {})
    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY, timeout=120.0)
    reponse = client.messages.create(
        model=modele, max_tokens=max_tokens, system=systeme,
        messages=[{"role": "user", "content": message}], **extra,
    )
    print(ligne_jetons(etape, modele, getattr(reponse, "usage", None)), flush=True)
    return "".join(b.text for b in reponse.content if hasattr(b, "text")).strip()


def _coupe(texte: Any, n: int) -> str:
    texte = re.sub(r"\s+", " ", str(texte or "")).strip()
    return texte if len(texte) <= n else texte[: n - 1].rstrip() + "…"


def _json(brut: str) -> dict:
    m = _ACCOLADES.search(brut or "")
    if not m:
        raise SortieIllisible("aucun objet JSON")
    try:
        donnees = json.loads(m.group(0))
    except ValueError as e:
        raise SortieIllisible("JSON illisible") from e
    if not isinstance(donnees, dict):
        raise SortieIllisible("objet attendu")
    return donnees


# ── Le profil de l'entreprise, en court (C1, C3) ───────────────────────────────────────────────────────────────────
# Jamais de montant (frontière du chiffrage) ni de nom de personne (des comptes seulement) : le modèle n'en a pas besoin.

_CHAMPS_CFG = (
    ("activites", "Activités"), ("zone_intervention", "Zone d'intervention"), ("demarche_qualite", "Démarche qualité"),
    ("gestion_securite", "Sécurité"), ("traitement_dechets", "Déchets"),
    ("mesures_environnementales", "Environnement"), ("procedure_demarrage", "Démarrage de chantier"),
    ("sav_garantie", "Garanties et SAV"), ("moyens_informatiques", "Moyens informatiques"),
)


def profil_court(db, org_id: str, maximum: int = 3000) -> str:
    """Ce que « Mon entreprise » dit, en lignes « Rubrique : valeur », 3 000 caractères au plus. Vide = rien de renseigné."""
    from models.memoire_config import MemoireConfig
    from models.organization import Organization
    from models.qualification import Qualification
    from models.reference import Reference
    from services.raison_sociale import nom_entreprise_effectif

    org = db.query(Organization).filter(Organization.id == org_id).first()
    cfg = db.query(MemoireConfig).filter(MemoireConfig.organization_id == org_id).first()
    lignes: list[str] = []
    nom = nom_entreprise_effectif(org, db) if org else ""
    if nom:
        lignes.append(f"Entreprise : {_coupe(nom, 120)}")
    if org is not None and org.presentation:
        lignes.append(f"Présentation : {_coupe(org.presentation, 500)}")
    for champ, libelle in _CHAMPS_CFG:
        valeur = getattr(cfg, champ, None) if cfg is not None else None
        if isinstance(valeur, str) and valeur.strip():
            lignes.append(f"{libelle} : {_coupe(valeur, 400)}")
    effectifs = [e for e in (getattr(cfg, "effectifs_par_categorie", None) or []) if isinstance(e, dict)]
    total = sum(int(e.get("effectif") or 0) for e in effectifs if str(e.get("effectif") or "0").isdigit())
    if total:
        lignes.append(f"Effectif : {total} personnes")
    materiel = [m for m in (getattr(cfg, "materiel_liste", None) or []) if isinstance(m, dict) and m.get("designation")]
    if materiel:
        lignes.append("Matériel : " + _coupe("; ".join(
            f"{m.get('quantite') or 1} × {m['designation']}" for m in materiel[:15]), 500))
    quals = db.query(Qualification).filter(Qualification.organization_id == org_id).limit(10).all()
    if quals:
        lignes.append("Qualifications : " + _coupe("; ".join(q.intitule for q in quals), 400))
    refs = (db.query(Reference).filter(Reference.organization_id == org_id, Reference.is_reference == True,  # noqa: E712
                                       Reference.deleted_at.is_(None)).limit(8).all())
    if refs:
        lignes.append("Références : " + _coupe("; ".join(
            r.intitule + (f" ({r.annee})" if r.annee else "") for r in refs), 600))
    texte = "\n".join(lignes)
    return texte if len(texte) <= maximum else texte[: maximum - 1].rstrip() + "…"


# ── C1 — « Proposer un paragraphe » ────────────────────────────────────────────────────────────────────────────────

PARAGRAPHE_MAX_CARACTERES = 1600     # ~180 mots et sa marge ; au-delà, la sortie n'a pas la forme attendue
PARAGRAPHE_MAX_JETONS = 700


def message_paragraphe(sous_critere: str, critere: Optional[str], section: str, exigences: list[str],
                       profil: str, consigne_dtu: str) -> str:
    """Le message de C1. L'ordre est fixe ; tout est borné (≈ 4 000 jetons d'entrée au plus avec le prompt)."""
    parties = [f"SOUS-CRITÈRE À COUVRIR : {_coupe(sous_critere, 300)}"]
    if critere:
        parties.append(f"CRITÈRE : {_coupe(critere, 200)}")
    parties.append("PROFIL DE L'ENTREPRISE :\n" + (profil or "(rien de renseigné)"))
    if exigences:
        parties.append("EXIGENCES DU DOSSIER :\n" + "\n".join(f"- {_coupe(e, 300)}" for e in exigences[:12]))
    if section:
        parties.append("PARTIE DU MÉMOIRE OÙ LE PARAGRAPHE IRA (pour le ton, à ne pas répéter) :\n" + _coupe(section, 2500))
    if consigne_dtu:
        parties.append(consigne_dtu)
    return "\n\n".join(parties)


def valider_paragraphe(brut: str) -> str:
    """Un seul paragraphe de texte : ni titre, ni liste, ni préambule, ni JSON, borné en longueur."""
    texte = (brut or "").strip().strip("«»\"“”").strip()
    if not texte or len(texte) > PARAGRAPHE_MAX_CARACTERES:
        raise SortieIllisible("longueur")
    if texte.startswith(("{", "[")) or _PREAMBULE.match(texte):
        raise SortieIllisible("texte hors du format")
    for ligne in texte.splitlines():
        if re.match(r"^\s*(#|[-*•]\s|\d+[.)]\s)", ligne):
            raise SortieIllisible("titre ou liste")
    return re.sub(r"\s*\n\s*\n\s*", " ", texte)   # un paragraphe : les sauts de paragraphe deviennent des espaces


async def proposer_paragraphe(message: str, regle) -> str:
    """C1 : l'appel (thread), la validation, puis le garde-fou DTU de la génération sur la sortie."""
    brut = await asyncio.to_thread(_appeler, modele_sonnet(), P.PROPOSER_PARAGRAPHE_SYSTEM, message,
                                   PARAGRAPHE_MAX_JETONS, "proposer_paragraphe")
    texte = valider_paragraphe(brut)
    texte, _retires = regle.garde_texte(texte)
    return texte


# ── C2 — la réécriture d'un passage en trois propositions ──────────────────────────────────────────────────────────

NB_PROPOSITIONS = 3


def message_trois(passage: str, action: str, instruction: Optional[str], consigne_dtu: str) -> str:
    """Le message de C2 : la consigne du geste d'aujourd'hui (lue, jamais modifiée), la liste des DTU, le passage."""
    from services.ai.passage_rewriter import ACTIONS
    consigne = ACTIONS[action]
    if action == "insister":
        consigne = consigne.format(instruction=instruction)
    parties = [f"CONSIGNE : {consigne}"]
    if consigne_dtu:
        parties.append(consigne_dtu)
    parties.append(f"PASSAGE :\n{passage}")
    return "\n\n".join(parties)


def max_jetons_trois(passage: str) -> int:
    """Trois réécritures d'un passage : environ trois fois sa longueur en jetons, bornée."""
    return max(1500, min(len(passage) * 2, 12000))


def valider_trois(brut: str, passage: str) -> list[str]:
    """{"propositions": [trois textes]} : trois chaînes non vides, chacune bornée par la longueur du passage ; les
    doublons sont retirés et il en faut au moins deux distinctes. Rien d'autre n'est accepté."""
    donnees = _json(brut)
    if set(donnees) != {"propositions"}:
        raise SortieIllisible("clés inattendues")
    liste = donnees["propositions"]
    if not isinstance(liste, list) or len(liste) != NB_PROPOSITIONS or not all(isinstance(t, str) for t in liste):
        raise SortieIllisible("trois textes attendus")
    plafond = max(1200, len(passage) * 3)
    propres: list[str] = []
    for texte in liste:
        texte = texte.strip()
        if not texte or len(texte) > plafond:
            raise SortieIllisible("longueur")
        if texte not in propres:
            propres.append(texte)
    if len(propres) < 2:
        raise SortieIllisible("propositions identiques")
    return propres


async def reecrire_trois(passage: str, action: str, instruction: Optional[str], regle) -> list[str]:
    """C2 : l'appel (thread), la validation, puis le garde-fou DTU de la génération sur chaque proposition."""
    message = message_trois(passage, action, instruction, regle.consigne())
    brut = await asyncio.to_thread(_appeler, modele_sonnet(), P.REECRIRE_TROIS_SYSTEM, message,
                                   max_jetons_trois(passage), "reecrire_trois")
    return [regle.garde_texte(t)[0] for t in valider_trois(brut, passage)]


# ── C3 — « Ce que vous voulez dire » de chaque fiche du plan, proposé par Haiku 4.5 ────────────────────────────────

FICHE_MAX_PARTIES = 60          # MAX_PARTIES du plan (services/plan_memoire.py)
FICHE_MAX_CARACTERES = 400       # 300 demandés au modèle, et sa marge ; le champ de la fiche en porte 1 000
FICHE_MAX_JETONS = 2500
FICHE_BUDGET_CARACTERES = 24_000  # exigences comprises (≈ 7 000 jetons) ; chaque partie est nommée quoi qu'il arrive


def message_fiches(parties: list[dict], profil: str) -> str:
    """Le message de C3 : le profil, puis chaque partie gardée (clé, titre, sous-critères), et ses exigences tant que
    le budget de caractères le permet (≈ 9 000 jetons d'entrée au plus avec le prompt et le profil)."""
    blocs: list[list[str]] = []
    for p in parties[:FICHE_MAX_PARTIES]:
        lignes = [f"[{p['cle']}] {_coupe(p.get('titre') or p.get('titre_modele') or '', 140)}"]
        criteres = [s.get("nom") for s in p.get("sous_criteres") or [] if isinstance(s, dict) and s.get("nom")]
        if criteres:
            lignes.append("Sous-critères : " + _coupe("; ".join(criteres), 300))
        blocs.append(lignes)
    taille = sum(len(l) + 1 for b in blocs for l in b)
    for rang in range(6):                         # une exigence par partie, puis une deuxième, etc.
        for p, lignes in zip(parties, blocs):
            exigences = [e for e in (p.get("exigences") or []) if isinstance(e, dict) and e.get("texte")]
            if rang < len(exigences):
                ligne = f"- {_coupe(exigences[rang]['texte'], 280)}"
                if taille + len(ligne) + 1 > FICHE_BUDGET_CARACTERES:
                    break
                lignes.append(ligne)
                taille += len(ligne) + 1
    return "\n\n".join(["PROFIL DE L'ENTREPRISE :\n" + (profil or "(rien de renseigné)"), "PARTIES DU PLAN :"]
                       + ["\n".join(b) for b in blocs])


def valider_fiches(brut: str, cles: set[str]) -> dict[str, str]:
    """{"fiches": [{"cle", "texte"}]} : seules les clés du plan sont gardées, une fois ; un texte vide, trop long, avec
    un point d'exclamation ou qui parle de prix est écarté (jamais montré). Rien d'autre n'est accepté."""
    from services.points_eclaircir import parle_de_prix
    donnees = _json(brut)
    if set(donnees) != {"fiches"} or not isinstance(donnees["fiches"], list):
        raise SortieIllisible("liste de fiches attendue")
    propositions: dict[str, str] = {}
    for f in donnees["fiches"]:
        if not isinstance(f, dict) or set(f) != {"cle", "texte"}:
            raise SortieIllisible("fiche hors du format")
        cle, texte = f["cle"], f["texte"]
        if not isinstance(cle, str) or not isinstance(texte, str):
            raise SortieIllisible("fiche hors du format")
        texte = re.sub(r"\s+", " ", texte).strip()
        if (cle not in cles or cle in propositions or not texte or len(texte) > FICHE_MAX_CARACTERES
                or "!" in texte or parle_de_prix(texte)):
            continue
        propositions[cle] = texte
    return propositions


async def proposer_fiches(parties: list[dict], profil: str) -> dict[str, str]:
    """C3 : un appel Haiku 4.5 pour tout le plan (thread), puis la validation."""
    message = message_fiches(parties, profil)
    brut = await asyncio.to_thread(_appeler, HAIKU, P.FICHE_PROPOSEE_SYSTEM, message, FICHE_MAX_JETONS,
                                   "fiche_proposee")
    return valider_fiches(brut, {p["cle"] for p in parties[:FICHE_MAX_PARTIES]})
