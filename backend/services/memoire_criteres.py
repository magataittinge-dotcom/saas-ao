"""Rattachement des sous-critères du RC aux parties du mémoire (E1) — déterministe, sans IA.

Le patron voit, pour chaque partie du mémoire, le ou les sous-critères de notation qu'elle traite (avec leur
poids), et ceux qu'aucune partie ne traite encore : « À couvrir ». Le calcul est un simple recoupement de mots :

1. une table de mots par sous-section (`_THEMES`) dit de quoi parle chaque partie ;
2. un sous-critère est rattaché à une partie quand l'un de ses mots est dans la table de cette partie ET que le
   texte rédigé de cette partie le confirme (le mot lui-même, ou au moins deux mots de la table : la partie
   parle bien de son thème) ; à défaut de table, quand les mots du sous-critère se retrouvent dans le texte
   (`_couvre_par_le_texte`).

Normalisation : accents, casse, ligatures, pluriels et féminins (racine de 7 lettres au plus), mots vides.

Frontière chiffrage (FERME) : le critère prix et tout sous-critère qui parle de prix, de coût ou de tarif sont
écartés AVANT tout calcul — Synorix ne commente jamais les prix. Les mots d'usage courant du BTP (« ouvrage »,
« chantier », « mesure »…) ne rattachent rien à eux seuls.

Un critère général sans détail (« Valeur technique ») se lit sur l'ensemble du mémoire : il n'est ni rattaché ni
« À couvrir ».
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from typing import Any

PARTIES = ("partie_a", "partie_b", "partie_c")

_MARQUE_PLACEHOLDER = "[SECTION À RÉGÉNÉRER"

_MOTS_VIDES = frozenset(
    "des les aux par pour sur avec dans une qui que ses son sans leur leurs ainsi afin vis visant "
    "prise prises pris cette ces est sont ete etre mis".split()
)

# Mots d'usage courant : ils ne désignent aucune partie à eux seuls.
_MOTS_COURANTS = frozenset(
    "mesure moyen valeur critere offre note technique ouvrage travaux chantier entreprise prestation "
    "propose proposee global generale general".split()
)

_PRIX = ("prix", "cout", "tarif", "financ", "chiffr", "montant", "budget", "redevance")


def _sans_accents(texte: str) -> str:
    t = (texte or "").lower().replace("œ", "oe").replace("æ", "ae").replace("’", "'")
    return "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))


def _racine(mot: str) -> str:
    if len(mot) > 3 and mot[-1] in "sx":
        mot = mot[:-1]
    if len(mot) > 4 and mot.endswith("e"):
        mot = mot[:-1]
    return mot[:7]


def _mots(texte: str) -> list[str]:
    """Racines des mots utiles d'un texte, dans l'ordre (doublons conservés)."""
    sortie = []
    for brut in re.findall(r"[a-z0-9]+", _sans_accents(texte)):
        if len(brut) < 3 or brut in _MOTS_VIDES:
            continue
        sortie.append(_racine(brut))
    return sortie


def _racines(*mots: str) -> frozenset[str]:
    return frozenset(r for m in mots for r in _mots(m))


_COURANTES = _racines(*_MOTS_COURANTS)

# De quoi parle chaque sous-section du mémoire (clé = « partie.sous_section »).
_THEMES: dict[str, frozenset[str]] = {k: _racines(v) for k, v in {
    "partie_a.implantation": "implantation agence siege zone intervention proximite geographique",
    "partie_a.historique": "historique creation histoire experience savoir faire",
    "partie_a.engagement_qualitatif": "qualite certification qualibat engagement demarche amelioration label",
    "partie_a.activites": "activite metier corps competence savoir",
    "partie_a.organigramme": "organigramme organisation equipe direction encadrement humain hierarchique",
    "partie_a.roles_missions": "role mission encadrement conducteur chef responsable equipe humain personnel competence",
    "partie_a.moyens_informatiques": "informatique logiciel numerique outil bim tablette communication",
    "partie_a.vehicules": "vehicule camion utilitaire flotte transport livraison",
    "partie_a.materiel": "materiel engin outillage equipement echafaudage",
    "partie_a.references": "reference realisation similaire",
    "partie_a.fournisseurs": "fournisseur approvisionnement materiau produit sous traitant sous traitance partenaire equipement",
    "partie_b.demarrage": "demarrage preparation installation etude visa base vie",
    "partie_b.interlocuteur": "interlocuteur contact communication relation suivi coordination reunion responsable",
    "partie_b.qualite_ouvrages": "qualite controle autocontrole reception conformite norme dtu prescription tolerance essai materiau produit equipement",
    "partie_b.respect_planning": "planning delai calendrier phasage jalon retard intemperie",
    "partie_b.securite": "securite prevention risque epi ppsps accident protection hygiene sante",
    "partie_b.dechets": "dechet tri benne evacuation valorisation recyclage bsd decharge gravat",
    "partie_b.environnement": "environnement nuisance bruit poussiere pollution ecologique durable biodiversite",
    "partie_c.methodologie": "methodologie methode procede execution oeuvre phase etape operatoire realisation preparation support application prescription",
    "partie_c.effectifs": "effectif personnel ouvrier oeuvre equipe humain compagnon encadrement qualification mobilise ressource",
    "partie_c.materiels": "materiel equipement engin outillage echafaudage machine nacelle",
    "partie_c.hygiene_securite": "hygiene securite sante prevention risque epi ppsps accident protection base vie",
    "partie_c.mesures_environnementales": "environnement ecologique nuisance bruit poussiere dechet eau energie durable pollution biodiversite",
    "partie_c.gpa": "garantie parfait achevement gpa reserve levee decennale reception",
    "partie_c.delai": "delai calendrier planning duree semaine jalon livraison",
}.items()}


def _est_prix(nom: str) -> bool:
    n = _sans_accents(nom)
    return any(m in n for m in _PRIX)


def _texte_utile(valeur: Any) -> str:
    if not isinstance(valeur, str) or not valeur.strip() or valeur.lstrip().startswith(_MARQUE_PLACEHOLDER):
        return ""
    return valeur


def _comptes_par_section(contenu: Any) -> dict[str, Counter]:
    """Racines (avec leur nombre d'occurrences) du texte rédigé de chaque sous-section."""
    sortie: dict[str, Counter] = {}
    if not isinstance(contenu, dict):
        return sortie
    for part in PARTIES:
        bloc = contenu.get(part)
        if not isinstance(bloc, dict):
            continue
        for sous, valeur in bloc.items():
            texte = _texte_utile(valeur)
            if texte:
                sortie[f"{part}.{sous}"] = Counter(_mots(texte))
    return sortie


def _couvre_par_le_texte(racines: frozenset[str], comptes: Counter) -> bool:
    """Sans table : toutes les racines du sous-critère (au moins les trois quarts s'il y en a plus de trois) sont
    dans le texte ; un mot unique doit y revenir au moins trois fois."""
    if not racines:
        return False
    presentes = sum(1 for r in racines if comptes.get(r, 0) > 0)
    if len(racines) == 1:
        return comptes.get(next(iter(racines)), 0) >= 3
    return presentes >= (len(racines) if len(racines) <= 3 else -(-3 * len(racines) // 4))


def _parle_de_son_theme(cle: str, comptes: Counter, themes: dict = _THEMES) -> bool:
    """La partie emploie le vocabulaire de son thème (au moins deux mots de la table) : elle traite bien de ce
    que dit la table, même si elle n'emploie pas les mots exacts du sous-critère."""
    return sum(1 for r in themes[cle] if comptes.get(r, 0) > 0) >= 2


def _racines_precises(nom: str) -> frozenset[str]:
    """Les mots du sous-critère qui désignent quelque chose ; les mots d'usage courant ne servent que s'il
    n'y en a pas d'autres... et alors le sous-critère reste général (ensemble du mémoire)."""
    return frozenset(r for r in _racines(nom) if r not in _COURANTES)


def _themes_du_memoire(contenu: Any) -> dict[str, frozenset[str]]:
    """La table de thèmes du modèle, plus les parties ajoutées par le patron (plan suivi, ``_plan``) : leur thème est
    fait des mots de leur titre. Sans plan : la table du modèle, telle quelle."""
    plan = contenu.get("_plan") if isinstance(contenu, dict) else None
    liste = plan.get("parties") if isinstance(plan, dict) else None
    themes = dict(_THEMES)
    if isinstance(liste, list):
        for p in liste:
            if isinstance(p, dict) and isinstance(p.get("sous_cle"), str) and str(p["sous_cle"]).startswith("ajout_"):
                themes[f"{p.get('partie')}.{p['sous_cle']}"] = _racines_precises(str(p.get("titre") or ""))
    return themes


def _sections_du_sous_critere(racines: frozenset[str], comptes: dict[str, Counter],
                              themes: dict = _THEMES) -> list[str]:
    trouvees = []
    for cle in themes:   # ordre du document
        c = comptes.get(cle)
        if c is None:
            continue
        communs = racines & themes[cle]
        if communs and (any(c.get(r, 0) > 0 for r in communs) or _parle_de_son_theme(cle, c, themes)):
            trouvees.append(cle)
        elif not communs and _couvre_par_le_texte(racines, c):
            trouvees.append(cle)
    return trouvees


def _unites(criteres: Any) -> list[tuple[str, str, float | int | None]]:
    """(critère, nom, poids) des unités de notation hors prix : les sous-critères, ou le critère lui-même
    quand il n'en a pas."""
    unites = []
    if not isinstance(criteres, list):
        return unites
    for c in criteres:
        if not isinstance(c, dict) or not isinstance(c.get("nom"), str) or _est_prix(c["nom"]):
            continue
        sous = c.get("sous_criteres")
        sous = [s for s in sous if isinstance(s, dict) and isinstance(s.get("nom"), str)] if isinstance(sous, list) else []
        if sous:
            for s in sous:
                if not _est_prix(s["nom"]):
                    unites.append((c["nom"], s["nom"], s.get("poids") if isinstance(s.get("poids"), (int, float)) else None))
        else:
            unites.append((c["nom"], c["nom"], c.get("poids") if isinstance(c.get("poids"), (int, float)) else None))
    return unites


def rattacher(contenu: Any, criteres_jugement: Any) -> dict:
    """Pour chaque sous-critère hors prix : les sous-sections du mémoire qui le traitent.

    Retourne ``{"sous_criteres": [{critere, nom, poids, sections: ["partie_b.dechets", …], traite}],
    "a_couvrir": [{critere, nom, poids}]}``. Un sous-critère général (aucun mot précis) n'est pas listé."""
    comptes = _comptes_par_section(contenu)
    themes = _themes_du_memoire(contenu)
    resultat, a_couvrir = [], []
    for critere, nom, poids in _unites(criteres_jugement):
        racines = _racines_precises(nom)
        if not racines:
            continue
        sections = _sections_du_sous_critere(racines, comptes, themes)
        resultat.append({"critere": critere, "nom": nom, "poids": poids, "sections": sections,
                         "traite": bool(sections)})
        if not sections:
            a_couvrir.append({"critere": critere, "nom": nom, "poids": poids})
    return {"sous_criteres": resultat, "a_couvrir": a_couvrir}
