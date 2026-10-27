"""Purge des AO supprimés depuis plus de N jours (B18).

Un AO supprimé n'est que « soft-deleted » (``deleted_at``) : ses pièces restent sur le disque
du VPS (50 Go, un DCE pèse jusqu'à 380 Mo). Cette purge efface, pour les projets supprimés
depuis plus de ``SYNORIX_PURGE_AO_JOURS`` jours (30 par défaut) : les fichiers de
``uploads/projects/<id_du_projet>/`` puis les lignes en base (pièces, exigences, checklist,
mémoire, projet).

Sécurité d'abord :
- ``SYNORIX_PURGE_AO_ACTIVE=0`` (défaut) : SIMULATION. On compte (projets, fichiers, octets) et
  on journalise ce qui serait supprimé ; rien n'est touché. ``=1`` pour purger pour de vrai.
- Rien n'est supprimé hors de ``uploads/projects/<id>/`` : chemins résolus, identifiant de
  projet strictement ``[A-Za-z0-9_-]+``, dossier jamais un lien symbolique, liens symboliques
  du dossier retirés sans jamais suivre leur cible.
- Un fichier encore référencé AILLEURS (pièce du coffre-fort, pièce d'un autre AO non purgé,
  DPGF remplie d'un autre AO) est conservé, même s'il se trouve dans le dossier du projet.
- Le journal ne contient que des comptes et des octets : jamais de nom de projet, de nom de
  fichier, de chemin ni de donnée personnelle.
- Les aperçus de « Voir dans le DCE » sont rangés par CONTENU (hachage), pas par projet
  (services/cache_apercus.py) : il n'y a rien à retirer par projet, l'éviction LRU les
  renouvelle. Les fichiers PDF convertis pour l'aperçu vivent dans le dossier du projet et
  partent avec lui.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from models.checklist_item import ChecklistItem
from models.compliance_item import ComplianceItem
from models.document import Document
from models.memoire import MemoireTechnique
from models.project import Project, ProjectDocument

logger = logging.getLogger(__name__)

JOURS_DEFAUT = 30
_ID_SUR = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def jours_de_conservation() -> int:
    """``SYNORIX_PURGE_AO_JOURS`` (défaut 30). Une valeur illisible ou < 1 revient à 30."""
    try:
        n = int(os.environ.get("SYNORIX_PURGE_AO_JOURS", "").strip() or JOURS_DEFAUT)
    except ValueError:
        return JOURS_DEFAUT
    return n if n >= 1 else JOURS_DEFAUT


def purge_active() -> bool:
    """``SYNORIX_PURGE_AO_ACTIVE=1`` pour purger pour de vrai ; tout le reste = simulation."""
    return os.environ.get("SYNORIX_PURGE_AO_ACTIVE", "0").strip() == "1"


@dataclass
class BilanPurge:
    active: bool
    jours: int
    projets: int = 0
    fichiers: int = 0
    octets: int = 0
    conserves: int = 0          # fichiers gardés car encore référencés ailleurs
    ignores: int = 0            # projets dont le dossier n'a pas pu être traité sans risque
    erreurs: int = 0
    _vus: set = field(default_factory=set, repr=False)

    def en_dict(self) -> dict:
        return {k: getattr(self, k) for k in (
            "active", "jours", "projets", "fichiers", "octets", "conserves", "ignores", "erreurs")}


def _racine_uploads() -> Path:
    from services.file_storage import UPLOADS_ROOT
    return UPLOADS_ROOT


def _dossier_du_projet(project_id: str, uploads_root: Path) -> Path | None:
    """Dossier ``uploads/projects/<id>`` résolu, ou None s'il n'existe pas / n'est pas sûr."""
    if not _ID_SUR.match(project_id or ""):
        return None
    base = (uploads_root / "projects").resolve()
    brut = base / project_id
    if brut.is_symlink() or not brut.exists():
        return None
    dossier = brut.resolve()
    if dossier.parent != base or dossier.name != project_id or not dossier.is_dir():
        return None
    return dossier


def _urls_conservees(db: Session, project_ids: set, ids_projets_purges: set) -> set:
    """URL ``/uploads/projects/<id>/…`` des fichiers de ces projets qui sont encore
    référencés par autre chose qu'un projet purgé."""
    gardes: set = set()
    for pid in project_ids:
        prefixe = f"/uploads/projects/{pid}/"
        gardes.update(u for (u,) in db.query(Document.file_url)
                      .filter(Document.file_url.startswith(prefixe, autoescape=True)))
        for col in (ProjectDocument.file_url, ProjectDocument.pdf_preview_url):
            gardes.update(
                u for (u,) in db.query(col)
                .filter(col.startswith(prefixe, autoescape=True),
                        ProjectDocument.project_id.notin_(ids_projets_purges)))
        gardes.update(
            u for (u,) in db.query(Project.dpgf_remplie_url)
            .filter(Project.dpgf_remplie_url.startswith(prefixe, autoescape=True),
                    Project.id.notin_(ids_projets_purges)))
    return gardes


