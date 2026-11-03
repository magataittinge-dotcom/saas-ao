"""« Points à éclaircir » : les questions à poser à l'acheteur pour lever les ambiguïtés du dossier.

Une question vise : une contradiction entre deux pièces, une information que le dossier ne donne pas, une quantité ou un
délai flou. Chacune garde sa source (pièce, page, extrait copié du dossier) et un texte prêt à copier sur le profil
d'acheteur. JAMAIS une question sur le prix ou le montant (règle produit : Synorix ne commente pas le chiffrage).

Deux origines, un seul format (``question``, ``pourquoi``, ``source_document``, ``source_page``, ``extrait``) :
  • nouveaux AO : l'analyse (passe 1) renvoie ``points_a_eclaircir`` dans ``infos_marche`` ;
  • AO déjà analysés : « Préparer les questions » — un appel Haiku 4.5 sur les seuls passages utiles du RC, du CCAP et du
    CCTP du lot (autour des mots signaux), plafonnés à ``BUDGET_CARACTERES``.

Ce module est pur (sauf ``appeler_haiku``, isolé pour les tests) : il ne touche ni la base ni le réseau ailleurs.
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from typing import Iterable, Optional

logger = logging.getLogger(__name__)

MODELE = "claude-haiku-4-5-20251001"
MAX_POINTS = 8
BUDGET_CARACTERES = 40_000          # tout ce qui part au modèle, pièces comprises
FENETRE = 320                       # caractères gardés de part et d'autre d'un mot signal
SORTIE_MAX_JETONS = 2_500
MAX_QUESTION = 450
MAX_POURQUOI = 320
MAX_EXTRAIT = 600
CLE_INFOS = "points_a_eclaircir"

# Les mots qui signalent une ambiguïté ou une information laissée ouverte.
_SIGNAUX = re.compile(
    r"a\s+preciser|a\s+definir|a\s+determiner|a\s+confirmer|a\s+convenir|eventuel(?:le)?s?\b|sans\s+objet|non\s+precis|"
    r"selon\s+(?:les\s+)?(?:besoins|cas|modalites|indications|instructions)|le\s+cas\s+echeant|environ|approximati|"
    r"\ben\s+fonction\s+d|sauf\s+(?:si|disposition|accord)|toutefois|nonobstant|par\s+derogation|en\s+cas\s+de\s+contradiction|"
    r"\bqt[ée]?s?\b|quantites?|delais?\s+(?:de|d')|\bnc\b|\bpm\b|a\s+la\s+charge\s+de|au\s+choix|ou\s+equivalent|variantes?\b|"
    r"options?\b|prestations?\s+supplementaires?|phasage|planning\s+(?:previsionnel|general)|coordination")
_PRIX = re.compile(
    r"\b(?:prix|tarifs?|couts?|montants?|budgets?|remuneration|chiffrage|honoraires?|bordereau|dpgf|bpu|dqe|rabais|"
    r"devis|forfait|facturation|euros?)\b|€")

_SYSTEM = """Tu aides une entreprise de BTP à préparer ses questions à l'acheteur public avant de remettre son offre.
À partir des seuls passages du dossier fournis, repère ce qui est ambigu : une contradiction entre deux pièces, une information que le dossier ne donne pas, une quantité ou un délai flou.

