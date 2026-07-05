"""
Ingestion du corpus réglementaire — Code de la commande publique.

Usage :
    cd backend && source venv/bin/activate
    python -u scripts/ingest_ccp.py

Idempotent : ré-exécution = upsert des mêmes lignes (index unique 0017),
contextes Haiku existants réutilisés (pas de coût redondant).
"""
import logging
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)

from database import SessionLocal  # noqa: E402
from services.rag.ingest_ccp import ingest_ccp  # noqa: E402

PDF = BACKEND / "rag_corpus" / "reglementation-marches-publics" / \
    "Code de la commande publique.pdf"


def main() -> int:
    db = SessionLocal()
    try:
        result = ingest_ccp(db, PDF)
        print(f"\nRÉSULTAT : {result['articles']} articles indexés "
              f"({result['contextes']} avec contexte) — édition {result['version']}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
