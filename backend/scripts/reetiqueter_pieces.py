"""Réétiquetage des pièces déjà en base avec les règles du bloc 2.

Depuis le bloc 2, document_tagger teste le type d'une pièce avant son nom,
travaille en mots entiers et rattache le lot 00 à tous les lots. Les nouveaux
dépôts en profitent tout de suite ; les pièces déjà en base gardent leur
ancienne étiquette (par exemple le CCTP « lot 10 Plomberie » de Gueux, en
« info », donc jamais envoyé à l'IA). Ce script mesure d'abord, et n'écrit que
sur demande.

Par défaut (--dry-run) : rien n'est écrit. Pour les pièces du DCE : pièces dont
l'étiquette changerait, pièces rendues à l'analyse (« info » → lot ou commun),
pièces qui la quitteraient (→ « info »), caractères concernés, AO déjà
analysés touchés (à réanalyser pour en profiter).

--ecrire : remplace l'étiquette des pièces qui changent.

Usage (depuis backend/) :
    venv/bin/python scripts/reetiqueter_pieces.py                 # comptage seul
    venv/bin/python scripts/reetiqueter_pieces.py --detail        # une ligne par pièce
    venv/bin/python scripts/reetiqueter_pieces.py --projet <id>   # un seul AO
    venv/bin/python scripts/reetiqueter_pieces.py --ecrire [--projet <id>]

N'importe pas `main` (aucune réconciliation lancée). Base : celle de
backend/.env, dont l'adresse n'est jamais affichée.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional, Set

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@dataclass
class Bilan:
    examinees: int = 0
    inchangees: int = 0
    changees: int = 0
    rendues: int = 0                # « info » → lot ou commun : l'IA les lira
    retirees: int = 0               # → « info » : l'IA ne les lira plus
    autres: int = 0                 # lot ou commun changé (lot 00 → commun, « ilot »…)
    caracteres_rendus: int = 0
    caracteres_retires: int = 0
    projets_analyses: Set[str] = field(default_factory=set)
    ecrites: int = 0


def _info(etiquettes) -> bool:
    return bool(etiquettes) and all(t == "info" for t in etiquettes)


def examiner(
    db,
    projet: Optional[str] = None,
    ecrire: bool = False,
    detail: bool = False,
    sortie: Callable[[str], None] = print,
) -> Bilan:
    """Recalcule l'étiquette de chaque pièce du DCE et la compare à celle en base."""
    from sqlalchemy import func

    from models.compliance_item import ComplianceItem
    from models.project import Project, ProjectDocument
    from services.document_tagger import assign_document_lots

    requete = (
        db.query(ProjectDocument.id, ProjectDocument.project_id, ProjectDocument.file_name,
                 ProjectDocument.type, ProjectDocument.related_lots,
                 func.coalesce(func.length(ProjectDocument.extracted_text), 0))
        .join(Project, Project.id == ProjectDocument.project_id)
        .filter(Project.deleted_at.is_(None),
                ProjectDocument.is_user_completed.is_(False))   # pièces du DCE seulement
    )
    if projet:
        requete = requete.filter(ProjectDocument.project_id == projet)
    lignes = requete.order_by(ProjectDocument.project_id, ProjectDocument.id).all()
    analyses = {pid for (pid,) in db.query(ComplianceItem.project_id).distinct()}

    bilan = Bilan()
    for doc_id, project_id, nom, type_, ancienne, taille in lignes:
        bilan.examinees += 1
        nouvelle = assign_document_lots(nom, type_ or "autre")
        if list(ancienne or []) == nouvelle:
            bilan.inchangees += 1
            continue
        bilan.changees += 1
        if _info(ancienne) and not _info(nouvelle):
            bilan.rendues += 1
            bilan.caracteres_rendus += taille
        elif _info(nouvelle) and not _info(ancienne):
            bilan.retirees += 1
            bilan.caracteres_retires += taille
        else:
            bilan.autres += 1
        if project_id in analyses:
            bilan.projets_analyses.add(project_id)
        if detail:
            sortie(f"  projet {project_id[:8]} · pièce {doc_id[:8]} · {nom} ({type_}) : "
                   f"{ancienne} → {nouvelle}")
        if ecrire:
            doc = db.get(ProjectDocument, doc_id)
            doc.related_lots = nouvelle
            db.commit()
            db.expire(doc)
            bilan.ecrites += 1
    return bilan


def _milliers(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def afficher(bilan: Bilan, ecrire: bool, sortie: Callable[[str], None] = print) -> None:
    sortie(f"  pièces du DCE examinées : {bilan.examinees}")
    sortie(f"  étiquette inchangée : {bilan.inchangees}")
    sortie(f"  étiquette modifiée : {bilan.changees}")
    sortie(f"    rendues à l'analyse (« info » → lot ou commun) : {bilan.rendues} "
           f"({_milliers(bilan.caracteres_rendus)} caractères)")
    sortie(f"    retirées de l'analyse (→ « info ») : {bilan.retirees} "
           f"({_milliers(bilan.caracteres_retires)} caractères)")
    sortie(f"    autre changement de lot : {bilan.autres}")
    sortie(f"  AO déjà analysés concernés (à réanalyser pour en profiter) : "
           f"{len(bilan.projets_analyses)}")
    if ecrire:
        sortie(f"  pièces mises à jour : {bilan.ecrites}")


def main(argv: Optional[List[str]] = None) -> int:
    a = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = a.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true",
                      help="comptage seul, rien n'est écrit (par défaut)")
    mode.add_argument("--ecrire", action="store_true",
                      help="remplace l'étiquette des pièces qui changent")
    a.add_argument("--projet", help="limite à un projet (id)")
    a.add_argument("--detail", action="store_true", help="une ligne par pièce modifiée")
    args = a.parse_args(argv)

    from database import SessionLocal

    print("Réétiquetage des pièces (règles du bloc 2) — "
          + ("écriture des étiquettes modifiées." if args.ecrire
             else "comptage seul, rien n'est écrit."))
    db = SessionLocal()
    try:
        bilan = examiner(db, projet=args.projet, ecrire=args.ecrire, detail=args.detail)
    finally:
        db.close()
    afficher(bilan, args.ecrire)
    return 0


if __name__ == "__main__":
    sys.exit(main())
