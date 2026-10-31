"""Table de correspondance métiers — CPV, descripteurs BOAMP et objet de l'avis.

Sources :
  * CPV : division 45 « Travaux de construction » du vocabulaire commun pour les marchés publics,
    règlement (CE) n° 213/2008 de la Commission du 28 novembre 2007 (annexe I) — groupes 45.1 à
    45.5 (préparation de chantier ; construction complète ou partielle et génie civil ; installation
    d'équipements de bâtiment ; parachèvement ; location). Les préfixes ci-dessous suivent la
    hiérarchie positionnelle du CPV (le code à 8 chiffres sans ses zéros finaux : « 45421 » couvre
    45421000 à 45421999) ; le préfixe le plus long l'emporte.
  * Descripteurs : liste réelle de l'API BOAMP (champ `descripteur_code`, 216 codes relevés le
    31/10/2026 sur 3 000 avis de travaux — voir `.claude/echange/sprint-ozcan/veille/BOAMP-API.md`).
  * Les rattachements aux métiers sont un choix éditorial de lecture, jamais un avis sur le marché.

Règle d'or : le CPV et les descripteurs décident. L'objet ne sert que de repli, par mots entiers
(`\\b`, accents normalisés) — jamais « plomb », qui attrape « Plomberie » dans une recherche
naïve par sous-chaîne. Sans aucun indice, le métier est « autre ».
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Literal

Metier = Literal[
    "gros_oeuvre", "cvc", "cfo_cfa", "menuiseries", "facade_ite", "peinture", "plomberie",
    "electricite", "couverture", "vrd", "demolition", "etancheite", "carrelage", "platrerie",
    "serrurerie", "ascenseurs", "espaces_verts", "autre",
]

LIBELLES: dict[str, str] = {
    "gros_oeuvre": "Gros œuvre et maçonnerie",
    "cvc": "Chauffage, ventilation, climatisation",
    "cfo_cfa": "Courants faibles",
    "menuiseries": "Menuiseries et vitrerie",
    "facade_ite": "Façade, ravalement et isolation extérieure",
    "peinture": "Peinture",
    "plomberie": "Plomberie et sanitaires",
    "electricite": "Électricité",
    "couverture": "Charpente, couverture et zinguerie",
    "vrd": "Voirie et réseaux divers",
    "demolition": "Démolition et désamiantage",
    "etancheite": "Étanchéité",
    "carrelage": "Carrelage et revêtements de sols et murs",
    "platrerie": "Plâtrerie, cloisons et plafonds",
    "serrurerie": "Serrurerie et métallerie",
    "ascenseurs": "Ascenseurs et élévateurs",
    "espaces_verts": "Espaces verts et aménagements paysagers",
    "autre": "Autre",
}

# ── CPV : préfixe (code sans zéros finaux) → métiers ───────────────────────────────────────────
CPV_PREFIXES: dict[str, tuple[str, ...]] = {
    # 45.1 — préparation de chantier
    "451111": ("demolition",),            # 45111000-45111200 démolition, préparation et dégagement
    "4511129": ("vrd",),                  # 45111291 travaux d'aménagement de site
    "45112": ("vrd",),                    # fouille et terrassement
    "451127": ("espaces_verts",),         # 45112700-45112740 aménagement paysager, espaces verts
    # 45.2 — construction complète ou partielle, génie civil
    "45210": ("gros_oeuvre",),            # construction de bâtiments
    "45211": ("gros_oeuvre",), "45212": ("gros_oeuvre",), "45213": ("gros_oeuvre",),
    "45214": ("gros_oeuvre",), "45215": ("gros_oeuvre",), "45216": ("gros_oeuvre",),
    "4522": ("vrd",),                     # ouvrages d'art et génie civil
    "45223": ("gros_oeuvre",),            # 45223xxx structures ; 45223220 gros œuvre
    "4523": ("vrd",),                     # pipelines, routes, voies ferrées, nivellement
    "4524": ("vrd",),                     # construction hydraulique
    "452322": ("electricite",),           # 45232200-45232220 lignes de communication et électriques
    # 45.26 — travaux spéciaux
    "45261": ("couverture",),             # charpente, toiture et travaux connexes
    "452613": ("couverture",),            # ferblanterie, zinguerie
    "452614": ("etancheite",),            # 45261400 / 45261420 travaux d'étanchéification
    "4526141": ("couverture",),           # 45261410 isolation de toiture
    "45261215": ("electricite",),         # 45261215 couverture en panneaux solaires
    "45262": ("gros_oeuvre",),            # fondations, béton, maçonnerie, structures
    "45262100": ("gros_oeuvre",),
    "452626": ("demolition",),            # 45262600 travaux spécialisés (désamiantage en 45262660)
    "4526265": ("facade_ite",),           # 45262650 bardage
    "4526270": ("gros_oeuvre",),          # 45262700 transformation de bâtiments
    # 45.3 — équipement du bâtiment
    "45310": ("electricite",), "45311": ("electricite",),
    "45312": ("cfo_cfa",),                # alarme et antenne
    "45313": ("ascenseurs",),             # ascenseurs et escaliers mécaniques
    "45314": ("cfo_cfa",),                # réseaux de télécommunication
    "45315": ("electricite",), "45316": ("electricite",), "45317": ("electricite",),
    "45320": ("facade_ite",), "45321": ("facade_ite",),   # isolation thermique
    "45330": ("plomberie",), "45332": ("plomberie",), "45333": ("plomberie",),
    "45331": ("cvc",),                    # chauffage, ventilation, climatisation
    "4534": ("serrurerie",),              # 45340-45342 clôtures, garde-corps
    "45343": ("cfo_cfa",),                # installations de prévention d'incendie
    "4535": ("cvc",),                     # installations mécaniques
    # 45.4 — parachèvement
    "45410": ("platrerie",),
    "45420": ("menuiseries",), "45421": ("menuiseries",),
    "454211": ("menuiseries",),
    "45421141": ("platrerie",), "45421146": ("platrerie",),   # cloisons, faux plafonds
    "45421152": ("platrerie",),           # cloisons
    "45422": ("couverture",),             # charpenterie
    "45430": ("carrelage",), "45431": ("carrelage",), "45432": ("carrelage",), "45433": ("carrelage",),
    "45441": ("menuiseries",),            # vitrerie
    "45442": ("peinture",),
    "454422": ("peinture",),
    "45443": ("facade_ite",),             # travaux de façade
    "45451": ("peinture",),               # décoration
    "45452": ("facade_ite",),             # nettoyage à grande eau / sablage extérieur
}

# ── Descripteurs BOAMP : code → métiers (clé = `descripteur_code`) ─────────────────────────────
DESCRIPTEURS: dict[str, tuple[str, ...]] = {
    "105": ("electricite",),              # Electricité (travaux)
    "102": ("electricite",),              # Eclairage public
    "476": ("electricite",),              # Photovoltaïque
    "106": ("electricite",),              # Electrification rurale
    "222": ("menuiseries",),              # Menuiserie
    "363": ("menuiseries",),              # Vitrerie
    "229": ("menuiseries",),              # Miroiterie
    "414": ("menuiseries",),              # Occultation
    "264": ("peinture",),                 # Peinture (travaux)
    "85": ("peinture",),                  # Décoration (travaux)
    "144": ("gros_oeuvre",),              # Gros oeuvre
    "195": ("gros_oeuvre",),              # Maçonnerie
    "129": ("gros_oeuvre",),              # Fondations spéciales
    "233": ("gros_oeuvre",),              # Mur de soutènement
    "270": ("plomberie",),                # Plomberie (travaux)
    "319": ("plomberie",),                # Sanitaire
    "366": ("vrd",), "365": ("vrd",), "341": ("vrd",), "306": ("vrd",), "353": ("vrd",),
    "18": ("vrd",),                       # Assainissement
    "6": ("vrd",),                        # Alimentation en eau potable
    "48": ("vrd",),                       # Canalisations
    "141": ("vrd",), "253": ("vrd",), "252": ("vrd",), "322": ("vrd",), "199": ("vrd",),
    "61": ("cvc",),                       # Chauffage (travaux)
    "360": ("cvc",),                      # Ventilation
    "62": ("cvc",),                       # Climatisation
    "114": ("cvc",),                      # Equipement thermique
    "59": ("cvc",),                       # Chauffage (exploitation, entretien)
    "116": ("espaces_verts",),            # Espaces verts
    "358": ("espaces_verts",),            # Végétaux
    "74": ("couverture",),                # Couverture
    "372": ("couverture",),               # Zinguerie
    "145": ("couverture",),               # Gouttières
    "57": ("couverture",),                # Charpente
    "87": ("demolition",),                # Démolition
    "78": ("demolition",),                # Curage
    "479": ("demolition",),               # Amiante (désamiantage)
    "24": ("demolition",),                # Amiante
    "117": ("etancheite",),               # Etanchéité
    "63": ("platrerie",),                 # Cloison, faux plafond
    "269": ("platrerie",),                # Plâtrerie
    "308": ("carrelage",),                # Revêtements de sols
    "53": ("carrelage",),                 # Carrelage
    "309": ("carrelage",),                # Revêtements muraux
    "321": ("serrurerie",),               # Serrurerie
    "223": ("serrurerie",),               # Métallerie
    "126": ("serrurerie",),               # Ferronnerie
    "64": ("serrurerie",),                # Clôture
    "412": ("serrurerie",),               # Porte automatique, portail
    "254": ("serrurerie",),               # Ouvrage métallique
    "17": ("ascenseurs",),                # Ascenseur
    "11": ("ascenseurs",),                # Appareil élévateur
    "30": ("facade_ite",),                # Bardage
    "299": ("facade_ite",),               # Ravalement
    "169": ("facade_ite",),               # Isolation
    "47": ("cfo_cfa",), "5": ("cfo_cfa",), "90": ("cfo_cfa",), "332": ("cfo_cfa",),
    "81": ("cfo_cfa",), "415": ("cfo_cfa",), "133": ("cfo_cfa",), "338": ("cfo_cfa",),
}

# ── Repli sur l'objet : mots entiers (accents ôtés, minuscules) → métier ───────────────────────
_MOTS_OBJET: dict[str, tuple[str, ...]] = {
    "plomberie": ("plomberie", "sanitaire", "sanitaires"),     # jamais « plomb »
    "cvc": ("chauffage", "ventilation", "climatisation", "cvc", "vmc", "chaufferie"),
    "electricite": ("electricite", "electrique", "electriques", "eclairage"),
    "cfo_cfa": ("courants faibles", "courant faible", "courants forts", "courant fort", "cfo", "cfa"),
    "menuiseries": ("menuiserie", "menuiseries", "fenetre", "fenetres", "huisserie", "huisseries", "vitrerie"),
    "facade_ite": ("facade", "facades", "ravalement", "bardage", "isolation thermique par l exterieur"),
    "peinture": ("peinture", "peintures"),
    "couverture": ("couverture", "toiture", "toitures", "charpente", "zinguerie"),
    "vrd": ("vrd", "voirie", "assainissement", "terrassement", "terrassements"),
    "demolition": ("demolition", "demolitions", "desamiantage", "curage"),
    "etancheite": ("etancheite",),
    "carrelage": ("carrelage", "faience", "faiences"),
    "platrerie": ("platrerie", "cloison", "cloisons", "faux plafond", "faux plafonds"),
    "serrurerie": ("serrurerie", "metallerie", "ferronnerie"),
    "ascenseurs": ("ascenseur", "ascenseurs", "monte charge", "monte charges"),
    "espaces_verts": ("espaces verts", "espace vert", "paysager", "paysagers", "paysagere", "paysageres"),
    "gros_oeuvre": ("gros oeuvre", "maconnerie", "beton"),
}


def normaliser(texte: str | None) -> str:
    """Minuscules, sans accents, ponctuation et apostrophes ramenées à des espaces (œ → oe)."""
    if not texte:
        return ""
    texte = texte.lower().replace("œ", "oe").replace("æ", "ae")
    texte = unicodedata.normalize("NFKD", texte)
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", texte).strip()


def _motif(mots: Iterable[str]) -> re.Pattern:
    return re.compile(r"\b(?:" + "|".join(re.escape(m) for m in sorted(mots, key=len, reverse=True)) + r")\b")


_MOTIFS_OBJET = [(metier, _motif(mots)) for metier, mots in _MOTS_OBJET.items()]

# Libellés des descripteurs (pour les entrées données par leur libellé et non par leur code).
_LIBELLE_VERS_CODE = {
    "electricite travaux": "105", "eclairage public": "102", "photovoltaique": "476", "menuiserie": "222",
    "vitrerie": "363", "peinture travaux": "264", "gros oeuvre": "144", "maconnerie": "195",
    "plomberie travaux": "270", "sanitaire": "319", "voirie": "365", "voirie et reseaux divers": "366",
    "terrassement": "341", "assainissement": "18", "chauffage travaux": "61", "ventilation": "360",
    "climatisation": "62", "espaces verts": "116", "couverture": "74", "zinguerie": "372",
    "charpente": "57", "demolition": "87", "curage": "78", "amiante desamiantage": "479",
    "etancheite": "117", "cloison faux plafond": "63", "platrerie": "269", "revetements de sols": "308",
    "carrelage": "53", "revetements muraux": "309", "serrurerie": "321", "metallerie": "223",
    "cloture": "64", "ascenseur": "17", "bardage": "30", "ravalement": "299", "isolation": "169",
}


def _cpv_normalise(code) -> str:
    return re.sub(r"\D", "", str(code or ""))[:8]


def _metiers_cpv(code) -> tuple[str, ...]:
    chiffres = _cpv_normalise(code)
    if len(chiffres) < 5 or not chiffres.startswith("45"):
        return ()
    for longueur in range(len(chiffres), 3, -1):
        trouve = CPV_PREFIXES.get(chiffres[:longueur])
        if trouve:
            return trouve
    return ()


def _metiers_descripteur(entree) -> tuple[str, ...]:
    if isinstance(entree, dict):
        code, libelle = entree.get("code"), entree.get("libelle")
    else:
        code, libelle = entree, entree
    code = str(code).strip() if code is not None else ""
    if code in DESCRIPTEURS:
        return DESCRIPTEURS[code]
    cle = _LIBELLE_VERS_CODE.get(normaliser(str(libelle) if libelle is not None else ""))
    return DESCRIPTEURS.get(cle, ()) if cle else ()


def deduire_metiers(codes_cpv: Iterable | None, descripteurs: Iterable | None, objet: str | None) -> list[str]:
    """Métiers d'un avis, dans l'ordre de la liste `LIBELLES`, jamais vide (« autre » à défaut).

    `codes_cpv` : codes à 8 chiffres (avec ou sans tiret de contrôle). `descripteurs` : codes
    BOAMP, libellés, ou dicts {code, libelle}. `objet` : texte libre, utilisé seulement si ni le
    CPV ni les descripteurs ne désignent de métier.
    """
    trouves: set[str] = set()
    for code in codes_cpv or ():
        trouves.update(_metiers_cpv(code))
    for entree in descripteurs or ():
        trouves.update(_metiers_descripteur(entree))
    if not trouves:
        texte = normaliser(objet)
        for metier, motif in _MOTIFS_OBJET_COMPILES():
            if texte and motif.search(texte):
                trouves.add(metier)
    if not trouves:
        return ["autre"]
    return [m for m in LIBELLES if m in trouves]


def _MOTIFS_OBJET_COMPILES():
    return _MOTIFS_OBJET