def _parcourir(dossier: Path, uploads_root: Path, gardes: set):
    """(à_supprimer, octets, conservés) : fichiers du dossier, sans suivre aucun lien."""
    base_url = "/uploads/" + dossier.relative_to(uploads_root.resolve()).as_posix()
    a_supprimer: list[Path] = []
    octets = conserves = 0
    for racine, dirs, fichiers in os.walk(dossier, followlinks=False):
        # Un lien symbolique vers un dossier est listé comme dossier : on retire le lien
        # lui-même, jamais son contenu.
        fichiers = list(fichiers) + [d for d in dirs if (Path(racine) / d).is_symlink()]
        for nom in fichiers:
            chemin = Path(racine) / nom
            rel = chemin.relative_to(dossier).as_posix()
            if f"{base_url}/{rel}" in gardes:
                conserves += 1
                continue
            try:
                taille = 0 if chemin.is_symlink() else chemin.stat().st_size
            except OSError:
                taille = 0
            a_supprimer.append(chemin)
            octets += taille
    return a_supprimer, octets, conserves


def _supprimer_fichiers(fichiers: list[Path], dossier: Path) -> int:
    """Supprime, en revérifiant chaque chemin RÉSOLU du parent contre le dossier du projet."""
    n = 0
    for chemin in fichiers:
        try:
            parent = chemin.parent.resolve()
            if parent != dossier and dossier not in parent.parents:
                continue                    # ne devrait pas arriver : jamais hors du dossier
            chemin.unlink()                 # un lien symbolique est retiré lui-même, pas sa cible
            n += 1
        except FileNotFoundError:
            continue
    # Dossiers devenus vides (du plus profond au plus haut) ; un dossier non vide reste.
    for racine, dirs, _f in os.walk(dossier, topdown=False, followlinks=False):
        for d in dirs:
            try:
                (Path(racine) / d).rmdir()
            except OSError:
                pass
    try:
        dossier.rmdir()
    except OSError:
        pass
    return n


def _supprimer_lignes(db: Session, project_id: str) -> None:
    """Lignes du projet, par suppressions groupées (sans charger les textes extraits).
    Ordre : la checklist référence les pièces ; la quote-part de quota (sans clé étrangère)
    est conservée pour les statistiques d'usage."""
    for modele in (ChecklistItem, ComplianceItem, MemoireTechnique, ProjectDocument):
        db.query(modele).filter(modele.project_id == project_id).delete(synchronize_session=False)
    db.query(Project).filter(Project.id == project_id).delete(synchronize_session=False)


def purger_ao_supprimes(
    db: Session,
    *,
    maintenant: datetime | None = None,
    uploads_root: Path | None = None,
    active: bool | None = None,
    jours: int | None = None,
) -> BilanPurge:
    """Purge (ou simule) les projets supprimés depuis plus de ``jours`` jours.

    Réglages lus à l'appel (``SYNORIX_PURGE_AO_JOURS`` / ``SYNORIX_PURGE_AO_ACTIVE``) sauf si
    passés en argument. Idempotent : un projet purgé n'existe plus, un projet dont les
    fichiers sont déjà partis est simplement retiré de la base."""
    jours = jours_de_conservation() if jours is None else jours
    active = purge_active() if active is None else active
    maintenant = maintenant or datetime.utcnow()
    uploads_root = (uploads_root or _racine_uploads())
    bilan = BilanPurge(active=active, jours=jours)

    seuil = maintenant - timedelta(days=jours)
    candidats = db.query(Project).filter(
        Project.deleted_at.isnot(None), Project.deleted_at < seuil).all()
    ids_purges = {p.id for p in candidats}
    if not candidats:
        _journaliser(bilan)
        return bilan

    for p in candidats:
        try:
            pid = p.id
            dossier = _dossier_du_projet(pid, uploads_root)
            fichiers: list[Path] = []
            if dossier is not None:
                gardes = _urls_conservees(db, {pid}, ids_purges)
                fichiers, octets, conserves = _parcourir(dossier, uploads_root, gardes)
                bilan.octets += octets
                bilan.conserves += conserves
                bilan.fichiers += len(fichiers)
            elif _ID_SUR.match(pid or "") and os.path.lexists(uploads_root / "projects" / pid):
                bilan.ignores += 1          # présent mais pas sûr (lien symbolique…) : on ne touche à rien
                continue
            bilan.projets += 1
            if not active:
                continue
            if dossier is not None:
                _supprimer_fichiers(fichiers, dossier)
            _supprimer_lignes(db, pid)
            db.commit()
        except Exception:
            db.rollback()
            bilan.erreurs += 1
            logger.exception("Purge AO : échec sur un projet (le suivant continue)")
    _journaliser(bilan)
    return bilan


def _journaliser(b: BilanPurge) -> None:
    """Comptes et octets seulement (RGPD) : ni nom de projet, ni nom de fichier, ni chemin."""
    mo = b.octets / (1024 * 1024)
    if b.active:
        logger.info(
            "Purge AO (réelle, > %d j) : %d projet(s), %d fichier(s), %.1f Mo libérés, "
            "%d conservé(s), %d ignoré(s), %d erreur(s)",
            b.jours, b.projets, b.fichiers, mo, b.conserves, b.ignores, b.erreurs)
    else:
        logger.info(
            "Purge AO (SIMULATION, > %d j) : supprimerait %d projet(s), %d fichier(s), %.1f Mo ; "
            "%d conservé(s), %d ignoré(s)",
            b.jours, b.projets, b.fichiers, mo, b.conserves, b.ignores)
