"""Banc hors CI de l'ancrage des sources, sur des exigences réelles jugées à la main.

    cd backend && venv/bin/python scripts/banc_ancrage.py --verite <vérité.json> [--env <.env>] [--detail]

- Vérité : fichier JSON HORS DU DÉPÔT (aucune donnée réelle n'entre dans le
  dépôt), passé par --verite : {"projet", "lot", "reference_fin_bloc1",
  "exigences": [{"id", "verdict_g2", "sources": [{"piece": SHA-256 du texte de
  la pièce, "debut", "fin"}]}]}.
- Base : DATABASE_URL de backend/.env, ou du fichier donné par --env (depuis
  une copie de travail ; l'URL n'est jamais affichée), connexion forcée en
  LECTURE SEULE (default_transaction_read_only). Aucun appel payant. N'importe
  pas `main`.
- Hors pytest, les réglages de l'appli sont exigés à l'import : passer des valeurs
  factices (DEBUG=true SECRET_KEY=… ANTHROPIC_API_KEY=… DATABASE_URL=sqlite:///:memory:).
  La vraie base n'est lue que par --env.
- Périmètre : les pièces que l'IA a reçues pour le lot, comme l'analyse
  (passe 1 : RC, CCAP, AE ; passe 2 : CCTP et DPGF de get_documents_for_lot).
- Deux entrées, quand l'extrait d'origine de l'IA n'est pas conservé :
    « exigence » : le texte de l'exigence sert d'extrait (paraphrase) ;
    « extrait »  : l'extrait enregistré est ancré de nouveau.
  La pièce est désignée par son type (« CCTP », « RC »…), comme le fait souvent l'IA.
- Juste : le passage rendu chevauche une source juste (≥ 50 % du plus court).
  Précision = justes / (justes + faux) ; rappel = justes / exigences.
"""
import hashlib
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import dotenv_values  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from services.ai.excerpt_anchor import anchor_requirements  # noqa: E402
from services.document_tagger import get_documents_for_lot  # noqa: E402

TYPES = ("rc", "ccap", "acte_engagement", "cctp", "dpgf", "acte_engagement_template", "dpgf_template")


def _connexion():
    env = Path(sys.argv[sys.argv.index("--env") + 1]) if "--env" in sys.argv else BACKEND / ".env"
    url = dotenv_values(env).get("DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL absente")
    moteur = create_engine(url, connect_args={"options": "-c default_transaction_read_only=on"})
    conn = moteur.connect()
    assert conn.execute(text("SHOW default_transaction_read_only")).scalar() == "on", "connexion pas en lecture seule"
    return conn


def main() -> None:
    if "--verite" not in sys.argv:
        sys.exit("usage : banc_ancrage.py --verite <vérité.json hors du dépôt> [--env <.env>] [--detail]")
    verite = json.loads(Path(sys.argv[sys.argv.index("--verite") + 1]).read_text(encoding="utf-8"))
    conn = _connexion()
    try:
        docs = [SimpleNamespace(**dict(r._mapping)) for r in conn.execute(text(
            "select file_name, type, related_lots, extracted_text from project_documents where project_id = :p"),
            {"p": verite["projet"]})]
        lignes = {r.id: r for r in conn.execute(text(
            "select id, exigence_text, source_document, source_excerpt from compliance_items "
            "where project_id = :p"), {"p": verite["projet"]})}
    finally:
        conn.close()
    docs = [d for d in docs if (d.type or "autre") in TYPES and d.extracted_text and len(d.extracted_text) >= 50
            and not d.extracted_text.startswith("[document volumineux")]
    textes = {d.file_name: d.extracted_text for d in docs}
    par_empreinte: dict = {}   # une empreinte peut désigner plusieurs pièces au même texte (copies)
    for n, t in textes.items():
        par_empreinte.setdefault(hashlib.sha256(t.encode("utf-8")).hexdigest(), []).append(n)
    cible = verite["lot"].removeprefix("lot")
    perimetre = ([d for d in docs if d.type in ("rc", "ccap", "acte_engagement")]
                 + [d for d in get_documents_for_lot(docs, verite["lot"]) if d.type in ("cctp", "dpgf")])
    rangs = {d.file_name: (0 if any(str(x).lstrip("0") == cible for x in (d.related_lots or [])) else 1)
             for d in perimetre}
    pieces = {n: textes[n] for n in rangs}

    exigences, inconnues = [], 0
    for e in verite["exigences"]:
        ligne = lignes.get(e["id"])
        if ligne is None:
            sys.exit(f"exigence {e['id']} absente de la base")
        sources = []
        for s in e["sources"]:
            noms = par_empreinte.get(s["piece"])
            if not noms:
                inconnues += 1          # texte de la pièce changé : source ignorée
            for nom in noms or ():
                sources.append((nom, s["debut"], s["fin"]))
        typ = next((d.type for d in docs if d.file_name == ligne.source_document), "cctp")
        exigences.append((ligne, typ.split("_")[0].upper(), sources))
    if inconnues:
        print(f"attention : {inconnues} sources dans une pièce dont le texte a changé (ignorées)")

    def juge(nom, extrait, sources):
        if not extrait:
            return "aucun"
        t = textes.get(nom) or next((textes[n] for n in sorted(pieces) if extrait in textes[n]), None)
        if t is None:
            return "faux"
        nom = nom if nom in textes else next(n for n in sorted(pieces) if extrait in textes[n])
        for m in re.finditer(re.escape(extrait), t):
            a, b = m.start(), m.end()
            for n2, va, vb in sources:
                if n2 == nom and max(0, min(b, vb) - max(a, va)) / max(1, min(b - a, vb - va)) >= 0.5:
                    return "juste"
        return "faux"

    print(f"{len(exigences)} exigences ; périmètre : {len(pieces)} pièces")
    for mode in ("exigence", "extrait"):
        reqs = [{"exigence": l.exigence_text, "source_document": desig, "source_page": None,
                 "source_excerpt": l.exigence_text if mode == "exigence" else l.source_excerpt}
                for l, desig, _s in exigences]
        anchor_requirements(reqs, pieces, rangs)
        verdicts = [juge(r["source_document"], r["source_excerpt"], s) for r, (_l, _d, s) in zip(reqs, exigences)]
        c = Counter(verdicts)
        precision = c["juste"] / max(c["juste"] + c["faux"], 1)
        ref = verite["reference_fin_bloc1"][mode]
        print(f"{mode:9s} justes {c['juste']:2d}  faux {c['faux']:2d}  aucun {c['aucun']:2d}  "
              f"précision {precision:.3f}  rappel {c['juste'] / len(exigences):.3f}   "
              f"(fin du bloc 1 : précision {ref['precision']:.3f}, rappel {ref['rappel']:.3f})")
        if "--detail" in sys.argv:
            for k, (v, r) in enumerate(zip(verdicts, reqs), 1):
                print(f"   n{k:02d} {v:6s} {r.get('ancrage_niveau')!s:10s} {r.get('ancrage_score')}")


if __name__ == "__main__":
    main()
