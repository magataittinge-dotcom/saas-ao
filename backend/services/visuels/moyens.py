"""Moyens humains et matériels : synoptiques SVG, à partir des seules données saisies.

- humains : les personnes du profil (postes clés + équipe), regroupées par poste, et le
  nombre d'ouvriers dédiés saisi pour ce mémoire (`nb_ouvriers`) ; le dirigeant n'est pas
  compté (il n'est pas, par défaut, une ressource du chantier) ;
- matériels : les lignes des champs libres `materiel`, `vehicules` et `materiel_specifique`.
  La quantité (« 2 camions benne ») et le statut (« location », « en propre ») ne sont lus
  que s'ils sont écrits dans la ligne ; sinon rien n'est affiché.
Sans donnée, le générateur renvoie None et le bloc disparaît.
"""
from __future__ import annotations

import re

from .couleurs import Theme
from .modele import Visuel
from .organigramme import DIRECTION, _norme, personnes_depuis
from .svg import LARGEUR_PORTRAIT, cercle, chemin, document_svg, pastille, r, t
from .texte import couper, nettoyer, tenir_sur_une_ligne

MAX_MATERIELS = 24
MAX_CARTES_HUMAINS = 12


# ── Lecture des champs libres ────────────────────────────────────────────────

_COUPURE = re.compile(r"[\n;•]|(?<!\d),|,(?!\d)")
_QUANTITE = re.compile(r"^(\d{1,4})\s*(?:[x×]\s*|\s+)([^\d\s].*)$", re.IGNORECASE)
_LOCATION = re.compile(r"\b(location|loue|louee|loues|louees|loueur)\b")
_PROPRE = re.compile(r"\b(en propre|propriete)\b")


def lignes_materiel(*champs: str | None) -> list[dict]:
    """[{nom, quantite, statut}] lus dans les champs libres, sans doublon, sans rien ajouter."""
    vus: set[str] = set()
    items: list[dict] = []
    for champ in champs:
        for brut in _COUPURE.split(nettoyer(champ or "")):
            ligne = re.sub(r"^[\s\-–—*•·>]+", "", brut).strip().rstrip(".").strip()
            if len(ligne) < 2 or not re.search(r"[A-Za-zÀ-ÿ]", ligne):
                continue
            norme = _norme(ligne)
            statut = "Location" if _LOCATION.search(norme) else "En propre" if _PROPRE.search(norme) else ""
            nom, quantite = ligne, ""
            m = _QUANTITE.match(ligne)
            if m:
                quantite, nom = m.group(1), m.group(2).strip()
            nom = re.sub(r"\s*\((?:location|en propre)[^)]*\)\s*$", "", nom, flags=re.IGNORECASE).strip() or nom
            cle = _norme(nom)
            if cle in vus:
                continue
            vus.add(cle)
            items.append({"nom": nom, "quantite": quantite, "statut": statut, "picto": _picto_pour(norme)})
    return items


_PICTOS = [
    ("echafaudage", ("echafaud",)), ("nacelle", ("nacelle", "plateforme elevatrice", "pemp")),
    ("camion", ("camion", "benne", "plateau", "poids lourd")),
    ("fourgon", ("fourgon", "utilitaire", "vehicule", "camionnette", "voiture", "pick-up")),
    ("malaxeur", ("malaxeur", "betonniere", "mixeur")), ("aspirateur", ("aspirateur", "aspiration")),
    ("nettoyeur", ("nettoyeur", "haute pression", "karcher", "hydrogom", "sableuse", "aerogom")),
    ("basevie", ("base vie", "base-vie", "bungalow", "vestiaire", "cantonnement")),
]


def _picto_pour(norme: str) -> str:
    for nom, mots in _PICTOS:
        if any(m in norme for m in mots):
            return nom
    return "outil"


