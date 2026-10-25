"""Ré-extraction des .docx déjà en base avec la lecture de B3.

Depuis B3, le texte d'un .docx garde ses tableaux, dans l'ordre du document.
Les nouveaux dépôts en profitent tout de suite ; les documents déjà en base
gardent leur ancien texte (paragraphes seuls). Pas de ré-extraction
automatique : le texte change, et les extraits déjà ancrés des AO analysés
pourraient ne plus se retrouver. Ce script mesure d'abord, et n'écrit que sur
demande.

Par défaut (--dry-run) : rien n'est écrit. Pour les .docx de DCE : documents
concernés, ancien et nouveau nombre de caractères, extraits ancrés qui ne se
retrouveraient plus dans le nouveau texte.

--ecrire : remplace le texte des documents qui changent, sauf ceux dont un
extrait ancré ne se retrouverait plus (listés, laissés tels quels).

Usage (depuis backend/) :
    venv/bin/python scripts/reextraire_docx.py                  # comptage seul
    venv/bin/python scripts/reextraire_docx.py --detail         # un document par ligne
    venv/bin/python scripts/reextraire_docx.py --projet <id>    # un seul AO
    venv/bin/python scripts/reextraire_docx.py --ecrire [--projet <id>]

N'importe pas `main` (aucune réconciliation lancée). Base : celle de
backend/.env, dont l'adresse n'est jamais affichée.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@dataclass
class Bilan:
    examines: int = 0
    introuvables: int = 0
    non_lisibles: int = 0
    inchanges: int = 0
    modifies: int = 0
    caracteres_avant: int = 0     # documents modifiés seulement
    caracteres_apres: int = 0
    ancres: int = 0               # extraits retrouvés dans l'ancien texte des documents modifiés
    ancres_perdus: int = 0        # … et absents du nouveau
    ecrits: int = 0
    gardes: List[str] = field(default_factory=list)  # ids laissés tels quels (ancrages perdus)


def examiner(
    db,
    racine_uploads: Path,
    projet: Optional[str] = None,
    ecrire: bool = False,
    detail: bool = False,
    sortie: Callable[[str], None] = print,
) -> Bilan:
    """Relit chaque .docx de DCE avec la lecture B3 et compare à son texte en base."""
    from models.compliance_item import ComplianceItem
    from models.project import Project, ProjectDocument
    from services.ai.excerpt_anchor import _normalize
    from services.document_processor import DocumentProcessor

    requete = (
        db.query(ProjectDocument.id)
        .join(Project, Project.id == ProjectDocument.project_id)
        .filter(
            Project.deleted_at.is_(None),
            ProjectDocument.file_name.ilike("%.docx"),
            ProjectDocument.file_url.like("/uploads/%"),
            ProjectDocument.is_user_completed.is_(False),  # pièces du DCE, pas les trames remplies
        )
    )
    if projet:
        requete = requete.filter(ProjectDocument.project_id == projet)
    ids = [i for (i,) in requete.order_by(ProjectDocument.project_id, ProjectDocument.id).all()]

    extraits_par_projet: Dict[str, List[str]] = {}
    bilan = Bilan()
    for doc_id in ids:
        doc = db.get(ProjectDocument, doc_id)  # un texte à la fois en mémoire
        bilan.examines += 1
        chemin = racine_uploads / doc.file_url.removeprefix("/uploads/")
        if not chemin.is_file():
            bilan.introuvables += 1
            continue
        nouveau, _pages, avertissement = DocumentProcessor().extract_ex(
            chemin.read_bytes(), doc.file_name)
        if avertissement is not None:
            bilan.non_lisibles += 1
            continue
        nouveau = nouveau.replace("\x00", "")  # comme à l'extraction du dépôt
        ancien = doc.extracted_text or ""
        if nouveau == ancien:
            bilan.inchanges += 1
            db.expire(doc)
            continue

        if doc.project_id not in extraits_par_projet:
            # Extraits ancrés de l'AO, normalisés comme à l'ancrage (espaces,
            # apostrophes, accents) : la même comparaison que l'analyse.
            extraits_par_projet[doc.project_id] = [
                n for n in (
                    _normalize(e) for (e,) in db.query(ComplianceItem.source_excerpt).filter(
                        ComplianceItem.project_id == doc.project_id,
                        ComplianceItem.source_excerpt.isnot(None),
                    ).all()
                ) if n.strip()
            ]
        ancien_n, nouveau_n = _normalize(ancien), _normalize(nouveau)
        ancres = [e for e in extraits_par_projet[doc.project_id] if e in ancien_n]
        perdus = sum(1 for e in ancres if e not in nouveau_n)

        bilan.modifies += 1
        bilan.caracteres_avant += len(ancien)
        bilan.caracteres_apres += len(nouveau)
        bilan.ancres += len(ancres)
        bilan.ancres_perdus += perdus
        if detail:
            sortie(
                f"  projet {doc.project_id[:8]} · document {doc.id[:8]} · {doc.file_name} : "
                f"{_milliers(len(ancien))} → {_milliers(len(nouveau))} caractères ; "
                f"{len(ancres)} extraits ancrés, dont {perdus} qui ne se retrouveraient plus"
            )
        if ecrire:
            if perdus:
                bilan.gardes.append(doc.id)
            else:
                doc.extracted_text = nouveau
                doc.extraction_warning = None
                db.commit()
                bilan.ecrits += 1
        db.expire(doc)
    return bilan


def _milliers(n: int, signe: bool = False) -> str:
    return (f"{n:+,}" if signe else f"{n:,}").replace(",", " ")


def afficher(bilan: Bilan, ecrire: bool, sortie: Callable[[str], None] = print) -> None:
    ecart = bilan.caracteres_apres - bilan.caracteres_avant
    part = f", {ecart / bilan.caracteres_avant * 100:+.0f} %" if bilan.caracteres_avant else ""
    sortie(f"  .docx de DCE examinés : {bilan.examines}")
    sortie(f"  fichiers introuvables sur le disque : {bilan.introuvables}")
    sortie(f"  fichiers non lisibles : {bilan.non_lisibles}")
    sortie(f"  texte inchangé : {bilan.inchanges}")
    sortie(f"  texte modifié : {bilan.modifies}")
    sortie(f"  caractères des documents modifiés : {_milliers(bilan.caracteres_avant)} → "
           f"{_milliers(bilan.caracteres_apres)} ({_milliers(ecart, signe=True)}{part})")
    sortie(f"  extraits ancrés dans ces documents : {bilan.ancres}, "
           f"dont {bilan.ancres_perdus} qui ne se retrouveraient plus")
    if ecrire:
        sortie(f"  documents mis à jour : {bilan.ecrits}")
        if bilan.gardes:
            sortie(f"  laissés tels quels (extraits ancrés à retrouver) : {len(bilan.gardes)} — "
                   + ", ".join(i[:8] for i in bilan.gardes))


def main(argv: Optional[List[str]] = None) -> int:
    a = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = a.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true",
                      help="comptage seul, rien n'est écrit (par défaut)")
    mode.add_argument("--ecrire", action="store_true",
                      help="remplace le texte des documents qui changent sans perdre d'ancrage")
    a.add_argument("--projet", help="limite à un projet (id)")
    a.add_argument("--detail", action="store_true", help="une ligne par document modifié")
    args = a.parse_args(argv)

    from database import SessionLocal
    from services.file_storage import UPLOADS_ROOT

    print("Ré-extraction des .docx (lecture B3) — "
          + ("écriture des documents sans ancrage perdu." if args.ecrire
             else "comptage seul, rien n'est écrit."))
    db = SessionLocal()
    try:
        bilan = examiner(db, UPLOADS_ROOT, projet=args.projet,
                         ecrire=args.ecrire, detail=args.detail)
    finally:
        db.close()
    afficher(bilan, args.ecrire)
    return 0


if __name__ == "__main__":
    sys.exit(main())
