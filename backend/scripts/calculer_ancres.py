"""Ancres des anciens AO — à jouer une fois au déploiement (RESTES-2, point 4).

Les AO analysés avant le calcul des ancres (sujet A, tranche A4) n'en ont pas : le premier
« Voir dans le dossier » sur une grosse pièce les calcule à la volée (A5), environ 13 s.
Cette commande les calcule d'avance, pour tous les AO, pièce par pièce, sans IA : le même
calcul qu'à la fin d'une analyse (``services.ancres_projet.calculer_et_stocker`` : PDFium
dans son processus plafonné en mémoire, un délai par pièce, un aller-retour par pièce).

Par défaut (--simulation) : rien n'est calculé ni écrit. Compte les AO concernés, les
exigences sourcées sans ancre, les pièces à lire et les exigences dont la pièce citée est
introuvable (elles gardent leur repli : la page citée).

--ecrire : calcule et range les ancres, AO par AO, pièce par pièce. Une pièce illisible ou
trop lente est comptée en échec, jamais bloquante. Relancer est sans risque : seules les
exigences encore sans ancre sont reprises.

Usage (depuis backend/, sur le VPS dans l'enveloppe S de VPS.md C2) :
    venv/bin/python scripts/calculer_ancres.py                    # simulation (par défaut)
    venv/bin/python scripts/calculer_ancres.py --projet <id>      # un seul AO
    venv/bin/python scripts/calculer_ancres.py --ecrire [--projet <id>]

N'importe pas `main` (aucune réconciliation lancée). Base : celle de l'environnement ou de
backend/.env, dont l'adresse n'est jamais affichée. Ni nom d'AO ni texte de pièce affiché :
des identifiants courts et des comptes.
"""
from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@dataclass
class Bilan:
    projets: int = 0          # AO avec au moins une exigence sourcée sans ancre
    exigences: int = 0        # exigences sourcées sans ancre
    pieces: int = 0           # pièces à lire (PDF ou tableur présents sur le disque)
    sans_piece: int = 0       # pièce citée introuvable ou absente du disque : repli sur la page citée
    ancres: int = 0           # --ecrire : ancres rangées
    passage: int = 0          #   dont le passage retrouvé dans la pièce
    page: int = 0             #   dont la page seule
    aucune: int = 0           #   dont pièce lue sans passage ni page valable
    echecs: int = 0           # --ecrire : pièces illisibles, trop lentes ou perdues
    secondes: float = 0.0


def _sans_ancre(db, projet: Optional[str]):
    """Les exigences sourcées sans ancre des AO non supprimés, rangées par AO."""
    from models.compliance_item import ComplianceItem
    from models.project import Project

    requete = (
        db.query(ComplianceItem)
        .join(Project, Project.id == ComplianceItem.project_id)
        .filter(Project.deleted_at.is_(None), ComplianceItem.source_excerpt.isnot(None))
    )
    if projet:
        requete = requete.filter(ComplianceItem.project_id == projet)
    par_projet: dict[str, list] = {}
    for e in requete.order_by(ComplianceItem.project_id, ComplianceItem.id).all():
        # « sans ancre » lu en Python, comme calculer_et_stocker : un JSON null vaut une ancre absente
        if e.ancre is None and (e.source_excerpt or "").strip():
            par_projet.setdefault(e.project_id, []).append(e)
    return par_projet


def _pieces_a_lire(db, project_id: str, exigences) -> tuple[set, int]:
    """Les pièces lisibles citées par ces exigences, et le nombre d'exigences sans pièce lisible
    (même règle que ``calculer_et_stocker``)."""
    from models.project import ProjectDocument
    from services import ancres_projet

    pieces = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    lots = ancres_projet._lots_du_rc(db, project_id)
    lues: set = set()
    sans = 0
    for e in exigences:
        piece = ancres_projet.trouver_piece(e.source_document, pieces, e.lot, lots)
        if piece is None or (ancres_projet.chemin_tableur(piece) or ancres_projet.chemin_pdf(piece)) is None:
            sans += 1
        else:
            lues.add(piece.id)
    return lues, sans


def examiner(db, projet: Optional[str] = None, ecrire: bool = False,
             sortie: Callable[[str], None] = print) -> Bilan:
    from services import ancres_projet

    bilan = Bilan()
    debut = time.monotonic()
    for project_id, exigences in _sans_ancre(db, projet).items():
        lues, sans = _pieces_a_lire(db, project_id, exigences)
        bilan.projets += 1
        bilan.exigences += len(exigences)
        bilan.pieces += len(lues)
        bilan.sans_piece += sans
        if not ecrire or not lues:
            continue
        t0 = time.monotonic()
        compte = ancres_projet.calculer_et_stocker(db, project_id, exigences)
        for cle in ("ancres", "passage", "page", "aucune", "echecs"):
            setattr(bilan, cle, getattr(bilan, cle) + compte.get(cle, 0))
        sortie(f"  AO {project_id[:8]} : {compte.get('pieces', 0)} pièce(s), {compte.get('ancres', 0)} ancre(s), "
               f"{compte.get('echecs', 0)} échec(s), {time.monotonic() - t0:.1f} s")
    bilan.secondes = time.monotonic() - debut
    return bilan


def afficher(bilan: Bilan, ecrire: bool, sortie: Callable[[str], None] = print) -> None:
    sortie(f"  AO concernés : {bilan.projets}")
    sortie(f"  exigences sourcées sans ancre : {bilan.exigences}")
    sortie(f"  pièces à lire : {bilan.pieces}")
    sortie(f"  exigences sans pièce lisible (gardent la page citée) : {bilan.sans_piece}")
    if ecrire:
        sortie(f"  ancres rangées : {bilan.ancres} (passage {bilan.passage}, page {bilan.page}, "
               f"sans passage ni page {bilan.aucune})")
        sortie(f"  pièces en échec : {bilan.echecs}")
    sortie(f"  durée : {bilan.secondes:.1f} s")


def main(argv: Optional[List[str]] = None) -> int:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = a.add_mutually_exclusive_group()
    mode.add_argument("--simulation", action="store_true",
                      help="compte seulement, rien n'est calculé ni écrit (par défaut)")
    mode.add_argument("--ecrire", action="store_true", help="calcule et range les ancres manquantes")
    a.add_argument("--projet", help="limite à un AO (id)")
    args = a.parse_args(argv)

    from database import SessionLocal
    from services import pdfium_processus

    print("Ancres des anciens AO — " + ("calcul et écriture des ancres manquantes." if args.ecrire
                                        else "simulation : rien n'est calculé ni écrit."))
    db = SessionLocal()
    try:
        bilan = examiner(db, projet=args.projet, ecrire=args.ecrire)
    finally:
        db.close()
        pdfium_processus.arreter()
    afficher(bilan, args.ecrire)
    return 0


if __name__ == "__main__":
    sys.exit(main())
