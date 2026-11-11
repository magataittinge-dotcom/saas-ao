"""Droit à l'oubli : suppression de TOUTES les lignes d'une organisation, dans une seule transaction (audit S-02).

La liste des tables n'est plus écrite à la main (elle a déjà oublié `quota_consumptions` et `notifications` (R6), puis
`couts_ia`, `preferences_veille`, `lectures_depot`, `propositions_profil` et `plans_memoire` (S-02) : la suppression
finissait en 500 pour tout client réel). Elle se déduit des modèles :
- une ligne appartient à l'organisation si sa colonne `organization_id` la désigne ;
- ou si l'une de ses clés étrangères désigne une ligne qui lui appartient (projets, utilisateurs, documents, lectures…).
Les tables sont parcourues des parents vers les enfants pour trouver les lignes, puis vidées des enfants vers les
parents : aucune clé étrangère n'est violée, quelle que soit la table ajoutée demain.

Les fichiers déposés ne sont pas touchés ici : `fichiers_a_purger` les liste, l'appelant les efface APRÈS le commit.
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _lignes_de_l_organisation(db: Session, org_id: str) -> list[tuple]:
    """[(table, condition)] des parents vers les enfants, pour les seules tables qui ont des lignes à supprimer."""
    from database import Base
    import models  # noqa: F401 — toutes les tables enregistrées

    conditions: dict = {}
    valeurs: dict = {}

    def valeurs_de(colonne) -> list:
        cle = (colonne.table.name, colonne.name)
        if cle not in valeurs:
            valeurs[cle] = list(db.execute(select(colonne).where(conditions[colonne.table])).scalars().all())
        return valeurs[cle]

    ordre = []
    for table in Base.metadata.sorted_tables:
        parts = []
        if table.name == "organizations":
            parts.append(table.c.id == org_id)
        elif "organization_id" in table.c:
            parts.append(table.c.organization_id == org_id)
        for fk in table.foreign_keys:
            parent = fk.column.table
            if parent is table or parent not in conditions:
                continue
            vals = valeurs_de(fk.column)
            if vals:
                parts.append(fk.parent.in_(vals))
        if parts:
            conditions[table] = or_(*parts)
            ordre.append(table)
    return [(t, conditions[t]) for t in ordre]


def supprimer_organisation(db: Session, org_id: str) -> dict:
    """Supprime toutes les lignes de l'organisation SANS commit (l'appelant valide). Rend les identifiants des projets
    et les `file_url` des lignes supprimées, pour la purge des fichiers après le commit."""
    tables = _lignes_de_l_organisation(db, org_id)
    fichiers: list[str] = []
    project_ids: list[str] = []
    for table, condition in tables:
        if "file_url" in table.c:
            fichiers += [u for u in db.execute(select(table.c.file_url).where(condition)).scalars().all() if u]
        if table.name == "projects":
            project_ids = list(db.execute(select(table.c.id).where(condition)).scalars().all())
    for table, condition in reversed(tables):
        db.execute(delete(table).where(condition))
    return {"project_ids": project_ids, "fichiers": fichiers, "tables": [t.name for t, _ in tables]}


def purger_fichiers(uploads_root: Path, org_id: str, project_ids: list[str], fichiers: list[str]) -> None:
    """Après le commit : dossiers des projets et de l'organisation, puis chaque fichier encore référencé ailleurs sous
    `uploads/`. Jamais hors du dossier des dépôts ; une erreur de disque est journalisée, sans annuler la suppression."""
    racine = uploads_root.resolve()
    cibles = [uploads_root / "projects" / pid for pid in project_ids] + [uploads_root / "organizations" / org_id]
    for url in fichiers:
        cibles.append(uploads_root / str(url).removeprefix("/uploads/").lstrip("/"))
    for cible in cibles:
        try:
            chemin = cible.resolve()
            if chemin == racine or racine not in chemin.parents:
                continue
            if chemin.is_dir():
                shutil.rmtree(chemin, ignore_errors=True)
            elif chemin.exists():
                chemin.unlink()
        except OSError:
            logger.warning("Suppression du compte : un fichier de l'organisation %s n'a pas pu être effacé", org_id)
