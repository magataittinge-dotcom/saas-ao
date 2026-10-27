"""Cache disque des aperçus de « Voir dans le DCE » (images WebP de pages et de passages).

Adressé par CONTENU : clé = sha256( empreinte du fichier + page + cadrage + largeur + vue +
version du rendu ). Le même PDF redéposé (ou dans un autre AO) réutilise ses images ; un
fichier modifié change d'empreinte, donc de clés. Le nom d'une entrée est un hachage : aucune
donnée du DCE (ni nom de pièce, ni texte, ni identifiant d'AO ou d'organisation) dans le
disque du cache. Le contrôle d'accès reste à la route : le cache ne sait rien des organisations.

- Dossier HORS webroot : ``backend/cache/apercus`` par défaut (``SYNORIX_CACHE_APERCUS_DIR``),
  jamais servi directement par nginx (seulement par la route, après le contrôle d'appartenance).
- Plafond total ``SYNORIX_CACHE_APERCUS_MO`` (défaut 2 048 Mo). Justification : le disque du
  KVM 1 fait 50 Go, dont jusqu'à ~8 Go de DCE (20 AO mesurés = 7,67 Go), la base, les journaux et
  les sauvegardes ; un passage consulté pèse ~30 Ko (A, §5), soit ~70 000 vues pour 2 Go — de quoi
  garder les aperçus de plusieurs dizaines d'AO — pour 4 % du disque.
- Éviction LRU : la lecture « touche » l'entrée (date de modification) ; au-delà du plafond, les
  plus anciennes sont supprimées jusqu'à 90 % du plafond (pas de balayage à chaque écriture).
- Écritures atomiques : fichier temporaire dans le même dossier puis ``os.replace`` — un lecteur
  ne voit jamais un fichier tronqué, et deux écritures simultanées de la même clé sont sans danger.
- L'empreinte d'un gros fichier (jusqu'à 380 Mo) est calculée une fois : mémoïsée par (chemin,
  taille, date de modification).
"""
from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Callable, Optional, Sequence

logger = logging.getLogger(__name__)

__all__ = ["CacheApercus", "VERSION_RENDU", "PLAFOND_MO_DEFAUT", "cache_par_defaut",
           "empreinte_fichier", "cle_apercu"]

# À incrémenter quand le rendu change (moteur, qualité, aplatissement…) : les anciennes entrées
# ne sont plus jamais lues et s'éteignent par l'éviction.
VERSION_RENDU = 1
PLAFOND_MO_DEFAUT = 2048
_RACINE_BACKEND = Path(__file__).resolve().parents[1]
_SUFFIXE = ".webp"
_PREFIXE_TEMP = ".tmp-"
_TEMP_PERIME_S = 3600
_RESERVE_EVICTION = 0.9          # on évince jusqu'à 90 % du plafond
_RESCAN_TOUTES_LES = 500         # écritures entre deux recomptes complets (dérive, autres processus)
_MEMO_MAX = 512


# ─── Empreinte du fichier, mémoïsée ───────────────────────────────────────────

_memo: "OrderedDict[tuple, str]" = OrderedDict()
_verrou_memo = threading.Lock()


def _hacher(chemin: str) -> str:
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def empreinte_fichier(chemin) -> str:
    """sha256 du contenu du fichier. Mémoïsé par (chemin, taille, date de modification) : un
    fichier de 380 Mo n'est relu qu'une fois, et toute modification donne une autre empreinte."""
    chemin = os.fspath(chemin)
    st = os.stat(chemin)
    cle = (os.path.abspath(chemin), st.st_size, st.st_mtime_ns)
    with _verrou_memo:
        if cle in _memo:
            _memo.move_to_end(cle)
            return _memo[cle]
    valeur = _hacher(chemin)          # hors verrou : un gros fichier ne bloque pas les autres
    with _verrou_memo:
        _memo[cle] = valeur
        while len(_memo) > _MEMO_MAX:
            _memo.popitem(last=False)
    return valeur


def cle_apercu(empreinte: str, page_index: int, cadrage: Optional[Sequence[float]],
               largeur_px: int, vue: str) -> str:
    """Clé (64 hex) d'un aperçu. ``cadrage`` en fractions, arrondi à 4 décimales (le bruit de
    calcul flottant ne doit pas créer de clés distinctes) ; None = page entière."""
    if cadrage is None:
        cadre = "-"
    else:
        cadre = ",".join(f"{float(v):.4f}" for v in cadrage)
    brut = f"v{VERSION_RENDU}|{empreinte}|{int(page_index)}|{cadre}|{int(largeur_px)}|{vue}"
    return hashlib.sha256(brut.encode("utf-8")).hexdigest()


# ─── Le cache ─────────────────────────────────────────────────────────────────

