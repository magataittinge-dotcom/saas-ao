"""Carte de situation du mémoire technique — fond Plan IGN v2 (Géoplateforme).

Remplace Google Static Maps (bloc 3, tranche B) : aucune clé, aucun coût, aucune
adresse envoyée hors UE.

  • Géocodage : `data.geopf.fr/geocodage/search` (Géoplateforme, base adresse
    nationale), sans clé.
  • Fond : tuiles WMTS « Plan IGN v2 » (`data.geopf.fr/wmts`), sans clé,
    composées en un PNG avec Pillow ; le siège (et le chantier, si le DCE en
    donne le lieu) sont marqués, reliés par un trait pointillé.
  • Licence Ouverte 2.0 : la source et la date d'extraction sont citées sous la
    carte (« Source : IGN – Plan IGN v2 (Géoplateforme), extrait du JJ/MM/AAAA »).
  • Cache disque par adresse (géocodage et image), borné ; délai court sur
    chaque appel et plafond global. Panne, délai dépassé ou adresse introuvable :
    `(None, None)` — le bloc « carte » disparaît du Word, sans texte d'attente.
  • La distance n'est jamais « en voiture » : elle est dite « à vol d'oiseau ».

Sources : nuit-25-10/D-memoire-technique.md §6 (services, licences, limites),
prototype outils/D/visuels.py (`carte_situation`).
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from pathlib import Path

import httpx

from services.lieu_chantier import libelle_source, lire_lieu

logger = logging.getLogger(__name__)

_GEOCODAGE_URL = "https://data.geopf.fr/geocodage/search"
_WMTS_URL = "https://data.geopf.fr/wmts"
_USER_AGENT = "Synorix/1.0 (memoire technique; carte de situation)"

_TIMEOUT_APPEL_S = 4.0      # délai court sur CHAQUE appel réseau
_BUDGET_TOTAL_S = 14.0      # plafond global d'une carte (géocodages + tuiles)
_SCORE_MINI = 0.4           # en dessous, l'adresse est jugée introuvable
_VALIDITE_CARTE_JOURS = 30  # une carte plus ancienne est recomposée (date à jour)
_VALIDITE_ECHEC_S = 24 * 3600
_MAX_CARTES_EN_CACHE = 200
_MAX_GEOCODAGES_EN_CACHE = 2000
_VERSION_CARTE = "1"        # à changer si la mise en page de la carte change

_LARGEUR_PX = 960
_HAUTEUR_PX = 480
_TUILE = 256

_REPERTOIRE_CACHE: Path | None = None  # tests : surchargé ; défaut ci-dessous


def _cache_dir() -> Path:
    if _REPERTOIRE_CACHE is not None:
        return _REPERTOIRE_CACHE
    from services.file_storage import UPLOADS_ROOT
    return UPLOADS_ROOT / "_cache" / "cartes"


# ── Réseau (un seul point d'entrée : simulé dans les tests) ──────────────────

def _get(url: str, params: dict, timeout: float) -> httpx.Response:
    return httpx.get(
        url, params=params, timeout=timeout,
        headers={"User-Agent": _USER_AGENT}, follow_redirects=False,
    )


# ── Géométrie ────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance à vol d'oiseau en km entre deux points GPS."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _tuile_xy(lat: float, lon: float, z: int) -> tuple[float, float]:
    """Coordonnées (fractionnaires) en tuiles Web Mercator au zoom z."""
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


# ── Cache disque ─────────────────────────────────────────────────────────────

def _cle(*morceaux: str) -> str:
    texte = "|".join(" ".join((m or "").lower().split()) for m in morceaux)
    return hashlib.sha256(texte.encode("utf-8")).hexdigest()[:32]


def _ecrire(chemin: Path, contenu: bytes) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_name(f"{chemin.name}.{os.getpid()}.tmp")
    tmp.write_bytes(contenu)
    os.replace(tmp, chemin)


def _borner(dossier: Path, motif: str, maxi: int) -> None:
    """Garde au plus `maxi` fichiers `motif` : les plus anciens partent d'abord."""
    try:
        fichiers = sorted(dossier.glob(motif), key=lambda f: f.stat().st_mtime)
        for f in fichiers[: max(0, len(fichiers) - maxi)]:
            f.unlink(missing_ok=True)
            if f.suffix == ".png":
                f.with_suffix(".json").unlink(missing_ok=True)
    except OSError:
        pass


# ── Géocodage ────────────────────────────────────────────────────────────────

class _Delai(Exception):
    """Plafond global dépassé."""


def _restant(debut: float) -> float:
    reste = _BUDGET_TOTAL_S - (time.monotonic() - debut)
    if reste <= 0.2:
        raise _Delai()
    return min(_TIMEOUT_APPEL_S, reste)


