"""Planning prévisionnel (Gantt v2) : SVG lisible une fois imprimé, 0 € d'API.

Données : les phases saisies au pre-flight, [{nom, duree_semaines}], mises bout à bout.
Aucune date n'est inventée : l'axe est en semaines (S1 = première semaine du planning) et
en « mois » relatifs (1 mois = 4,3 semaines) ; aucun jour de calendrier.

Lisibilité imprimée : le viewBox est en points et le visuel est posé à sa largeur nominale
(17 cm portrait, 25,7 cm paysage), donc tout texte y est >= 8 pt. Page A4 paysage dès que
le planning dépasse 26 semaines. Libellés entiers (retour à la ligne, jamais coupés).
Contraste : texte sombre sur fond blanc, jamais de texte clair sur la barre (la durée est
écrite à côté) ; barre en couleur foncée, lisible en noir et blanc.
"""
from __future__ import annotations

import math

from .couleurs import Theme
from .limites import GANTT_DUREE_MAX, GANTT_MAX_PHASES, GANTT_TOTAL_MAX
from .modele import Visuel
from .svg import LARGEUR_PAYSAGE, LARGEUR_PORTRAIT, chemin, document_svg, ligne, r, t
from .texte import couper, largeur, nettoyer

SEUIL_PAYSAGE = 26          # semaines au-delà desquelles on passe en A4 paysage
HAUTEUR_MAX_PAYSAGE = 400.0  # points : A4 paysage moins marges, titre et légende
HAUTEUR_MAX_PORTRAIT = 600.0
SEMAINES_PAR_MOIS = 52 / 12


def phases_valides(phases) -> list[dict] | None:
    """[{nom, duree}] nettoyées et bornées, ou None si rien d'exploitable ou hors bornes."""
    propres = []
    for p in phases or []:
        if not isinstance(p, dict):
            continue
        nom = " ".join(nettoyer(p.get("nom") or "").split())
        try:
            duree = int(p.get("duree_semaines") or 0)
        except (TypeError, ValueError):
            duree = 0
        if nom and duree > 0:
            propres.append({"nom": nom, "duree": duree})
    if not propres:
        return None
    if (len(propres) > GANTT_MAX_PHASES or any(p["duree"] > GANTT_DUREE_MAX for p in propres)
            or sum(p["duree"] for p in propres) > GANTT_TOTAL_MAX):
        return None
    return propres


def _pas_etiquettes(largeur_semaine: float) -> int:
    for k in (1, 2, 4, 5, 10, 13, 26, 52):
        if k * largeur_semaine >= 15:
            return k
    return 104