class CacheApercus:
    def __init__(self, dossier: Optional[os.PathLike] = None, plafond_octets: Optional[int] = None) -> None:
        if dossier is None:
            dossier = os.environ.get("SYNORIX_CACHE_APERCUS_DIR") or _RACINE_BACKEND / "cache" / "apercus"
        if plafond_octets is None:
            try:
                mo = int(os.environ.get("SYNORIX_CACHE_APERCUS_MO", "").strip() or PLAFOND_MO_DEFAUT)
            except ValueError:
                mo = PLAFOND_MO_DEFAUT
            plafond_octets = max(1, mo) * 1024 * 1024
        self.dossier = Path(dossier)
        self.plafond = int(plafond_octets)
        self._verrou = threading.Lock()
        self._total: Optional[int] = None       # octets estimés ; None = pas encore compté
        self._ecritures = 0

    # ── chemins ──
    def _chemin(self, cle: str) -> Path:
        return self.dossier / cle[:2] / f"{cle}{_SUFFIXE}"

    def cle(self, chemin, page_index: int, cadrage: Optional[Sequence[float]],
            largeur_px: int, vue: str) -> str:
        return cle_apercu(empreinte_fichier(chemin), page_index, cadrage, largeur_px, vue)

    # ── lecture / écriture ──
    def lire(self, cle: str) -> Optional[bytes]:
        """Les octets de l'entrée, ou None. Une lecture « touche » l'entrée (LRU)."""
        chemin = self._chemin(cle)
        try:
            octets = chemin.read_bytes()
        except OSError:
            return None
        try:
            os.utime(chemin)
        except OSError:
            pass
        return octets

    def ecrire(self, cle: str, octets: bytes) -> bool:
        """Écrit l'entrée de façon atomique. False si elle dépasse à elle seule le plafond."""
        taille = len(octets)
        if taille > self.plafond:
            return False
        chemin = self._chemin(cle)
        chemin.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporaire = chemin.parent / f"{_PREFIXE_TEMP}{uuid.uuid4().hex}"
        try:
            with open(temporaire, "wb") as f:
                f.write(octets)
            existait = chemin.exists()
            os.replace(temporaire, chemin)
        except BaseException:
            try:
                temporaire.unlink()
            except OSError:
                pass
            raise
        with self._verrou:
            self._ecritures += 1
            if self._total is None or self._ecritures % _RESCAN_TOUTES_LES == 0:
                self._total = None
            elif not existait:
                self._total += taille
            a_evincer = self._total is None or self._total > self.plafond
        if a_evincer:
            self._evincer()
        return True

    def obtenir_ou_calculer(self, chemin, page_index: int, cadrage: Optional[Sequence[float]],
                            largeur_px: int, vue: str, calculer: Callable[[], bytes]) -> bytes:
        """L'aperçu en cache, sinon ``calculer()`` puis mise en cache. Bloquant."""
        cle = self.cle(chemin, page_index, cadrage, largeur_px, vue)
        octets = self.lire(cle)
        if octets is not None:
            return octets
        octets = calculer()
        try:
            self.ecrire(cle, octets)
        except OSError as e:       # disque plein, droits : le cache ne fait jamais échouer l'aperçu
            logger.warning("Cache des aperçus : écriture impossible (%s)", type(e).__name__)
        return octets

    # ── éviction ──
    def taille_totale(self) -> int:
        return sum(taille for _, taille, _ in self._entrees())

    def _entrees(self) -> list[tuple[Path, int, float]]:
        """(chemin, taille, date de modification) de chaque entrée ; supprime les temporaires périmés."""
        trouvees = []
        maintenant = time.time()
        try:
            sous_dossiers = [d for d in os.scandir(self.dossier) if d.is_dir(follow_symlinks=False)]
        except OSError:
            return []
        for sd in sous_dossiers:
            try:
                for f in os.scandir(sd.path):
                    try:
                        st = f.stat(follow_symlinks=False)
                    except OSError:
                        continue
                    if f.name.startswith(_PREFIXE_TEMP):
                        if maintenant - st.st_mtime > _TEMP_PERIME_S:
                            try:
                                os.unlink(f.path)
                            except OSError:
                                pass
                        continue
                    if f.name.endswith(_SUFFIXE):
                        trouvees.append((Path(f.path), st.st_size, st.st_mtime))
            except OSError:
                continue
        return trouvees

    def _evincer(self) -> None:
        """Recompte le dossier ; au-delà du plafond, supprime les plus anciennes entrées
        jusqu'à 90 % du plafond."""
        with self._verrou:
            entrees = self._entrees()
            total = sum(t for _, t, _ in entrees)
            if total > self.plafond:
                cible = int(self.plafond * _RESERVE_EVICTION)
                for chemin, taille, _ in sorted(entrees, key=lambda e: e[2]):
                    if total <= cible:
                        break
                    try:
                        os.unlink(chemin)
                        total -= taille
                    except FileNotFoundError:
                        total -= taille
                    except OSError:
                        continue
            self._total = total


_defaut: Optional[CacheApercus] = None
_verrou_defaut = threading.Lock()


def cache_par_defaut() -> CacheApercus:
    """Le cache de l'appli (dossier et plafond lus dans l'environnement au premier appel)."""
    global _defaut
    with _verrou_defaut:
        if _defaut is None:
            _defaut = CacheApercus()
        return _defaut