def _picto(nom: str, x: float, y: float, c: str) -> str:
    """Pictogrammes au trait (cadre 40 x 30), sans <marker> ni filtre."""
    s = f' stroke="{c}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"'
    g = f'<g transform="translate({x:.1f},{y:.1f})">'
    if nom == "echafaudage":
        g += f'<path d="M6,28 V4 M20,28 V4 M34,28 V4 M3,4 H37 M3,14 H37 M3,24 H37 M6,24 L20,14 M20,24 L34,14"{s}/>'
    elif nom == "nacelle":
        g += (f'<path d="M4,24 H24 V18 H4 Z M14,18 L22,9 L33,6 M29,2 H39 V8 H29 Z"{s}/>'
              f'<circle cx="8" cy="27" r="2.4"{s}/><circle cx="20" cy="27" r="2.4"{s}/>')
    elif nom == "camion":
        g += (f'<path d="M2,23 V12 H10 L14,7 H18 V23 M18,23 H38 V9 L22,9 L18,15 M2,23 H38"{s}/>'
              f'<circle cx="8" cy="25" r="2.6"{s}/><circle cx="31" cy="25" r="2.6"{s}/>')
    elif nom == "fourgon":
        g += (f'<path d="M2,23 V10 Q2,6 7,6 H28 L37,14 V23 Z M28,6 V14 H37 M18,6 V23"{s}/>'
              f'<circle cx="9" cy="24" r="2.6"{s}/><circle cx="30" cy="24" r="2.6"{s}/>')
    elif nom == "malaxeur":
        g += f'<path d="M12,3 H28 M20,3 V12 M14,12 H26 V16 H14 Z M20,16 V26 M15,22 Q20,18 25,22 Q20,26 15,22"{s}/>'
    elif nom == "aspirateur":
        g += (f'<path d="M6,10 H22 V26 H6 Z M10,10 V6 H18 V10 M22,14 Q32,14 32,22 V26 M28,26 H38"{s}/>'
              f'<circle cx="10" cy="28" r="1.6"{s}/><circle cx="18" cy="28" r="1.6"{s}/>')
    elif nom == "nettoyeur":
        g += (f'<path d="M4,12 H18 V26 H4 Z M18,16 Q26,16 26,10 L36,4 M33,2 L39,6"{s}/>'
              f'<path d="M37,9 L39,11 M35,12 L36,15"{s}/>')
    elif nom == "basevie":
        g += f'<path d="M2,26 V8 H38 V26 Z M8,26 V15 H15 V26 M21,13 H33 V20 H21 Z M2,8 L5,4 H35 L38,8"{s}/>'
    else:  # outil : caisse à outils
        g += f'<path d="M4,12 H36 V26 H4 Z M14,12 V8 H26 V12 M4,18 H36"{s}/>'
    return g + "</g>"


# ── Humains ──────────────────────────────────────────────────────────────────

def cartes_humaines(cfg, team_members, nb_ouvriers) -> list[dict]:
    """[{role, nombre, noms}] : personnes du profil par poste + ouvriers dédiés saisis."""
    par_poste: dict[str, dict] = {}
    for p in personnes_depuis(cfg, team_members):
        if p["categorie"] == DIRECTION:
            continue
        cle = _norme(p["poste"]) or "?"
        c = par_poste.setdefault(cle, {"role": p["poste"] or "Équipe", "nombre": 0, "noms": []})
        c["nombre"] += 1
        c["noms"].append(p["nom"])
    cartes = list(par_poste.values())
    try:
        n = int(nb_ouvriers or 0)
    except (TypeError, ValueError):
        n = 0
    if 0 < n <= 500:
        cartes.append({"role": "Ouvriers dédiés au chantier", "nombre": n, "noms": []})
    return cartes[:MAX_CARTES_HUMAINS]


def synoptique_humains(cartes: list[dict], th: Theme) -> tuple[str, str] | None:
    if not cartes:
        return None
    W = LARGEUR_PORTRAIT
    cols = min(len(cartes), 4)
    gap = 6.0
    cw = (W - (cols - 1) * gap) / cols
    corps = [t(0, 11, "MOYENS HUMAINS", 8, True, th.accent_fonce)]
    # toutes les cartes d'une rangée ont la même hauteur
    y = 20.0
    rangs = [cartes[i:i + cols] for i in range(0, len(cartes), cols)]
    for rang in rangs:
        hauteurs = []
        for c in rang:
            roles = couper(c["role"], 8.5, cw - 14, True, 3)
            noms = [couper(n, 8, cw - 14, lignes_max=1)[0] for n in c["noms"][:6]]
            hauteurs.append(34 + 24 + len(roles) * 10.5 + len(noms) * 9.5 + 6)
        h = max(hauteurs)
        for col, c in enumerate(rang):
            x = col * (cw + gap)
            corps.append(r(x, y, cw, h, fill=th.accent_pale, stroke=th.filet_clair, rx=4))
            for j in range(min(c["nombre"], 5)):
                cx = x + 12 + j * 11
                corps.append(cercle(cx, y + 13, 3.3, fill=th.accent, stroke=th.accent, sw=1))
                corps.append(chemin(f"M{cx - 5:.1f},{y + 27:.1f} Q{cx:.1f},{y + 15:.1f} {cx + 5:.1f},{y + 27:.1f} Z",
                                    th.accent, 1, fill=th.accent))
            if c["nombre"] > 5:
                corps.append(t(x + 12 + 5 * 11, y + 25, f"+{c['nombre'] - 5}", 8, True, th.accent_fonce))
            corps.append(t(x + 8, y + 54, str(c["nombre"]), 20, True, th.accent_fonce))
            yy = y + 67
            for ln in couper(c["role"], 8.5, cw - 14, True, 3):
                corps.append(t(x + 8, yy, ln, 8.5, True, th.encre))
                yy += 10.5
            for n in c["noms"][:6]:
                corps.append(t(x + 8, yy, tenir_sur_une_ligne(n, 8, cw - 14), 8, False, th.texte))
                yy += 9.5
        y += h + gap
    bas = y - gap + 4
    alt = "Moyens humains : " + " ; ".join(f"{c['nombre']} {c['role']}" for c in cartes) + "."
    return document_svg(W, bas, "".join(corps), "Moyens humains"), alt