def gantt_svg(phases, th: Theme) -> tuple[str, str, bool, float] | None:
    """(svg, texte alternatif, paysage, largeur_cm) ou None s'il n'y a rien à montrer."""
    propres = phases_valides(phases)
    if not propres:
        return None
    total = sum(p["duree"] for p in propres)
    paysage = total > SEUIL_PAYSAGE
    W = LARGEUR_PAYSAGE if paysage else LARGEUR_PORTRAIT
    col_lib = 200.0 if paysage else 158.0
    x0 = col_lib + 8
    sw_ = (W - x0 - 6) / total          # largeur d'une semaine
    taille_lib, taille_axe = 8.5, 8.0

    haut_entete = 36.0
    lignes_phase = [couper(p["nom"], taille_lib, col_lib - 6, lignes_max=4) for p in propres]
    hauteurs = [max(20.0, len(lg) * 10 + 8) for lg in lignes_phase]
    y_debut = haut_entete
    y_fin = y_debut + sum(hauteurs)
    corps: list[str] = []

    # En-tête : mois relatifs puis numéros de semaine
    n_mois = math.ceil(total / SEMAINES_PAR_MOIS) if total >= 8 else 0
    for m in range(n_mois):
        xa = x0 + m * SEMAINES_PAR_MOIS * sw_
        xb = x0 + min((m + 1) * SEMAINES_PAR_MOIS, total) * sw_
        corps.append(r(xa + 0.5, 2, xb - xa - 1, 15, fill=th.accent_pale))
        lib = f"Mois {m + 1}"
        if largeur(lib, taille_axe, True) > xb - xa - 4:
            lib = f"M{m + 1}"
        if largeur(lib, taille_axe, True) <= xb - xa - 2:
            corps.append(t((xa + xb) / 2, 13.2, lib, taille_axe, True, th.accent_fonce, "middle"))
    k = _pas_etiquettes(sw_)
    for s in range(total):
        if s % k == 0:
            corps.append(t(x0 + (s + 0.5) * sw_, 29.5, f"S{s + 1}", taille_axe, False, th.discret, "middle"))
    corps.append(ligne(0, haut_entete - 3, W, haut_entete - 3, th.filet, 0.75))

    # Grille hebdomadaire (traits fins) et rangées
    for s in range(total + 1):
        if s % k == 0 or s == total:
            corps.append(ligne(x0 + s * sw_, haut_entete - 3, x0 + s * sw_, y_fin, th.filet_clair, 0.5))
    y = y_debut
    cursor = 0
    for i, (p, lg, h) in enumerate(zip(propres, lignes_phase, hauteurs)):
        if i % 2 == 1:
            corps.append(r(0, y, W, h, fill=th.fond))
        # libellé entier, sur autant de lignes que nécessaire
        yy = y + (h - len(lg) * 10) / 2 + 8
        for ln in lg:
            corps.append(t(2, yy, ln, taille_lib, False, th.encre))
            yy += 10
        xa = x0 + cursor * sw_
        wb = p["duree"] * sw_
        corps.append(r(xa + 0.8, y + h / 2 - 6, max(wb - 1.6, 1.0), 12, fill=th.accent, rx=2, extra=' class="gantt-bar"'))
        debut, fin = cursor + 1, cursor + p["duree"]
        etiquette = f"S{debut}" if debut == fin else f"S{debut} à S{fin}"
        etiquette += f" · {p['duree']} sem."
        lw = largeur(etiquette, taille_axe)
        if xa + wb + 4 + lw <= W - 2:
            corps.append(t(xa + wb + 4, y + h / 2 + 3, etiquette, taille_axe, False, th.encre))
        else:
            corps.append(t(xa - 4, y + h / 2 + 3, etiquette, taille_axe, False, th.encre, "end"))
        cursor += p["duree"]
        y += h
    corps.append(ligne(0, y_fin, W, y_fin, th.filet, 0.75))

    pied = f"Durée totale du planning : {total} semaines. S1 = première semaine ; 1 mois = 4,3 semaines."
    corps.append(t(0, y_fin + 14, pied, taille_axe, False, th.discret))
    hauteur = y_fin + 22
    svg = document_svg(W, hauteur, "".join(corps), "Planning prévisionnel des travaux")
    alt = "Planning prévisionnel des travaux, en semaines : " + " ; ".join(
        f"{p['nom']} ({p['duree']} sem.)" for p in propres) + f". Durée totale : {total} semaines."
    largeur_cm = 25.7 if paysage else 17.0
    maxi = HAUTEUR_MAX_PAYSAGE if paysage else HAUTEUR_MAX_PORTRAIT
    if hauteur > maxi:      # beaucoup de phases : on réduit pour tenir sur la page
        largeur_cm = round(largeur_cm * maxi / hauteur, 2)
    return svg, alt, paysage, largeur_cm


def construire(phases, th: Theme) -> Visuel | None:
    res = gantt_svg(phases, th)
    if not res:
        return None
    svg, alt, paysage, largeur_cm = res
    return Visuel(("partie_c", "methodologie"), svg, alt, "Planning prévisionnel des travaux",
                  largeur_cm, paysage)
