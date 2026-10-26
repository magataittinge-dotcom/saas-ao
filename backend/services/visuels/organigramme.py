"""Organigramme du chantier (v2) : SVG déterministe, 0 € d'API, données saisies seulement.

Source de l'équipe : le profil « Mon entreprise » (gérant + `postes_cles`) et la table
`team_members`, fusionnés sans doublon (même nom). Chaque personne est rangée par son
intitulé de poste (masculin et féminin : « Conducteur / Conductrice de travaux »).

Rattachements : une personne se rattache au niveau du dessus. Si le profil donne un
supérieur explicite (clé libre `rattache_a` d'un poste clé, nom d'une personne), le trait
va à cette personne ; sinon il va au groupe du niveau du dessus (un trait commun), jamais
à une personne choisie au hasard.
"""
from __future__ import annotations

import re
import unicodedata

from .couleurs import Theme
from .modele import Visuel
from .svg import (LARGEUR_PORTRAIT, cercle, chemin, document_svg, initiales, ligne, pastille, r, t)
from .texte import couper, largeur, tenir_sur_une_ligne

# ── Classement des postes ────────────────────────────────────────────────────

DIRECTION, ENCADREMENT, CHANTIER, TERRAIN, SUPPORT = "direction", "encadrement", "chantier", "terrain", "support"
_RANG = {DIRECTION: 0, ENCADREMENT: 1, CHANTIER: 2, TERRAIN: 3}