# ── Matériels ────────────────────────────────────────────────────────────────

def synoptique_materiels(items: list[dict], th: Theme) -> tuple[str, str] | None:
    if not items:
        return None
    W = LARGEUR_PORTRAIT
    exces = max(0, len(items) - MAX_MATERIELS)
    items = items[:MAX_MATERIELS]
    cols = 4
    gap = 6.0
    tw = (W - (cols - 1) * gap) / cols
    corps = [t(0, 11, "MOYENS MATÉRIELS", 8, True, th.accent_fonce)]
    y0 = 20.0
    rangs = [items[i:i + cols] for i in range(0, len(items), cols)]
    y = y0
    for rang in rangs:
        noms_l = [couper(m["nom"], 8.5, tw - 14, True, 3) for m in rang]
        h = max(70.0, 52 + max(len(n) for n in noms_l) * 10.5 + (14 if any(m["statut"] for m in rang) else 2))
        for col, (m, nl) in enumerate(zip(rang, noms_l)):
            x = col * (tw + gap)
            corps.append(r(x, y, tw, h, fill="#FFFFFF", stroke=th.filet, rx=4))
            corps.append(_picto(m["picto"], x + 8, y + 7, th.accent))
            if m["quantite"]:
                corps.append(t(x + tw - 8, y + 27, m["quantite"], 16 if len(m["quantite"]) < 4 else 12, True,
                               th.accent_fonce, "end"))
            yy = y + 47
            for ln in nl:
                corps.append(t(x + 8, yy, ln, 8.5, True, th.encre))
                yy += 10.5
            if m["statut"]:
                propre = m["statut"] == "En propre"
                svg_p, _ = pastille(x + 8, yy - 4, m["statut"], th,
                                    fond=th.accent_clair if propre else th.fond,
                                    texte=th.accent_fonce if propre else th.discret, taille=7.5)
                corps.append(svg_p)
        y += h + gap
    bas = y - gap + 4
    if exces:
        corps.append(t(0, bas + 10, f"et {exces} autre(s) élément(s) du profil", 8, False, th.discret))
        bas += 14
    alt = "Moyens matériels : " + " ; ".join(
        (f"{m['quantite']} " if m["quantite"] else "") + m["nom"] for m in items) + "."
    return document_svg(W, bas, "".join(corps), "Moyens matériels"), alt


# ── Visuels ─────────────────────────────────────────────────────────────────

def construire_humains(cfg, team_members, nb_ouvriers, th: Theme) -> Visuel | None:
    res = synoptique_humains(cartes_humaines(cfg, team_members, nb_ouvriers), th)
    if not res:
        return None
    svg, alt = res
    return Visuel(("partie_c", "effectifs"), svg, alt,
                  "Moyens humains — d'après le profil de l'entreprise", 17.0)


def construire_materiels(cfg, materiel_specifique, th: Theme) -> Visuel | None:
    items = lignes_materiel(getattr(cfg, "materiel", None), getattr(cfg, "vehicules", None), materiel_specifique)
    res = synoptique_materiels(items, th)
    if not res:
        return None
    svg, alt = res
    return Visuel(("partie_c", "materiels"), svg, alt,
                  "Moyens matériels — d'après le profil de l'entreprise et les précisions de ce mémoire", 17.0)
