"""
Golden set RAG (Lot 7 T2) — 12 questions réglementaires réelles.

CHAQUE couple (question → article attendu) a été VÉRIFIÉ dans le corpus
ingéré (verbatim du PDF Code de la commande publique, édition 2026-06-19)
avant d'être écrit ici — jamais de mémoire LLM comme source. Extraits de
vérification en commentaire.

Critère : ≥ 10/12 avec l'article attendu au TOP-3 du retriever hybride.
Score par question affiché au terminal (-s).

Test d'INTÉGRATION : Postgres dev (corpus 1793 chunks) + API Voyage réelle.
Skip automatique si l'un des deux est indisponible (CI sans clé/corpus).
"""
import os
import time

import pytest

# (question, article attendu, extrait de vérification lu en base)
GOLDEN = [
    ("Quel est l'objet de la retenue de garantie ?", "R2191-32",
     "a pour seul objet de couvrir les réserves formulées à la réception"),
    ("Quel est le délai de paiement pour les pouvoirs adjudicateurs ?", "R2192-10",
     "fixé à trente jours pour les pouvoirs adjudicateurs"),
    ("Quels sont les cas d'exclusion de plein droit de la procédure de passation ?", "L2141-1",
     "Sont exclues de la procédure de passation des marchés les personnes"),
    ("Quel est le montant maximal de la retenue de garantie ?", "R2191-33",
     "ne peut être supérieur à 5 % du montant initial du marché"),
    ("À partir de quel montant l'avance est-elle obligatoire ?", "R2191-3",
     "accorde une avance au titulaire d'un marché lorsque le montant initial du marché est supérieur à 50"),
    ("Le sous-traitant a-t-il droit au paiement direct ?", "L2193-11",
     "est payé directement par lui pour la part du marché dont il assure l'exécution"),
    ("Que doit produire le candidat à l'appui de sa candidature ?", "R2143-3",
     "Le candidat produit à l'appui de sa candidature"),
    ("Qu'est-ce qu'une offre anormalement basse ?", "L2152-5",
     "offre dont le prix est manifestement sous-évalué"),
    ("Quel est le taux des intérêts moratoires en cas de retard de paiement ?", "R2192-31",
     "taux d'intérêt appliqué par la Banque centrale européenne"),
    ("Peut-on remplacer la retenue de garantie par une garantie à première demande ?", "R2191-36",
     "substituer à la retenue de garan"),
    ("Quand peut-on passer un marché sans publicité ni mise en concurrence préalables ?", "R2122-8",
     "sans publicité ni mise en concurrence préalables pour répondre à un besoin"),
    ("Sur quels critères l'acheteur attribue-t-il le marché à l'offre économiquement la plus avantageuse ?", "R2152-7",
     "l'offre\néconomiquement la plus avantageuse, l'acheteur se fonde"),
]

TOP_N = 3
MIN_HITS = 10


def _dev_engine():
    import sqlalchemy
    from dotenv import dotenv_values
    from pathlib import Path
    url = dotenv_values(Path(__file__).resolve().parent.parent / ".env").get("DATABASE_URL", "")
    if not url.startswith("postgresql"):
        return None
    try:
        eng = sqlalchemy.create_engine(url)
        with eng.connect() as c:
            n = c.execute(sqlalchemy.text(
                "SELECT count(*) FROM rag_chunks WHERE embedding IS NOT NULL")).scalar()
        return eng if n and n > 1000 else None
    except Exception:
        return None


def test_golden_set_top3():
    from dotenv import dotenv_values
    from pathlib import Path
    env = dotenv_values(Path(__file__).resolve().parent.parent / ".env")
    if not env.get("VOYAGE_API_KEY"):
        pytest.skip("VOYAGE_API_KEY absente")
    eng = _dev_engine()
    if eng is None:
        pytest.skip("corpus rag_chunks indisponible")
    os.environ.setdefault("VOYAGE_API_KEY", env["VOYAGE_API_KEY"])

    from sqlalchemy.orm import Session
    from services.rag.retriever import retrieve

    hits = 0
    lines = []
    with Session(eng) as db:
        for i, (question, expected, verification) in enumerate(GOLDEN):
            # L'extrait de vérification doit exister en base (garde-fou :
            # si le corpus change d'édition, le golden se re-vérifie).
            import sqlalchemy
            row = db.execute(sqlalchemy.text(
                "SELECT contenu FROM rag_chunks WHERE article_ref = :r"), {"r": expected}).fetchone()
            assert row is not None, f"{expected} absent du corpus"
            assert verification.replace("\n", " ") in row[0].replace("\n", " "), \
                f"{expected} : extrait de vérification introuvable (édition changée ?)"

            results = retrieve(db, question, top_k=5)
            top = [r["article_ref"] for r in results]
            rank = top.index(expected) + 1 if expected in top else None
            ok = rank is not None and rank <= TOP_N
            hits += ok
            lines.append(f"  {'✓' if ok else '✗'} {expected:<9} rang={rank or '—':<3} {question}")
            if i < len(GOLDEN) - 1:
                time.sleep(21)  # RPM tier gratuit Voyage

    print(f"\nGOLDEN SET — {hits}/{len(GOLDEN)} au top-{TOP_N} :")
    print("\n".join(lines))
    assert hits >= MIN_HITS, f"golden : {hits}/{len(GOLDEN)} < {MIN_HITS}"