def _norme(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[’`]", "'", s).lower().strip()


_SUPPORT = re.compile(r"\b(qse|qhse|hse|securite|qualite|environnement|assistant|assistante|secretaire|comptab|"
                      r"administratif|administrative|ressources humaines|rh|metreur|metreuse|achats?|acheteur|"
                      r"acheteuse|logisticien|logisticienne|magasinier|magasiniere|bureau d'etudes?)\b")
_DIRECTION = re.compile(r"\b(gerant|gerante|co-?gerant|co-?gerante|dirigeant|dirigeante|president|presidente|patron|"
                        r"patronne|pdg|chef d'entreprise|cheffe d'entreprise|directeur general|directrice generale)\b")
_ENCADREMENT = re.compile(r"\b(conducteur|conductrice|charge d'affaires|chargee d'affaires|directeur|directrice|"
                          r"ingenieur|ingenieure|chef de projet|cheffe de projet|responsable)\b")
_CHANTIER = re.compile(r"\b(chef de chantier|cheffe de chantier|chef d'equipe|cheffe d'equipe|contremaitre|"
                       r"contremaitresse|chef de groupe|cheffe de groupe|chef de poste|cheffe de poste)\b")


def classer_poste(poste: str) -> str:
    p = _norme(poste)
    if _CHANTIER.search(p):
        return CHANTIER
    if _SUPPORT.search(p):
        return SUPPORT
    if _DIRECTION.search(p):
        return DIRECTION
    if _ENCADREMENT.search(p):
        return ENCADREMENT
    return TERRAIN


# ── Données ─────────────────────────────────────────────────────────────────

def _certifs(texte: str | None) -> list[str]:
    return [c.strip() for c in re.split(r"[,;/\n]", texte or "") if c.strip()][:3]


def personnes_depuis(cfg, team_members=None) -> list[dict]:
    """Équipe unique : gérant + postes clés du profil + membres de l'équipe, sans doublon."""
    personnes: list[dict] = []
    vus: set[str] = set()

    def ajouter(nom, poste, infos=None, badges=None, rattache_a=None, categorie=None):
        nom = (nom or "").strip()
        if not nom or _norme(nom) in vus:
            return
        vus.add(_norme(nom))
        personnes.append({"nom": nom, "poste": (poste or "").strip(), "infos": infos or [],
                          "badges": badges or [], "rattache_a": (rattache_a or "").strip(),
                          "categorie_imposee": categorie})

    if cfg is not None:
        # Le dirigeant de la fiche « Mon entreprise » est en tête, quel que soit l'intitulé saisi
        # (« Artisan », « Responsable de l'entreprise »…).
        ajouter(getattr(cfg, "gerant_nom", None), getattr(cfg, "gerant_titre", None) or "Gérant",
                categorie=DIRECTION)
        for p in list(getattr(cfg, "postes_cles", None) or []):
            if not isinstance(p, dict):
                continue
            role = (p.get("role") or "").strip()
            ajouter(p.get("nom"), p.get("poste"), [role] if role else [], rattache_a=p.get("rattache_a"))
    for m in team_members or []:
        infos = []
        if getattr(m, "specialite", None):
            infos.append(m.specialite.strip())
        if getattr(m, "experience_years", None):
            infos.append(f"{m.experience_years} ans d'expérience")
        ajouter(getattr(m, "name", None), getattr(m, "role", None), infos, _certifs(getattr(m, "certifications", None)))
    for p in personnes:
        p["categorie"] = p.pop("categorie_imposee") or classer_poste(p["poste"])
    return personnes


def organigramme_possible(cfg, team_members=None) -> bool:
    return len(personnes_depuis(cfg, team_members)) >= 2


# ── Mise en page ────────────────────────────────────────────────────────────

_ECART_X, _ECART_Y = 10.0, 24.0
_MINI_CARTE, _MAXI_CARTE = 100.0, 158.0


def _grouper(cartes: list[dict], maxi: int = 4) -> list[dict]:
    """Au-delà de `maxi` cartes sur une rangée : les personnes de même poste sont réunies
    en une carte de groupe, puis le reste en « Autres »."""
    if len(cartes) <= maxi:
        return cartes
    par_poste: dict[str, list[dict]] = {}
    for c in cartes:
        par_poste.setdefault(_norme(c["poste"]) or "?", []).append(c)
    res: list[dict] = []
    reste: list[dict] = []
    for membres in par_poste.values():
        (res if len(membres) >= 2 else reste).append(_groupe(membres) if len(membres) >= 2 else membres[0])
    if len(res) + len(reste) > maxi and reste:
        res.append(_groupe(reste, "Autres membres de l'équipe"))
        reste = []
    return res + reste


def _groupe(membres: list[dict], titre: str | None = None) -> dict:
    poste = membres[0]["poste"]
    return {"nom": titre or f"{len(membres)} × {poste or 'personnes'}", "poste": "",
            "infos": [m["nom"] for m in membres], "badges": [], "groupe": len(membres),
            "categorie": membres[0]["categorie"], "rattache_a": "", "noms": [m["nom"] for m in membres]}


def _infos(c: dict) -> list[str]:
    """Lignes d'information d'une carte ; un groupe liste tous ses noms, un par ligne."""
    return c["infos"][:8] if c.get("groupe") else c["infos"][:2]


def _hauteur(c: dict, w: float) -> float:
    n = sum(len(couper(i, 8, w - 42, lignes_max=3)) for i in _infos(c))
    nom = len(couper(c["nom"], 9.5, w - 42, True, 2))
    poste = len(couper(c["poste"], 8, w - 42, lignes_max=2)) if c["poste"] else 0
    return max(40.0, 8 + nom * 11 + poste * 9.5 + n * 9.5 + (14 if c["badges"] else 0) + 6)


def organigramme_svg(personnes: list[dict], th: Theme) -> tuple[str, str] | None:
    """(svg, texte alternatif) ou None si l'équipe compte moins de deux personnes."""
    if len(personnes) < 2:
        return None
    W = LARGEUR_PORTRAIT
    rangees: dict[str, list[dict]] = {k: [] for k in _RANG}
    supports: list[dict] = []
    for p in personnes:
        (supports if p["categorie"] == SUPPORT else rangees[p["categorie"]]).append(dict(p))
    lignes_niveau = [(k, v) for k, v in rangees.items() if v]
    if not lignes_niveau:   # que des fonctions support : une seule rangée
        lignes_niveau = [(TERRAIN, supports)]
        supports = []
    # le niveau le plus haut accueille les fonctions support (à côté, trait pointillé)
    lignes = [[dict(c) for c in _grouper(v)] for _, v in lignes_niveau]
    cats = [k for k, _ in lignes_niveau]

    # largeur des cartes : la plus large possible sur la rangée la plus chargée
    n_haut = len(lignes[0]) + len(supports)
    plus_chargee = max([len(lg) for lg in lignes] + [n_haut])
    carte_w = max(_MINI_CARTE, min(_MAXI_CARTE, (W - 4 - (plus_chargee - 1) * _ECART_X) / plus_chargee))
    for sp in supports:
        sp["support"] = True

    rangs = [lignes[0] + supports] + lignes[1:]
    positions: list[list[tuple[float, float, float, float, dict]]] = []
    y = 6.0
    for i, rang in enumerate(rangs):
        h = max(_hauteur(c, carte_w) for c in rang)
        total = len(rang) * carte_w + (len(rang) - 1) * _ECART_X
        x = (W - total) / 2
        ligne_pos = []
        for c in rang:
            ligne_pos.append((x, y, carte_w, h, c))
            x += carte_w + _ECART_X
        positions.append(ligne_pos)
        y += h + _ECART_Y

    corps: list[str] = []
    couleurs = {DIRECTION: th.accent_fonce, ENCADREMENT: th.accent, CHANTIER: th.accent_moyen,
                TERRAIN: th.neutre_barre, SUPPORT: th.ambre}

    # Connecteurs entre rangées voisines (orthogonaux, même palier : un trait commun par rangée)
    for i in range(len(positions) - 1):
        hauts = [p for p in positions[i] if not p[4].get("support")]
        bas = positions[i + 1]
        if not hauts or not bas:
            continue
        palier = max(p[1] + p[3] for p in positions[i]) + _ECART_Y / 2
        par_nom = {_norme(p[4]["nom"]): p for p in hauts}
        liens = set()
        for b in bas:
            cible = par_nom.get(_norme(b[4].get("rattache_a", ""))) if b[4].get("rattache_a") else None
            for hp in ([cible] if cible else hauts):
                liens.add((id(hp), id(b)))
        index_h = {id(p): p for p in hauts}
        index_b = {id(p): p for p in bas}
        for ih, ib in sorted(liens):
            hp, bp = index_h[ih], index_b[ib]
            x1, x2 = hp[0] + hp[2] / 2, bp[0] + bp[2] / 2
            corps.append(chemin(f"M{x1:.1f},{hp[1] + hp[3]:.1f} V{palier:.1f} H{x2:.1f} V{bp[1]:.1f}", th.filet, 1.2))
    # Fonctions support : trait pointillé vers la fiche voisine de la première rangée
    for p in positions[0]:
        if p[4].get("support"):
            racines = [q for q in positions[0] if not q[4].get("support")]
            if racines:
                q = racines[-1]
                yc = q[1] + q[3] / 2
                corps.append(ligne(q[0] + q[2], yc, p[0], yc, th.ambre, 1.2, ' stroke-dasharray="3 2"'))

    for rang in positions:
        for (x, y, w, h, c) in rang:
            cat = SUPPORT if c.get("support") else c["categorie"]
            corps.append(r(x, y, w, h, fill="#FFFFFF", stroke=th.filet, sw=0.75, rx=4))
            corps.append(r(x, y, 3.4, h, fill=couleurs.get(cat, th.accent)))
            if c.get("groupe"):
                for k in range(min(c["groupe"], 3)):
                    cx = x + 15 + k * 4.5
                    corps.append(cercle(cx, y + 13, 3.0, fill=th.neutre_barre, stroke="#FFFFFF", sw=0.8))
                    corps.append(chemin(f"M{cx - 4.5:.1f},{y + 24:.1f} Q{cx:.1f},{y + 15:.1f} {cx + 4.5:.1f},{y + 24:.1f} Z",
                                        "#FFFFFF", 0.8, fill=th.neutre_barre))
            else:
                corps.append(cercle(x + 20, y + 17, 10.5, fill=th.accent_clair))
                corps.append(t(x + 20, y + 20.2, initiales(c["nom"]), 8.5, True, th.accent_fonce, "middle"))
            tx = x + 36
            yy = y + 14
            for lg in couper(c["nom"], 9.5, w - 42, True, 2):
                corps.append(t(tx, yy, lg, 9.5, True, th.encre))
                yy += 11
            if c["poste"]:
                for lg in couper(c["poste"], 8, w - 42, lignes_max=2):
                    corps.append(t(tx, yy, lg, 8, False, th.discret))
                    yy += 9.5
            for info in _infos(c):
                for lg in couper(info, 8, w - 42, lignes_max=3):
                    corps.append(t(tx, yy, lg, 8, False, th.texte))
                    yy += 9.5
            bx = tx
            for b in c["badges"]:
                svg_b, bw = pastille(bx, yy - 5, tenir_sur_une_ligne(b, 7.5, w - 50, True), th, taille=7.5)
                if bx + bw > x + w - 4:
                    break
                corps.append(svg_b)
                bx += bw + 3

    bas = max(p[1] + p[3] for rang in positions for p in rang) + 18
    lx = 0.0
    presentes = [("Direction", DIRECTION), ("Encadrement", ENCADREMENT), ("Chef de chantier", CHANTIER),
                 ("Production", TERRAIN)]
    cats_presentes = set(cats)
    if supports:
        cats_presentes.add(SUPPORT)
    for nom_, cat in presentes + [("Fonction support", SUPPORT)]:
        if cat not in cats_presentes:
            continue
        corps.append(r(lx, bas - 7, 3.4, 9, fill=couleurs[cat]))
        corps.append(t(lx + 8, bas + 1, nom_, 8, False, th.discret))
        lx += largeur(nom_, 8) + 22
    svg = document_svg(W, bas + 8, "".join(corps), "Organigramme du chantier")
    alt = "Organigramme du chantier : " + " ; ".join(
        f"{p['nom']}, {p['poste']}" if p["poste"] else p["nom"] for p in personnes) + "."
    return svg, alt


def construire(cfg, team_members, th: Theme) -> Visuel | None:
    res = organigramme_svg(personnes_depuis(cfg, team_members), th)
    if not res:
        return None
    svg, alt = res
    return Visuel(("partie_a", "organigramme"), svg, alt, "Organigramme du chantier", 17.0,
                  gabarits=("organigramme",))
