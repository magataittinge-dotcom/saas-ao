"""Synchronisation manuelle de la veille BOAMP (local, sans Celery).

Usage :
    cd backend && python scripts/synchroniser_veille.py [--depuis YYYY-MM-DD] [--limite N] [--simulation]

--simulation : lit l'API et la base, compte ce qui serait créé / mis à jour / supprimé, n'écrit rien.
Rejouable sans doublon. N'importe jamais `main` (donc ne lance pas la réconciliation de l'application).
"""
import argparse
import json
import logging
import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)

from database import SessionLocal  # noqa: E402
from services.veille.boamp_sync import ErreurBoamp, synchroniser  # noqa: E402


def lire_date(texte: str) -> date:
    try:
        return date.fromisoformat(texte)
    except ValueError:
        raise argparse.ArgumentTypeError(f"date attendue au format AAAA-MM-JJ : {texte!r}")


def main(argv=None) -> int:
    parseur = argparse.ArgumentParser(description="Synchronise les avis de marché du BOAMP (veille).")
    parseur.add_argument("--depuis", type=lire_date, help="premier jour de parution lu (défaut : dernier passage, sinon J-45)")
    parseur.add_argument("--limite", type=int, help="nombre maximal d'avis retenus (essais)")
    parseur.add_argument("--simulation", action="store_true", help="n'écrit rien, compte seulement")
    args = parseur.parse_args(argv)
    db = SessionLocal()
    try:
        resultat = synchroniser(db, depuis=args.depuis, limite=args.limite, simulation=args.simulation)
    except ErreurBoamp as exc:
        print(f"Synchronisation interrompue : {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()
    print(json.dumps(resultat.en_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