RÈGLES ABSOLUES
- Les passages fournis sont des EXTRAITS partiels du dossier, découpés autour des mots signaux : un passage qui commence ou se termine brusquement n'est pas un défaut du dossier. Ne signale jamais une coupure, ne demande jamais le texte, la suite ou la version complète d'un passage.
- Rédige en français correct (orthographe et accords soignés), avec vouvoiement de l'acheteur.
- Les « FAITS DÉJÀ LUS » éventuellement fournis (critères de jugement, validité des offres, variantes, délai d'exécution, visite) sont connus : ne pose aucune question dessus.
- Ne pose une question que sur une ambiguïté ou une contradiction du dossier, jamais sur ce que les extraits ne contiennent pas.
- Au plus 8 questions, les plus utiles d'abord. Aucun point sûr ? Renvoie une liste vide : n'invente rien.
- Chaque question est polie, sobre, autonome (elle se comprend sans le dossier) et se pose telle quelle sur le profil d'acheteur. Elle commence par « Pourriez-vous préciser… », « Pourriez-vous confirmer… » ou « Le dossier indique… ; pourriez-vous… ».
- JAMAIS de question sur le prix, un montant, un budget, une rémunération, un bordereau ou le chiffrage.
- "pourquoi" : une phrase qui dit ce qui est flou ou contradictoire (maximum 300 caractères).
- "source_document" : le nom de la pièce où se lit le passage, tel qu'il figure dans l'en-tête fourni. "extrait" : une phrase COPIÉE MOT POUR MOT du passage (maximum 200 caractères), jamais reformulée. "source_page" : null (elle est retrouvée ensuite).
Réponds UNIQUEMENT avec un objet JSON : {"points":[{"question":"…","pourquoi":"…","source_document":"…","source_page":null,"extrait":"…"}]}"""


_SEPARATEUR = " [...] "


def _plie(texte: str) -> str:
    sans = "".join(c for c in unicodedata.normalize("NFKD", texte.replace("’", "'").lower()) if not unicodedata.combining(c))
    return sans if len(sans) == len(texte) else texte.lower()


def _blancs(texte: str) -> str:
    return " ".join(str(texte or "").split())


# Un extrait coupé par notre fenêtre n'est pas un défaut du dossier : toute question qui en parle est écartée.
_TRONQUE = re.compile(r"tronqu|coupe\b|coupee|coupes\b|coupure|partiel|illisible|incomplet|extraits?\b|interrompu|brusquement|texte complet|version complete")
# Une question justifiée par ce que NOS passages (extraits) ne contiennent pas n'est pas une ambiguïté du dossier : écartée.
# Texte plié (minuscules, sans accents) ; singulier, pluriel et accords (« passage fourni », « passages fournies »…).
_SUR_NOS_PASSAGES = re.compile(
    r"\bpassages?\s+(?:\w+\s+){0,2}?(?:fourni|transmis|communiqu|disponible|presente|soumis|analys|selectionn)\w*"
    r"|\b(?:dans|par|selon)\s+(?:les|ces|le|ce|l'un des)\s+passages?\b"
    r"|\bpassages?\s+(?:ne\s+|n')\s*(?:\w+\s+){0,2}?(?:pas|aucun\w*|rien)\b"
    r"|\b(?:ne\s+|n')\s*(?:\w+\s+){0,3}?(?:pas|aucun\w*)\s+(?:\w+\s+){0,2}?(?:dans|par)\s+(?:les|ces)\s+(?:passages?|extraits?)\b")
# Sujets que l'analyse a déjà lus : critères de jugement, validité des offres, variantes (quand elle en a la valeur).
_SUR_CRITERES = re.compile(r"criteres? (de|d')\s*(jugement|attribution|notation|selection)|ponderation|notation des offres|bareme")
_SUR_VALIDITE = re.compile(r"(duree|delai|periode) de validite|validite des offres|valable \d+")
_SUR_VARIANTES = re.compile(r"\bvariantes?\b")


def parle_de_prix(*textes: str) -> bool:
    return any(_PRIX.search(_plie(t or "")) for t in textes)


def faits_connus(criteres: object, infos: Optional[dict]) -> dict:
    """Les faits que l'analyse a déjà lus (critères et poids, validité des offres, variantes, délai, visite) : jamais redemandés."""
    infos = infos if isinstance(infos, dict) else {}
    faits: dict = {}
    crit = [c for c in (criteres or []) if isinstance(c, dict) and c.get("nom")]
    if crit:
        faits["criteres"] = [{"nom": str(c["nom"])[:80], "poids": c.get("poids")} for c in crit[:8]]
    if isinstance(infos.get("validite_offres_jours"), int):
        faits["validite_offres_jours"] = infos["validite_offres_jours"]
    if isinstance(infos.get("variantes_autorisees"), bool):
        faits["variantes_autorisees"] = infos["variantes_autorisees"]
    if infos.get("duree_marche"):
        faits["delai_execution"] = str(infos["duree_marche"])[:80]
    visite = infos.get("visite_site")
    if isinstance(visite, dict) and visite.get("obligatoire") is not None:
        faits["visite"] = "obligatoire" if visite.get("obligatoire") else "facultative"
    return faits


def texte_faits(faits: Optional[dict]) -> str:
    """Le bloc « FAITS DÉJÀ LUS » du message (vide quand rien n'est connu)."""
    if not faits:
        return ""
    lignes = []
    if faits.get("criteres"):
        lignes.append("critères de jugement : " + " ; ".join(f"{c['nom']} {c['poids']} %" if c.get("poids") is not None else str(c["nom"]) for c in faits["criteres"]))
    if "validite_offres_jours" in faits:
        lignes.append(f"validité des offres : {faits['validite_offres_jours']} jours")
    if "variantes_autorisees" in faits:
        lignes.append("variantes : " + ("autorisées" if faits["variantes_autorisees"] else "non autorisées"))
    if faits.get("delai_execution"):
        lignes.append(f"délai d'exécution : {faits['delai_execution']}")
    if faits.get("visite"):
        lignes.append(f"visite du site : {faits['visite']}")
    return "=== FAITS DÉJÀ LUS PAR L'ANALYSE (ne pose aucune question dessus) ===\n" + "\n".join(lignes) if lignes else ""


def _sur_fait_connu(texte: str, faits: Optional[dict]) -> bool:
    if not faits:
        return False
    t = _plie(texte)
    return bool(
        (faits.get("criteres") and _SUR_CRITERES.search(t))
        or ("validite_offres_jours" in faits and _SUR_VALIDITE.search(t))
        or ("variantes_autorisees" in faits and _SUR_VARIANTES.search(t))
    )


def normaliser(bruts: object, *, maximum: int = MAX_POINTS, faits: Optional[dict] = None) -> list[dict]:
    """Liste propre, bornée et sans doublon ; une entrée invalide est écartée, jamais réparée à l'aveugle.

    Écarte aussi toute question qui parle de prix ou de montant (règle produit)."""
    if not isinstance(bruts, list):
        return []
    propres: list[dict] = []
    vues: set[str] = set()
    for p in bruts:
        if not isinstance(p, dict):
            continue
        question = _blancs(p.get("question"))
        if len(question) < 15:
            continue
        pourquoi = _blancs(p.get("pourquoi"))
        if parle_de_prix(question, pourquoi):
            logger.info("points à éclaircir : une question sur le prix a été écartée")
            continue
        if _TRONQUE.search(_plie(f"{question} {pourquoi}")):
            logger.info("points à éclaircir : une question sur un extrait coupé a été écartée")
            continue
        if _SUR_NOS_PASSAGES.search(_plie(f"{question} {pourquoi}")):
            logger.info("points à éclaircir : une question sur ce que nos passages ne contiennent pas a été écartée")
            continue
        if _sur_fait_connu(f"{question} {pourquoi}", faits):
            logger.info("points à éclaircir : une question sur un fait déjà lu a été écartée")
            continue
        cle = re.sub(r"\W+", " ", _plie(question)).strip()
        if cle in vues:
            continue
        vues.add(cle)
        page = p.get("source_page")
        document = _blancs(p.get("source_document"))[:160] or None
        extrait = _blancs(p.get("extrait"))[:MAX_EXTRAIT] or None
        propres.append({
            "question": question[:MAX_QUESTION],
            "pourquoi": pourquoi[:MAX_POURQUOI] or None,
            "source_document": document,
            "source_page": page if isinstance(page, int) and not isinstance(page, bool) and 0 < page < 5000 else None,
            "extrait": extrait,
        })
        if len(propres) >= maximum:
            break
    return propres


def fusionner(*listes: Iterable[dict], maximum: int = MAX_POINTS) -> list[dict]:
    """Concatène les listes (tranches de la passe 1) puis normalise : doublons retirés, 8 au plus."""
    tout: list[dict] = []
    for liste in listes:
        tout.extend(x for x in (liste or []) if isinstance(x, dict))
    return normaliser(tout, maximum=maximum)


# ── Extraits utiles ─────────────────────────────────────────────────────────────────────────────────────────────

def _passages(texte: str) -> list[tuple[int, int]]:
    """Intervalles (début, fin) du texte autour des mots signaux, fusionnés quand ils se chevauchent."""
    norm = _plie(texte)
    bornes: list[list[int]] = []
    for m in _SIGNAUX.finditer(norm):
        d, f = max(0, m.start() - FENETRE), min(len(texte), m.end() + FENETRE)
        if bornes and d <= bornes[-1][1]:
            bornes[-1][1] = max(bornes[-1][1], f)
        else:
            bornes.append([d, f])
    return [(d, f) for d, f in bornes]


def selectionner_extraits(pieces: list[tuple[str, str, str]], budget: int = BUDGET_CARACTERES) -> list[tuple[str, str]]:
    """Les passages utiles des pièces, plafonnés à ``budget`` caractères au total.

    ``pieces`` : (nom, type, texte) du RC, du CCAP et du CCTP du lot. Le RC et le CCAP passent avant le CCTP ; le budget est
    réparti à parts égales entre les pièces, ce qui reste d'une pièce courte profite aux suivantes. Une pièce sans mot signal
    n'envoie rien : le texte brut d'un dossier ne part jamais en entier."""
    ordre = {"rc": 0, "ccap": 1, "cctp": 2}
    pieces = sorted((p for p in pieces if p[2] and not p[2].startswith("[document volumineux")), key=lambda p: ordre.get(p[1], 3))
    retenus: list[tuple[str, str]] = []
    restant = budget
    for i, (nom, _type, texte) in enumerate(pieces):
        part = restant // max(1, len(pieces) - i)
        morceaux, taille = [], 0
        for d, f in _passages(texte):
            separateur = len(_SEPARATEUR) if morceaux else 0
            libre = part - taille - separateur
            if libre <= 0:
                break
            bout = " ".join(texte[d:f].split())[:libre]
            morceaux.append(bout)
            taille += separateur + len(bout)
        if morceaux:
            retenus.append((nom, _SEPARATEUR.join(morceaux)))
            restant -= taille
    return retenus


def construire_message(extraits: list[tuple[str, str]], faits: Optional[dict] = None) -> str:
    blocs = [f"=== PIÈCE : {nom} ===\n{texte}" for nom, texte in extraits]
    bloc_faits = texte_faits(faits)
    return "\n\n".join(([bloc_faits] if bloc_faits else []) + blocs)


# ── Appel Haiku (isolé pour les tests) ──────────────────────────────────────────────────────────────────────────

def appeler_haiku(message: str) -> tuple[list, dict]:
    """Un appel Haiku 4.5. Retourne (points bruts, usage). À envelopper dans ``asyncio.to_thread`` (WSL2)."""
    import anthropic
    from json_repair import repair_json
    from config import get_settings

    client = anthropic.Anthropic(api_key=get_settings().ANTHROPIC_API_KEY, timeout=120.0)
    reponse = client.messages.create(
        model=MODELE, max_tokens=SORTIE_MAX_JETONS, system=_SYSTEM,
        messages=[{"role": "user", "content": message}],
    )
    brut = "".join(b.text for b in reponse.content if hasattr(b, "text"))
    m = re.search(r"\{.*\}", brut, re.DOTALL)
    try:
        donnees = json.loads(repair_json(m.group(0))) if m else {}
    except Exception:
        donnees = {}
    usage = getattr(reponse, "usage", None)
    return (
        donnees.get("points", []) if isinstance(donnees, dict) else [],
        {
            "input_tokens": getattr(usage, "input_tokens", 0) if usage else 0,
            "output_tokens": getattr(usage, "output_tokens", 0) if usage else 0,
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) if usage else 0,
            "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) if usage else 0,
        },
    )