def _geocoder(adresse: str, debut: float) -> tuple[float, float] | None:
    """(lat, lon) de l'adresse, ou None si introuvable ou si le service ne répond pas."""
    if not adresse or not adresse.strip():
        return None
    fichier = _cache_dir() / f"geo-{_cle(adresse)}.json"
    try:
        c = json.loads(fichier.read_text(encoding="utf-8"))
        if c.get("introuvable"):
            if time.time() - c.get("t", 0) < _VALIDITE_ECHEC_S:
                return None
        else:
            return c["lat"], c["lon"]
    except (OSError, ValueError, KeyError):
        pass

    try:
        rep = _get(_GEOCODAGE_URL, {"q": adresse.strip()[:200], "limit": 1}, _restant(debut))
    except _Delai:
        raise
    except Exception as e:  # noqa: BLE001 — panne : pas de carte, jamais d'exception
        logger.warning("Géocodage IGN indisponible (%s)", type(e).__name__)
        return None
    if rep.status_code != 200:
        logger.warning("Géocodage IGN : HTTP %s", rep.status_code)
        return None
    try:
        feats = rep.json().get("features") or []
        if not feats or float(feats[0]["properties"].get("score", 0)) < _SCORE_MINI:
            try:
                _ecrire(fichier, json.dumps({"introuvable": True, "t": time.time()}).encode())
            except OSError:
                pass
            return None
        lon, lat = feats[0]["geometry"]["coordinates"][:2]
        lat, lon = float(lat), float(lon)
    except (ValueError, KeyError, TypeError, IndexError):
        return None
    try:
        _ecrire(fichier, json.dumps({"lat": lat, "lon": lon}).encode())
        _borner(fichier.parent, "geo-*.json", _MAX_GEOCODAGES_EN_CACHE)
    except OSError:
        pass
    return lat, lon


# ── Composition ──────────────────────────────────────────────────────────────

_CARLITO = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "carlito"


def _police(taille: int, gras: bool = False):
    """Carlito du dépôt d'abord (même police que le Word et le PDF, sans paquet
    système), puis les polices système en secours."""
    from PIL import ImageFont
    carlito = str(_CARLITO / ("Carlito-Bold.ttf" if gras else "Carlito-Regular.ttf"))
    noms = (
        (carlito, "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf") if gras
        else (carlito, "LiberationSans-Regular.ttf", "DejaVuSans.ttf")
    )
    for nom in noms:
        try:
            return ImageFont.truetype(nom, taille)
        except OSError:
            continue
    return ImageFont.load_default(size=taille)


def _choisir_vue(points: list[tuple[float, float]]) -> tuple[int, float, float]:
    # points non vide (garanti par l'appelant : `_generate` s'arrête sans point)
    """(zoom, centre_x_px, centre_y_px) : le zoom le plus fort où tous les points
    tiennent avec une marge ; un seul point : zoom de quartier."""
    if len(points) == 1:
        z = 15
        x, y = _tuile_xy(*points[0], z)
        return z, x * _TUILE, y * _TUILE
    z = 5
    xy = [_tuile_xy(la, lo, z) for la, lo in points]
    for z in range(15, 4, -1):
        xy = [_tuile_xy(la, lo, z) for la, lo in points]
        largeur = (max(p[0] for p in xy) - min(p[0] for p in xy)) * _TUILE
        hauteur = (max(p[1] for p in xy) - min(p[1] for p in xy)) * _TUILE
        if largeur < _LARGEUR_PX * 0.62 and hauteur < _HAUTEUR_PX * 0.55:
            break
    cx = (max(p[0] for p in xy) + min(p[0] for p in xy)) / 2 * _TUILE
    cy = (max(p[1] for p in xy) + min(p[1] for p in xy)) / 2 * _TUILE
    return z, cx, cy