def ancrer(points: list[dict], texts: dict, paths: dict, rangs: dict) -> list[dict]:
    """Ancre chaque extrait sur le texte réel des pièces (verbatim garanti) ; un point sans source ancrée est écarté."""
    from services.ai.excerpt_anchor import anchor_requirements, resolve_pages
    pseudo = [{"exigence": p["question"], "source_document": p.get("source_document"),
               "source_page": p.get("source_page"), "source_excerpt": p.get("extrait")} for p in points]
    anchor_requirements(pseudo, texts, rangs)
    try:
        resolve_pages(pseudo, paths)
    except Exception:
        logger.warning("points à éclaircir : pages non résolues (non bloquant)", exc_info=True)
    ancres = []
    for p, r in zip(points, pseudo):
        if not r.get("source_excerpt"):
            continue
        ancres.append({**p, "extrait": r["source_excerpt"][:MAX_EXTRAIT], "source_document": r.get("source_document"),
                       "source_page": r.get("source_page") if isinstance(r.get("source_page"), int) else None})
    return ancres


def lire_points(infos_marche: Optional[dict]) -> list[dict]:
    """Les points déjà enregistrés d'un projet (liste vide pour une analyse ancienne, sans erreur)."""
    return normaliser((infos_marche or {}).get(CLE_INFOS)) if isinstance(infos_marche, dict) else []