def _telecharger_tuiles(z: int, gx0: float, gy0: float, debut: float) -> dict[tuple[int, int], bytes] | None:
    """Toutes les tuiles du cadre, en parallèle ; None dès qu'une manque (pas de carte trouée)."""
    cols = range(int(gx0 // _TUILE), int((gx0 + _LARGEUR_PX) // _TUILE) + 1)
    rangs = range(int(gy0 // _TUILE), int((gy0 + _HAUTEUR_PX) // _TUILE) + 1)
    n_max = 2 ** z

    def une(tx_ty: tuple[int, int]) -> bytes | None:
        tx, ty = tx_ty
        if not (0 <= tx < n_max and 0 <= ty < n_max):
            return b""  # hors du monde : zone laissée blanche
        try:
            rep = _get(_WMTS_URL, {
                "SERVICE": "WMTS", "REQUEST": "GetTile", "VERSION": "1.0.0",
                "LAYER": "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "STYLE": "normal",
                "TILEMATRIXSET": "PM", "TILEMATRIX": z, "TILEROW": ty, "TILECOL": tx,
                "FORMAT": "image/png",
            }, _restant(debut))
        except Exception:  # noqa: BLE001
            return None
        if rep.status_code != 200 or not rep.headers.get("content-type", "").startswith("image/"):
            return None
        if len(rep.content) > 1_000_000:
            return None
        return rep.content

    cases = [(tx, ty) for tx in cols for ty in rangs]
    with ThreadPoolExecutor(max_workers=6) as pool:
        octets = list(pool.map(une, cases))
    resultat: dict[tuple[int, int], bytes] = {}
    for case, o in zip(cases, octets):
        if o is None:
            return None
        resultat[case] = o
    return resultat


def _composer(
    points: list[tuple[str, float, float]], debut: float,
) -> tuple[bytes, float | None] | None:
    """PNG de la carte et distance à vol d'oiseau (si deux points). None si panne."""
    from PIL import Image, ImageDraw, ImageEnhance

    z, cx, cy = _choisir_vue([(la, lo) for _, la, lo in points])
    gx0, gy0 = cx - _LARGEUR_PX / 2, cy - _HAUTEUR_PX / 2
    tuiles = _telecharger_tuiles(z, gx0, gy0, debut)
    if tuiles is None:
        return None

    image = Image.new("RGB", (_LARGEUR_PX, _HAUTEUR_PX), "#FFFFFF")
    try:
        for (tx, ty), octets in tuiles.items():
            if not octets:
                continue
            tuile = Image.open(io.BytesIO(octets)).convert("RGB")
            image.paste(tuile, (int(tx * _TUILE - gx0), int(ty * _TUILE - gy0)))
    except Exception as e:  # noqa: BLE001 — tuile illisible
        logger.warning("Tuile IGN illisible (%s)", type(e).__name__)
        return None
    # Fond désaturé : il reste lisible, les repères ressortent.
    image = ImageEnhance.Color(image).enhance(0.35)
    image = ImageEnhance.Brightness(image).enhance(1.06)

    d = ImageDraw.Draw(image)
    xy = []
    for _, la, lo in points:
        x, y = _tuile_xy(la, lo, z)
        xy.append((x * _TUILE - gx0, y * _TUILE - gy0))

    if len(xy) == 2:
        (x1, y1), (x2, y2) = xy
        longueur = math.hypot(x2 - x1, y2 - y1)
        if longueur > 1:
            ux, uy = (x2 - x1) / longueur, (y2 - y1) / longueur
            pos = 0.0
            while pos < longueur:
                fin = min(pos + 12, longueur)
                d.line([(x1 + ux * pos, y1 + uy * pos), (x1 + ux * fin, y1 + uy * fin)],
                       fill="#2B3543", width=3)
                pos += 20

    police_lib = _police(20, gras=True)
    couleurs = {"Siège": "#1F5F8B", "Chantier": "#C2410C"}
    for (libelle, _, _), (x, y) in zip(points, xy):
        d.ellipse([x - 14, y - 14, x + 14, y + 14], fill=couleurs[libelle], outline="#FFFFFF", width=4)
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill="#FFFFFF")
        larg = d.textlength(libelle, font=police_lib) + 20
        lx = x + 22 if x + 22 + larg < _LARGEUR_PX else x - 22 - larg
        d.rounded_rectangle([lx, y - 17, lx + larg, y + 17], radius=6, fill="#FFFFFF", outline="#C9D1DB")
        d.text((lx + 10, y), libelle, font=police_lib, fill="#2B3543", anchor="lm")

    km = None
    if len(points) == 2:
        km = _haversine_km(points[0][1], points[0][2], points[1][1], points[1][2])
        texte = f"{_format_km(km)} à vol d'oiseau"
        police_d = _police(20, gras=True)
        larg = d.textlength(texte, font=police_d) + 28
        d.rounded_rectangle([16, 16, 16 + larg, 56], radius=8, fill="#FFFFFF", outline="#C9D1DB")
        d.text((30, 36), texte, font=police_d, fill="#2B3543", anchor="lm")

    d.rectangle([0, 0, _LARGEUR_PX - 1, _HAUTEUR_PX - 1], outline="#C9D1DB", width=2)
    tampon = io.BytesIO()
    # Palette de 256 couleurs : le fond désaturé n'y perd rien et le Word pèse ~4x moins.
    image.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(
        tampon, "PNG", optimize=True)
    return tampon.getvalue(), km


def _format_km(km: float) -> str:
    if km < 10:
        return f"{km:.1f}".replace(".", ",") + " km"
    return f"{km:.0f} km"


# ── Lieu d'exécution ────────────────────────────────────────────────────────

def lieu_execution(project) -> str | None:
    """Adresse du chantier lue dans ce que l'analyse a extrait du DCE
    (`infos_marche.lieu_execution`), jamais le nom ni l'adresse de l'acheteur.
    Seul le lieu SOURCÉ (RC ou CCAP, extrait vérifié) est utilisé : sinon None,
    et la carte ne montre que le siège de l'entreprise. L'ancien format (simple
    chaîne, sans source) n'est jamais repris."""
    lieu = lire_lieu(getattr(project, "infos_marche", None), getattr(project, "maitre_ouvrage", None))
    return lieu["adresse"] if lieu else None


def lieu_source(project) -> str | None:
    """Source montrable du lieu d'exécution : « RC, art. 2.1 », « CCAP »."""
    lieu = lire_lieu(getattr(project, "infos_marche", None), getattr(project, "maitre_ouvrage", None))
    return libelle_source(lieu) if lieu else None


# ── Point d'entrée ──────────────────────────────────────────────────────────

def _legende(points_trouves: list[str], company_address: str, project_address: str | None,
             km: float | None, jour: date, source_lieu: str | None = None) -> str:
    source = f"Source : IGN – Plan IGN v2 (Géoplateforme), extrait du {jour.strftime('%d/%m/%Y')}"
    chantier = (project_address or "").strip()
    if source_lieu:
        chantier = f"{chantier} — {source_lieu}"      # d'où vient l'adresse du chantier
    if "Chantier" in points_trouves and "Siège" in points_trouves:
        tete = (f"Situation de l'entreprise (siège : {company_address.strip()}) et du chantier "
                f"({chantier}). Distance à vol d'oiseau : {_format_km(km or 0)}")
    elif "Chantier" in points_trouves:
        tete = f"Situation du chantier ({chantier})"
    else:
        tete = f"Situation de l'entreprise — {company_address.strip()}"
    return f"{tete}. {source}"


def generate_location_map(
    company_address: str,
    project_address: str | None = None,
    source_lieu: str | None = None,
) -> tuple[bytes | None, str | None]:
    """Carte de situation (PNG) et sa légende, ou `(None, None)`.

    `project_address` : adresse du CHANTIER (voir `lieu_execution`), jamais le
    nom de l'acheteur. Sans elle, la carte ne montre que le siège. `source_lieu`
    (« RC, art. 2.1 ») est citée dans la légende, avec l'adresse. Ne lève
    jamais : panne ou adresse introuvable → pas de carte.
    """
    company_address = (company_address or "").strip()
    project_address = (project_address or "").strip() or None
    if not company_address and not project_address:
        return None, None
    try:
        return _generate(company_address, project_address, source_lieu)
    except _Delai:
        logger.warning("Carte de situation : délai global dépassé, pas de carte")
    except Exception:  # noqa: BLE001 — la carte est un plus : jamais bloquante
        logger.warning("Carte de situation échouée, pas de carte", exc_info=True)
    return None, None


def _generate(company_address: str, project_address: str | None,
              source_lieu: str | None = None) -> tuple[bytes | None, str | None]:
    debut = time.monotonic()
    dossier = _cache_dir()
    cle = _cle(_VERSION_CARTE, company_address, project_address or "")
    png, meta_f = dossier / f"carte-{cle}.png", dossier / f"carte-{cle}.json"

    # 1) Cache d'image
    try:
        meta = json.loads(meta_f.read_text(encoding="utf-8"))
        jour = datetime.strptime(meta["date"], "%Y-%m-%d").date()
        if (date.today() - jour).days < _VALIDITE_CARTE_JOURS:
            octets = png.read_bytes()
            return octets, _legende(meta["points"], company_address, project_address,
                                    meta.get("km"), jour, source_lieu)
    except (OSError, ValueError, KeyError):
        pass

    # 2) Géocodage (siège, puis chantier s'il est connu)
    points: list[tuple[str, float, float]] = []
    siege = _geocoder(company_address, debut)
    if siege:
        points.append(("Siège", *siege))
    if project_address:
        chantier = _geocoder(project_address, debut)
        if chantier:
            points.append(("Chantier", *chantier))
    if not points:
        return None, None

    # 3) Composition
    resultat = _composer(points, debut)
    if resultat is None:
        return None, None
    octets, km = resultat
    jour = date.today()
    libelles = [p[0] for p in points]
    try:
        _ecrire(png, octets)
        _ecrire(meta_f, json.dumps({"date": jour.isoformat(), "points": libelles, "km": km}).encode())
        _borner(dossier, "carte-*.png", _MAX_CARTES_EN_CACHE)
    except OSError:
        logger.warning("Cache de carte non écrit", exc_info=True)
    return octets, _legende(libelles, company_address, project_address, km, jour, source_lieu)
